/**
 * カートグラファーのゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びはシードから決まる）
 *
 * ルール（基本ゲーム。1〜4人）
 * - 準備: 各自が地図（A 面。山5つ・廃墟6つ）を持つ。得点カードを4つの組から1枚ずつ引き、王の勅令 A〜D の下にランダムに置く
 * - 季節: 春（8）・夏（8）・秋（7）・冬（6）。探索カードの時間の合計が季節の長さに達したら、その季節は終わる
 *         季節ごとに、探索カード13枚と襲撃カード1枚（前の季節に出なかった襲撃カードも）を混ぜて山札にする
 * - 探索カード: 全員が同じカードを、それぞれの地図に描く。形と地形の組を1つ選び、回転・裏返しして、空いたマスに描く
 *               コインのつく形を描いたら、コインを1枚得る
 *               どの組も描けないときは、山以外の好きな地形を 1×1 で空いたマスに描く
 * - 廃墟のカード: すぐ次のカードをめくる。次の探索カードの形は、空いた廃墟のマスにかかるように描く。
 *                 廃墟にかけられない（空いた廃墟が残っていない場合も）ときは、1×1 を好きな空いたマスに描く。
 *                 間に襲撃カードが出ても、この条件は次の探索カードまで続く
 * - 襲撃カード: 多人数では、カードの矢印の向きに地図を渡し、隣の人が異形の形をその地図に描く（回転・裏返ししてよい）。
 *               ソロでは、カードに示された角から矢印の向きに地図の端に沿って、回さずに描ける最初の場所に描く（なければ1列内側へ）。
 *               どこにも描けなければ、そのカードは無視する。使った襲撃カードは取り除く
 * - 山: 上下左右の4マスがすべて埋まったら、コインを1枚得る
 * - 季節の得点: その季節の勅令2つ＋コインの数−異形に接する空きマスの数
 * - 冬の得点のあと、合計の多い人の勝ち。同点なら異形の減点の合計が少ない人。それも同じなら、全員の勝ち
 *
 * ルールに書かれていないので、次のように決めた
 * - 席は時計回りに並ぶとし、時計回りの矢印では、右隣の人の地図に描く（地図を左へ渡すため）
 * - ソロの最終の評価（得点カードの角の数を引いた称号）は入れていない
 */

import { createRandom, shuffle } from './random.js';
import {
    SIZE, TERRAINS, TERRAIN_NAMES, MOUNTAINS, EXPLORE_CARDS, RUINS_CARDS, AMBUSH_CARDS, EDICT_CARDS, EDICT_GROUPS,
    SEASONS, exploreCard, ambushCard, ruinsCard, edictCard
} from './cards.js';
import { CELLS, RUIN_SET, scoreEdict, monsterPenalty, surroundedMountains } from './scoring.js';
import { matchesShape, allPlacements, normalize, sizeOf, placeAt } from './shapes.js';

export { SIZE, CELLS, TERRAINS, TERRAIN_NAMES, SEASONS, RUIN_SET };

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 200;
const MAX_EVENTS = 60;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { place: ['variant', 'cells', 'fallback', 'terrain'], monster: ['cells'] };

export const newBoard = () => {
    const board = new Array(CELLS).fill(null);
    MOUNTAINS.forEach(([r, c]) => { board[r * SIZE + c] = 'mountain'; });
    return board;
};

// 空いた廃墟のマスがあるか
export const openRuins = (board) => [...RUIN_SET].filter(cell => board[cell] === null);

// 探索カードの組ごとの置き方。ruins：廃墟にかける必要があるとき
export function legalPlacements(board, shapeCells, { ruins = false, rotations = true } = {}) {
    const placements = allPlacements(shapeCells, cell => board[cell] === null, { rotations });
    return ruins ? placements.filter(cells => cells.some(cell => RUIN_SET.has(cell))) : placements;
}

// 探索カードで、どの組も描けず 1×1 にするしかないか
export function mustFallback(board, card, ruins) {
    if (ruins && openRuins(board).length === 0) return true;
    return card.variants.every(v => legalPlacements(board, v.cells, { ruins }).length === 0);
}

