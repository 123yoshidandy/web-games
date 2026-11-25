/**
 * クワークル（基本ゲーム）の進行（2〜4人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋の並びはシードから決まる）
 *
 * ルール（MindWare の公式ルール）
 * - 108枚（6色×6形×3枚）を袋に入れ、各自6枚ずつ引く
 * - 同じ色か同じ形で重複のない組を、一番多く持つ人から始める。その組を置いて始める
 * - 手番では、タイルを置くか、交換する
 *   - 置く：同じ色か同じ形で重複のないタイルを1枚以上、1本の線の上に置く（互いに触れていなくてよいが、列としてつながる）。すでにあるタイルに接する
 *   - 列は、同じ色で形が違うか、同じ形で色が違うタイルだけ。6枚まで
 *   - 得点：できた列・伸ばした列ごとに、その列の枚数。6枚の列（クワークル）は +6
 *   - 置いたら6枚まで引く
 *   - 交換：好きな枚数を脇に置き、同じ枚数を引いてから、脇のタイルを袋に戻す（袋の枚数まで）
 * - 袋が空になったあと、最初に手札を出し切った人が +6 で、そこで終わる
 *
 * 自分で決めた点（README の「資料で分からない点の決め方」）
 * - 最初の手番の組が同じ数なら、席の順（あなたが先）。公式は「年上の人」
 * - 何もない盤に1枚だけ置いたら1点
 * - 置けず交換もできない（袋が空）ときは、パスする。全員が続けてパスしたら終わる（手札を出し切った人の +6 はなし）
 */

import { createRandom, shuffle } from './random.js';
import {
    TILE_COUNT, HAND_SIZE, END_BONUS, keyOf, checkPlacements, generateMoves, largestSet, tileName, kindOf
} from './board.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const LEVELS = ['easy', 'normal'];
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    play: ['placements'],
    trade: ['tiles'],
    pass: []
};
const MAX_LOGS = 300;

