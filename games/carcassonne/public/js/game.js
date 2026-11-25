/**
 * カルカソンヌのゲーム本体（基本セット、第2版の得点）
 * DOM に依存しない。操作は applyCommand(seat, command) の 1 か所から受け付け、受け付けた操作だけを commands に記録する
 * Game.replay(players, options, commands) で、同じ状態を作り直せる
 *
 * 操作：
 *   { type: 'play', x, y, rot, meeple }  引いたタイルを (x, y) に rot の向きで置き、要素 meeple にコマを置く（置かないなら null）
 */

import { Board, majority, regionPoints, cellKey } from './board.js';
import { bagTiles, rotatedTile, START_TILE, MEEPLES_PER_PLAYER } from './tiles.js';
import { createRandom, createSeed, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const EVENT_KEEP = 120; // 画面の演出のために残す、最近のイベントの数

const emptyBreakdown = () => ({ road: 0, city: 0, monastery: 0, field: 0 });

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, cpuLevel }（cpuLevel などルールに関係しない値は、記録と一緒に残すだけ）
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        const seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { ...options, seed };
        this.players = players.map((p, id) => ({
            id, name: p.name, isCPU: !!p.isCPU, score: 0, meeples: MEEPLES_PER_PLAYER, breakdown: emptyBreakdown()
        }));
        const random = createRandom(seed);
        this.bag = shuffle(bagTiles(), random);
        this.current = Math.floor(random() * players.length);
        this.board = new Board();
        this.board.place(0, 0, START_TILE, 0);
        this.lastPlaced = { x: 0, y: 0 };
        this.phase = 'play';
        this.tile = null;
        this.turn = 0;
        this.discarded = [];
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.drawTile();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ seat, command }, i) => {
            if (!game.applyCommand(seat, command)) throw new Error(`記録の ${i} 番目の操作を再現できません：${game.lastError}`);
        });
        return game;
    }

    isOver() {
        return this.phase === 'end';
    }

    addEvent(event) {
        this.eventSeq++;
        this.events.push({ seq: this.eventSeq, ...event });
        if (this.events.length > EVENT_KEEP) this.events.splice(0, this.events.length - EVENT_KEEP);
    }

    // 袋からタイルを引く。どこにも置けないタイルは取り除き、引き直す（袋が空になったら終了）
    drawTile() {
        this.tile = null;
        while (this.bag.length > 0) {
            const type = this.bag.pop();
            if (this.board.hasPlacement(type)) {
                this.tile = type;
                this.turn++;
                return;
            }
            this.discarded.push(type);
            this.addEvent({ type: 'discard', seat: this.current, tile: type });
        }
        this.finish();
    }

    // 今のタイルを置ける場所・向きと、そこでコマを置ける要素
    placementOptions() {
        if (this.phase !== 'play' || !this.tile) return [];
        const canMeeple = this.players[this.current].meeples > 0;
        return this.board.placements(this.tile).map(p => ({
            ...p, meeples: canMeeple ? this.board.meepleOptions(this.tile, p.rot, p.x, p.y) : []
        }));
    }

    // 断る理由（受け付けるなら null）。状態は変えない
    validate(seat, command) {
        if (!command || typeof command !== 'object') return '操作の形が正しくありません';
        if (this.phase !== 'play') return 'ゲームは終わっています';
        if (seat !== this.current) return '手番ではありません';
        if (command.type !== 'play') return '知らない操作です';
        const { x, y, rot } = command;
        const meeple = command.meeple ?? null;
        if (!Number.isInteger(x) || !Number.isInteger(y) || ![0, 1, 2, 3].includes(rot)) return '置く場所が正しくありません';
        if (!this.board.canPlace(this.tile, rot, x, y)) return 'そこには置けません';
        if (meeple !== null) {
            if (!Number.isInteger(meeple) || meeple < 0 || meeple >= rotatedTile(this.tile, rot).features.length) return 'コマを置く場所が正しくありません';
            if (this.players[seat].meeples <= 0) return 'コマが残っていません';
            if (!this.board.meepleOptions(this.tile, rot, x, y).includes(meeple)) return 'ほかのコマがいる場所には置けません';
        }
        return null;
    }

    applyCommand(seat, command) {
        this.lastError = this.validate(seat, command);
        if (this.lastError) return false;
        const { x, y, rot } = command;
        const meeple = command.meeple ?? null;
        this.commands.push({ seat, command: { type: 'play', x, y, rot, meeple } });
        this.play(seat, x, y, rot, meeple);
        return true;
    }

    play(seat, x, y, rot, meeple) {
        const type = this.tile;
        const player = this.players[seat];
        this.board.place(x, y, type, rot, meeple === null ? null : { seat, feature: meeple });
        if (meeple !== null) player.meeples--;
        this.lastPlaced = { x, y };
        this.addEvent({ type: 'place', seat, x, y, tile: type, rot, meeple });
        this.scoreCompleted(x, y);
        this.tile = null;
        if (this.bag.length === 0) {
            this.finish();
            return;
        }
        this.current = (this.current + 1) % this.players.length;
        this.drawTile();
    }

    // 置いたタイルで完成した道・都市・修道院を数え、コマを戻す
    scoreCompleted(x, y) {
        const cell = this.board.get(x, y);
        const done = new Set();
        cell.shape.features.forEach((f, fi) => {
            if (f.kind !== 'road' && f.kind !== 'city') return;
            const region = this.board.region(x, y, fi);
            if (!region.complete || done.has(region.id)) return;
            done.add(region.id);
            this.scoreRegion(region, false);
        });
        // 置いたタイルと、周りの 8 マスの修道院
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const c = this.board.get(x + dx, y + dy);
                if (!c) continue;
                c.shape.features.forEach((f, fi) => {
                    if (f.kind !== 'monastery') return;
                    const region = this.board.region(c.x, c.y, fi);
                    if (region.complete && region.meeples.length > 0) this.scoreRegion(region, false);
                });
            }
        }
    }

    // 領域を数える。完成した領域（試合中）は、コマを持ち主に戻す
    scoreRegion(region, final, completedCities = 0) {
        const winners = majority(region.meeples);
        const points = regionPoints(region, { completedCities });
        if (winners.length > 0 && points > 0) {
            winners.forEach(seat => {
                this.players[seat].score += points;
                this.players[seat].breakdown[region.kind] += points;
            });
        }
        const returned = final ? [] : region.meeples;
        returned.forEach(m => {
            this.board.get(m.x, m.y).meeple = null;
            this.players[m.seat].meeples++;
        });
        if (region.meeples.length === 0) return;
        this.addEvent({
            type: 'score', kind: region.kind, final, complete: region.complete, points, winners,
            cells: [...region.cells].map(k => k.split(',').map(Number)),
            meeples: region.meeples.map(m => ({ ...m })), returned: returned.length > 0
        });
    }

    // ゲーム終了：未完成の道・都市・修道院と、草原を数える
    finish() {
        this.phase = 'end';
        this.tile = null;
        const cityCache = new Map();
        const done = new Set();
        const regions = [];
        for (const cell of this.board.cells.values()) {
            if (!cell.meeple) continue;
            const region = this.board.region(cell.x, cell.y, cell.meeple.feature);
            if (done.has(region.id)) continue;
            done.add(region.id);
            regions.push(region);
        }
        // 道・都市・修道院 → 草原 の順に見せる
        const order = { road: 0, city: 1, monastery: 2, field: 3 };
        regions.sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id));
        regions.forEach(region => {
            const completedCities = region.kind === 'field' ? this.board.completedCitiesOf(region, cityCache) : 0;
            this.scoreRegion(region, true, completedCities);
        });
        this.addEvent({ type: 'end', ranking: this.ranking() });
    }

    // 順位（同点は同じ順位。第2版では同点は勝ちを分け合う）
    ranking() {
        const sorted = [...this.players].sort((a, b) => b.score - a.score || a.id - b.id);
        return sorted.map(p => ({ seat: p.id, score: p.score, rank: 1 + sorted.filter(q => q.score > p.score).length }));
    }

    winners() {
        if (!this.isOver()) return [];
        return this.ranking().filter(r => r.rank === 1).map(r => r.seat);
    }
}

export { cellKey };