// ソロの襲撃：角から矢印の向きに、端に沿って順に試す左上の位置の並び
export function soloScanOrder(card) {
    const [h, w] = sizeOf(normalize(card.cells));
    const maxR = SIZE - h, maxC = SIZE - w;
    const order = [];
    const along = (outer, inner, at) => {
        for (let d = 0; d <= outer; d++) for (let i = 0; i <= inner; i++) order.push(at(d, i));
    };
    const key = `${card.corner}:${card.clockwise ? 'cw' : 'ccw'}`;
    switch (key) {
    case 'top-left:cw': along(maxR, maxC, (d, i) => [d, i]); break;              // 上の端を右へ
    case 'top-left:ccw': along(maxC, maxR, (d, i) => [i, d]); break;             // 左の端を下へ
    case 'top-right:cw': along(maxC, maxR, (d, i) => [i, maxC - d]); break;      // 右の端を下へ
    case 'top-right:ccw': along(maxR, maxC, (d, i) => [d, maxC - i]); break;     // 上の端を左へ
    case 'bottom-left:cw': along(maxC, maxR, (d, i) => [maxR - i, d]); break;    // 左の端を上へ
    case 'bottom-left:ccw': along(maxR, maxC, (d, i) => [maxR - d, i]); break;   // 下の端を右へ
    case 'bottom-right:cw': along(maxR, maxC, (d, i) => [maxR - d, maxC - i]); break; // 下の端を左へ
    case 'bottom-right:ccw': along(maxC, maxR, (d, i) => [maxR - i, maxC - d]); break; // 右の端を上へ
    default: break;
    }
    return order;
}