export default class Game {
    // players: [{ name, isCPU, level }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.bag = shuffle(Array.from({ length: TILE_COUNT }, (_, i) => i), this.random);
        this.players = players.map((p, id) => ({
            id,
            name: String(p.name ?? `プレイヤー${id + 1}`),
            isCPU: !!p.isCPU,
            level: LEVELS.includes(p.level) ? p.level : 'normal',
            hand: this.bag.splice(0, HAND_SIZE),
            score: 0
        }));
        this.board = new Map();
        this.placed = [];            // 置いた順のタイル：{ x, y, tile, seat, turn }
        this.turnNo = 1;
        this.phase = 'play';
        this.passes = 0;
        this.winners = [];
        this.endReason = null;
        this.lastMove = null;        // 直前の手：{ seat, type, cells, score, qwirkles, count }
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        // 最初の手番：一番大きな組を持つ人（同じなら席の順）
        const sizes = this.players.map(p => largestSet(p.hand));
        this.firstSize = Math.max(...sizes);
        this.current = sizes.indexOf(this.firstSize);
        this.log(`${this.players[this.current].name}から始めます（${this.firstSize}枚の組）`, { head: true });
    }

    isOver() { return this.phase === 'end'; }
    actors() { return this.phase === 'end' ? [] : [this.current]; }
    isFirstMove() { return this.board.size === 0; }

    // その人が置ける手（パスできるかの判定や CPU に使う）
    movesFor(seat) {
        return generateMoves(this.board, this.players[seat].hand, { firstSize: this.isFirstMove() ? this.firstSize : null });
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        const recorded = { type: command.type };
        if (command.type === 'play') {
            recorded.placements = Array.isArray(command.placements)
                ? command.placements.map(p => ({ x: p?.x, y: p?.y, tile: p?.tile })) : command.placements;
        }
        if (command.type === 'trade') recorded.tiles = Array.isArray(command.tiles) ? [...command.tiles] : command.tiles;
        const error = this.commandError(playerId, recorded);
        if (error) return this.fail(error);
        this.commands.push({ playerId, command: structuredClone(recorded) });
        this.execute(playerId, recorded);
        return true;
    }

    // 手札にそのタイルがすべてあるか（同じタイルを2回使っていないか）
    static holds(hand, tiles) {
        const rest = [...hand];
        for (const t of tiles) {
            const i = rest.indexOf(t);
            if (i < 0) return false;
            rest.splice(i, 1);
        }
        return true;
    }

    commandError(seat, command) {
        const p = this.players[seat];
        switch (command.type) {
            case 'play': {
                const placements = command.placements;
                if (!Array.isArray(placements) || !placements.length) return '置くタイルを選びます';
                if (!Game.holds(p.hand, placements.map(x => x?.tile))) return 'そのタイルは持っていません';
                const result = checkPlacements(this.board, placements, { firstSize: this.isFirstMove() ? this.firstSize : null });
                return result.ok ? null : result.error;
            }
            case 'trade': {
                const tiles = command.tiles;
                if (this.isFirstMove()) return '最初の手番は、そろった組を置きます';
                if (!Array.isArray(tiles) || !tiles.length) return '交換するタイルを選びます';
                if (!Game.holds(p.hand, tiles)) return 'そのタイルは持っていません';
                if (tiles.length > this.bag.length) return `袋には${this.bag.length}枚しかありません`;
                return null;
            }
            case 'pass':
                if (this.bag.length > 0) return '置けないときは交換します';
                return this.movesFor(seat).length ? 'まだ置けるタイルがあります' : null;
        }
        return '操作が正しくありません';
    }

    execute(seat, command) {
        const p = this.players[seat];
        if (command.type === 'play') {
            const result = checkPlacements(this.board, command.placements);
            command.placements.forEach(({ x, y, tile }) => {
                this.board.set(keyOf(x, y), tile);
                this.placed.push({ x, y, tile, seat, turn: this.turnNo });
                p.hand.splice(p.hand.indexOf(tile), 1);
            });
            let score = result.score;
            p.score += score;
            this.passes = 0;
            const drawn = this.bag.splice(0, HAND_SIZE - p.hand.length);
            p.hand.push(...drawn);
            const n = command.placements.length;
            this.log(`${p.name}が${n}枚置いて${score}点${result.qwirkles ? '（クワークル！）' : ''}`, { head: result.qwirkles > 0 });
            this.lastMove = { seat, type: 'play', cells: command.placements.map(({ x, y }) => ({ x, y })), score, qwirkles: result.qwirkles, count: n };
            this.emit({ type: 'play', seat, cells: this.lastMove.cells, score, qwirkles: result.qwirkles });
            if (p.hand.length === 0 && this.bag.length === 0) {
                p.score += END_BONUS;
                this.lastMove.score += END_BONUS;
                this.log(`${p.name}が手札を出し切りました（+${END_BONUS}点）`, { head: true });
                this.finish('out');
                return;
            }
        } else if (command.type === 'trade') {
            command.tiles.forEach(t => p.hand.splice(p.hand.indexOf(t), 1));
            p.hand.push(...this.bag.splice(0, command.tiles.length));
            this.bag.push(...command.tiles);
            shuffle(this.bag, this.random);
            this.passes = 0;
            this.log(`${p.name}が${command.tiles.length}枚交換しました`);
            this.lastMove = { seat, type: 'trade', cells: [], score: 0, qwirkles: 0, count: command.tiles.length };
            this.emit({ type: 'trade', seat, count: command.tiles.length });
        } else {
            this.passes++;
            this.log(`${p.name}はパス`);
            this.lastMove = { seat, type: 'pass', cells: [], score: 0, qwirkles: 0, count: 0 };
            this.emit({ type: 'pass', seat });
            if (this.passes >= this.players.length) {
                this.log('誰も置けなくなりました', { head: true });
                this.finish('stuck');
                return;
            }
        }
        this.current = (this.current + 1) % this.players.length;
        this.turnNo++;
    }

    finish(reason) {
        this.phase = 'end';
        this.endReason = reason;
        const best = Math.max(...this.players.map(p => p.score));
        this.winners = this.players.filter(p => p.score === best).map(p => p.id);
        this.log(`${this.winners.map(s => this.players[s].name).join('・')}の勝ち（${best}点）`, { head: true });
        this.emit({ type: 'end', winners: [...this.winners] });
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > 100) this.events.splice(0, this.events.length - 100);
    }

    log(text, { head = false } = {}) {
        this.logs.push({ n: ++this.logTotal, text, head });
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, level: p.level })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${i} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}

export { tileName, kindOf };