export function soloAmbushCells(board, card) {
    const shapeCells = normalize(card.cells);
    for (const [r, c] of soloScanOrder(card)) {
        const cells = placeAt(shapeCells, r, c);
        if (cells && cells.every(cell => board[cell] === null)) return cells;
    }
    return null;
}

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const validCells = (cells) => Array.isArray(cells) && cells.length > 0 && cells.length <= 6
    && cells.every(cell => isInt(cell, 0, CELLS - 1)) && new Set(cells).size === cells.length;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は1〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            board: newBoard(), shapeCoins: 0, mountainCoins: 0, seasons: []
        }));
        // 得点カード：組ごとに1枚引き、A〜D にランダムに置く
        const drawn = EDICT_GROUPS.map(group => shuffle(EDICT_CARDS.filter(e => e.group === group), this.random)[0].id);
        this.edicts = shuffle(drawn, this.random);
        this.ambushPool = shuffle(AMBUSH_CARDS.map(a => a.id), this.random);
        this.leftoverAmbush = [];   // 前の季節に出なかった襲撃カード
        this.season = 0;
        this.time = 0;
        this.deck = [];
        this.card = null;           // 今のカード { kind: 'explore' | 'ambush', id }
        this.ruins = false;         // 廃墟の条件が効いている
        this.pending = [];          // まだ描いていない人
        this.targets = [];          // 襲撃で、各人が描く地図の持ち主
        this.phase = 'explore';     // explore：探索カードを描く / ambush：異形を描く / end：終わり
        this.winners = [];
        this.drawCount = 0;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startSeason();
    }

    get isSolo() {
        return this.players.length === 1;
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作できる人（まだ描いていない人全員）
    actors() {
        return this.phase === 'end' ? [] : [...this.pending];
    }

    coinsOf(player) {
        return player.shapeCoins + player.mountainCoins;
    }

    totalOf(player) {
        return player.seasons.reduce((sum, s) => sum + s.total, 0);
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.pending.includes(playerId)) return this.fail('今は描く番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { explore: { place: this.place }, ambush: { monster: this.drawMonster } }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        const done = handler.call(this, playerId, command);
        if (!done) return false;
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        this.afterResolve(playerId);
        return true;
    }

    // ---- 探索カード ----

    // { type: 'place', variant: 0, cells: [...] } か、1×1 しか描けないとき { type: 'place', fallback: true, terrain, cells: [cell] }
    place(seat, command) {
        const player = this.players[seat];
        const card = exploreCard(this.card.id);
        const board = player.board;
        const forced = mustFallback(board, card, this.ruins);
        let terrain, coin = false;
        if (command.fallback) {
            if (!forced) return this.fail('形を描ける場所があるときは、1×1 にはできません');
            if (!TERRAINS.includes(command.terrain)) return this.fail('地形が正しくありません');
            if (!validCells(command.cells) || command.cells.length !== 1) return this.fail('1マスを選んでください');
            if (board[command.cells[0]] !== null) return this.fail('空いたマスに描いてください');
            terrain = command.terrain;
        } else {
            if (forced) return this.fail(this.ruins ? '廃墟にかけて描けないので、1×1 を描きます' : 'どの形も描けないので、1×1 を描きます');
            const variant = card.variants[command.variant];
            if (!isInt(command.variant, 0, card.variants.length - 1) || !variant) return this.fail('形を選んでください');
            if (!validCells(command.cells) || !matchesShape(command.cells, variant.cells)) return this.fail('形が合いません');
            const reason = this.placementError(board, command.cells);
            if (reason) return this.fail(reason);
            terrain = variant.terrain;
            coin = variant.coin;
        }
        this.fillCells(seat, command.cells, terrain);
        if (coin) {
            player.shapeCoins++;
            this.emit({ type: 'coin', seat, from: 'shape' });
        }
        this.log(`${player.name}が${TERRAIN_NAMES[terrain]}を描きました${coin ? '（コイン）' : ''}`);
        return true;
    }

    // 描けない理由（描けるなら null）。画面の案内にも使う
    placementError(board, cells, { ruins = this.ruins, monster = false } = {}) {
        if (cells.some(cell => board[cell] === 'mountain')) return '山には描けません';
        if (cells.some(cell => board[cell] !== null)) return '描いたマスには重ねられません';
        if (!monster && ruins && !cells.some(cell => RUIN_SET.has(cell))) return '廃墟のマスにかけて描きます';
        return null;
    }

    // ---- 襲撃 ----

    // { type: 'monster', cells: [...] }。targets[seat] の人の地図に、異形を描く
    drawMonster(seat, { cells }) {
        const card = ambushCard(this.card.id);
        const owner = this.players[this.targets[seat]];
        if (!validCells(cells) || !matchesShape(cells, card.cells)) return this.fail('形が合いません');
        const reason = this.placementError(owner.board, cells, { monster: true });
        if (reason) return this.fail(reason);
        this.fillCells(owner.id, cells, 'monster', { by: seat });
        this.log(`${this.players[seat].name}が${owner.name}の地図に異形を描きました`);
        return true;
    }

    // ---- 進行 ----

    fillCells(seat, cells, terrain, { by = seat } = {}) {
        const player = this.players[seat];
        const before = surroundedMountains(player.board);
        cells.forEach(cell => { player.board[cell] = terrain; });
        this.emit({ type: 'draw', seat, by, cells: [...cells], terrain });
        const gained = surroundedMountains(player.board) - before;
        if (gained > 0) {
            player.mountainCoins += gained;
            this.emit({ type: 'coin', seat, from: 'mountain', count: gained });
            this.log(`${player.name}が山を囲み、コインを${gained}枚得ました`);
        }
    }

    afterResolve(seat) {
        this.pending = this.pending.filter(id => id !== seat);
        if (this.pending.length > 0) return;
        if (this.phase === 'explore') {
            this.time += exploreCard(this.card.id).time;
            this.ruins = false;
            if (this.time >= SEASONS[this.season].time) return this.endSeason();
        }
        this.drawNext();
    }

    startSeason() {
        const ambush = this.ambushPool.shift();
        if (ambush) this.leftoverAmbush.push(ambush);
        const cards = [
            ...EXPLORE_CARDS.map(c => ({ kind: 'explore', id: c.id })),
            ...RUINS_CARDS.map(c => ({ kind: 'ruins', id: c.id })),
            ...this.leftoverAmbush.map(id => ({ kind: 'ambush', id }))
        ];
        this.deck = shuffle(cards, this.random);
        this.time = 0;
        this.ruins = false;
        this.emit({ type: 'season', season: this.season });
        this.log(`${SEASONS[this.season].name}が始まりました（${SEASONS[this.season].time}の時間）`);
        this.drawNext();
    }

    // 描く必要のあるカードが出るまでめくる
    drawNext() {
        for (;;) {
            if (this.deck.length === 0) {
                // 山札が尽きたら（ふつうは起きない）、季節を終える
                return this.endSeason();
            }
            const next = this.deck.shift();
            this.drawCount++;
            if (next.kind === 'ruins') {
                this.ruins = true;
                this.emit({ type: 'reveal', card: next });
                this.log(`${ruinsCard(next.id).name}：次の形は廃墟にかけて描きます`);
                continue;
            }
            if (next.kind === 'ambush') {
                this.leftoverAmbush = this.leftoverAmbush.filter(id => id !== next.id);
                this.card = next;
                this.emit({ type: 'reveal', card: next });
                this.log(`${ambushCard(next.id).name}！`);
                if (this.isSolo) {
                    const cells = soloAmbushCells(this.players[0].board, ambushCard(next.id));
                    if (cells) this.fillCells(0, cells, 'monster');
                    else this.log('異形を描ける場所がないので、無視します');
                    continue;
                }
                const n = this.players.length;
                const card = ambushCard(next.id);
                // 時計回りなら地図を左へ渡すので、右隣（席の番号が1つ小さい人）の地図に描く
                this.targets = this.players.map((_, i) => (card.clockwise ? (i - 1 + n) % n : (i + 1) % n));
                this.pending = this.players.map(p => p.id)
                    .filter(i => legalPlacements(this.players[this.targets[i]].board, card.cells).length > 0);
                if (this.pending.length === 0) {
                    this.log('異形を描ける場所がないので、無視します');
                    continue;
                }
                this.phase = 'ambush';
                return;
            }
            this.card = next;
            this.phase = 'explore';
            this.pending = this.players.map(p => p.id);
            this.emit({ type: 'reveal', card: next, ruins: this.ruins });
            return;
        }
    }

    endSeason() {
        const season = SEASONS[this.season];
        this.players.forEach(p => {
            const [a, b] = season.edicts.map(i => scoreEdict(this.edicts[i], p.board));
            const coins = this.coinsOf(p);
            const monsters = monsterPenalty(p.board);
            p.seasons.push({ edicts: [a, b], coins, monsters, total: a + b + coins - monsters });
        });
        this.emit({ type: 'season-end', season: this.season });
        this.log(`${season.name}の得点：${this.players.map(p => `${p.name} ${p.seasons.at(-1).total}点`).join('・')}`);
        this.card = null;
        this.pending = [];
        this.season++;
        if (this.season >= SEASONS.length) return this.endGame();
        this.startSeason();
    }

    endGame() {
        this.phase = 'end';
        const ranked = this.players.map(p => ({
            id: p.id, total: this.totalOf(p), monsters: p.seasons.reduce((s, x) => s + x.monsters, 0)
        }));
        const best = Math.max(...ranked.map(r => r.total));
        const top = ranked.filter(r => r.total === best);
        const fewest = Math.min(...top.map(r => r.monsters));
        this.winners = top.filter(r => r.monsters === fewest).map(r => r.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(this.isSolo ? `合計 ${best}点で終わりました` : `${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text) {
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    // 今の手番の人ができる操作の例（テストと、CPU の手が通らないときの予備）
    // 1つの組につき最初の置き方だけを返す
    sampleCommands(seat) {
        if (!this.pending.includes(seat)) return [];
        const board = this.players[seat].board;
        if (this.phase === 'ambush') {
            const owner = this.players[this.targets[seat]];
            return legalPlacements(owner.board, ambushCard(this.card.id).cells).slice(0, 3).map(cells => ({ type: 'monster', cells }));
        }
        const card = exploreCard(this.card.id);
        if (mustFallback(board, card, this.ruins)) {
            const cell = board.indexOf(null);
            return cell < 0 ? [] : TERRAINS.map(terrain => ({ type: 'place', fallback: true, terrain, cells: [cell] }));
        }
        return card.variants.flatMap((v, variant) => {
            const placements = legalPlacements(board, v.cells, { ruins: this.ruins });
            return placements.length ? [{ type: 'place', variant, cells: placements[0] }] : [];
        });
    }

    // 保存する形（参加者・設定・操作の記録）。オンライン対戦のサーバーもこの形で保存する
    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    // 操作の記録から同じゲームを作り直す
    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}

export { edictCard, exploreCard, ambushCard, ruinsCard };
