/**
 * パッチワークのルールと状態（DOM に依存しない）
 *
 * 操作はすべて applyCommand(seat, command) に通す。受け付けたら true、断ったら false と lastError。
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる。
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）。
 *
 * 操作：
 *   { type: 'advance' }                       相手の1マス先まで進み、進んだマスの数だけボタンをもらう
 *   { type: 'buy', choice, orient, x, y }     中立の駒の先の choice 番目（0〜2）のパッチを買って置く
 *                                             orient は向きの番号、(x, y) は向けた形の左上を置くマス
 *   { type: 'leather', x, y }                 もらった 1×1 の革のパッチを置く
 */

import { PATCHES } from './patches.js';
import { createRandom, createSeed, shuffle } from './random.js';

export const QUILT_SIZE = 9;
export const END = 53;                 // 時間の盤のゴール
export const START_BUTTONS = 5;
export const INCOME_SPACES = [5, 11, 17, 23, 29, 35, 41, 47, 53]; // ここを通る（止まる）とボタンの収入
export const LEATHER_SPACES = [20, 26, 32, 44, 50];             // ここを最初に通った人が革のパッチをもらう
export const BONUS_SIZE = 7;
export const BONUS_POINTS = 7;
export const START_PATCH = 0;          // 2×1 のパッチ。中立の駒の真後ろに置く

// 形の文字列からマスの座標
const cellsOf = shape => shape.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === '#' ? [[x, y]] : [])));

function normalize(cells) {
    const minX = Math.min(...cells.map(c => c[0]));
    const minY = Math.min(...cells.map(c => c[1]));
    return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// 回転と裏返しでできる向き（重なるものは1つにまとめる）。0番は元の形
function orientationsOf(cells) {
    const result = [];
    const seen = new Set();
    let current = cells;
    for (let flip = 0; flip < 2; flip++) {
        for (let rot = 0; rot < 4; rot++) {
            const form = normalize(current);
            const key = form.map(c => c.join(',')).join(';');
            if (!seen.has(key)) {
                seen.add(key);
                result.push(form);
            }
            current = current.map(([x, y]) => [-y, x]); // 時計回りに90度
        }
        current = cells.map(([x, y]) => [-x, y]); // 左右に裏返す
    }
    return result;
}

export const ORIENTATIONS = PATCHES.map(p => orientationsOf(cellsOf(p.shape)));
export const LEATHER_ORIENTATIONS = [[[0, 0]]];
export const patchArea = id => cellsOf(PATCHES[id].shape).length;

// 向きの変え方：回転・裏返しした向きの番号を引く
function transformIndex(id, orient, fn) {
    const form = normalize(ORIENTATIONS[id][orient].map(fn));
    const key = form.map(c => c.join(',')).join(';');
    return ORIENTATIONS[id].findIndex(o => o.map(c => c.join(',')).join(';') === key);
}
export const rotateOrient = (id, orient) => transformIndex(id, orient, ([x, y]) => [-y, x]);
export const flipOrient = (id, orient) => transformIndex(id, orient, ([x, y]) => [-x, y]);

export const emptyQuilt = () => Array.from({ length: QUILT_SIZE }, () => Array(QUILT_SIZE).fill(null));

// 向き orient の形を (x, y) に置いたときのマス（キルトの外や重なりがあれば null）
export function placementCells(quilt, cells, x, y) {
    const result = [];
    for (const [cx, cy] of cells) {
        const px = x + cx;
        const py = y + cy;
        if (px < 0 || py < 0 || px >= QUILT_SIZE || py >= QUILT_SIZE || quilt[py][px] !== null) return null;
        result.push([px, py]);
    }
    return result;
}

// そのパッチを置ける場所の一覧（{ orient, x, y }）
export function legalPlacements(quilt, id) {
    const list = [];
    ORIENTATIONS[id].forEach((cells, orient) => {
        const w = Math.max(...cells.map(c => c[0])) + 1;
        const h = Math.max(...cells.map(c => c[1])) + 1;
        for (let y = 0; y <= QUILT_SIZE - h; y++) {
            for (let x = 0; x <= QUILT_SIZE - w; x++) {
                if (placementCells(quilt, cells, x, y)) list.push({ orient, x, y });
            }
        }
    });
    return list;
}

export const countEmpty = quilt => quilt.flat().filter(c => c === null).length;

// 7×7 の正方形がすべて埋まっているか
export function hasFullSquare(quilt) {
    for (let y = 0; y <= QUILT_SIZE - BONUS_SIZE; y++) {
        for (let x = 0; x <= QUILT_SIZE - BONUS_SIZE; x++) {
            let full = true;
            for (let dy = 0; dy < BONUS_SIZE && full; dy++) {
                for (let dx = 0; dx < BONUS_SIZE; dx++) {
                    if (quilt[y + dy][x + dx] === null) { full = false; break; }
                }
            }
            if (full) return true;
        }
    }
    return false;
}

// start より先から target までに通るマスの数（収入のマスなど）
export const passed = (spaces, start, target) => spaces.filter(s => s > start && s <= target);

export default class Game {
    // players: [{ name, isCPU }]（2人） / options: { seed }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('2人で遊ぶゲームです');
        this.seed = (options.seed ?? createSeed()) >>> 0;
        this.random = createRandom(this.seed);
        this.players = players.map((player, seat) => ({
            seat,
            name: player.name,
            isCPU: !!player.isCPU,
            buttons: START_BUTTONS,
            income: 0,
            position: 0,
            quilt: emptyQuilt(),
            placed: [],      // { id, cells }（革のパッチは id: 'L'）
            bonus: false,
            finishedTurn: null
        }));
        // パッチを混ぜて環に並べる。ring[0] が中立の駒のすぐ先。2×1 のパッチは中立の駒の真後ろ（最後）
        const others = shuffle(PATCHES.map(p => p.id).filter(id => id !== START_PATCH), this.random);
        this.ring = [...others, START_PATCH];
        this.leatherLeft = [...LEATHER_SPACES];
        // 同じマスにいるときは、上にいる人（あとから来た人）が先に動く。最初はランダム
        this.top = Math.floor(this.random() * 2);
        this.pendingLeather = null; // { seat, count }
        this.bonusOwner = null;
        this.phase = 'play';
        this.turn = 0;
        this.commands = [];
        this.logs = [];
        this.lastError = null;
        this.lastMove = null;
        this.result = null;
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません: ${game.lastError}`);
        }
        return game;
    }

    get isOver() {
        return this.phase === 'end';
    }

    // 今動く人：革のパッチを置く人、または時間の盤で後ろにいる人（同じなら上にいる人）
    get current() {
        if (this.phase === 'end') return null;
        if (this.pendingLeather) return this.pendingLeather.seat;
        const [a, b] = this.players;
        if (a.position !== b.position) return a.position < b.position ? 0 : 1;
        return this.top;
    }

    // 中立の駒の先の3枚（環が3枚より少なければその分）
    get offer() {
        return this.ring.slice(0, 3);
    }

    // 進んだときの行き先（相手の1マス先、ゴールまで）
    advanceTarget(seat) {
        return Math.min(END, this.players[1 - seat].position + 1);
    }

    canBuy(seat, choice) {
        const id = this.offer[choice];
        if (id === undefined) return false;
        return this.players[seat].buttons >= PATCHES[id].cost && legalPlacements(this.players[seat].quilt, id).length > 0;
    }

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (seat !== this.current) return this.fail('あなたの番ではありません');
        if (this.pendingLeather) {
            if (command.type !== 'leather') return this.fail('先に革のパッチを置いてください');
            return this.placeLeather(seat, command);
        }
        if (command.type === 'advance') return this.advance(seat);
        if (command.type === 'buy') return this.buy(seat, command);
        return this.fail('今はその操作はできません');
    }

    advance(seat) {
        const player = this.players[seat];
        const target = this.advanceTarget(seat);
        const gained = target - player.position;
        player.buttons += gained;
        this.record(seat, { type: 'advance' }, `${player.name}：${gained}マス進み、ボタンを${gained}もらった`);
        this.lastMove = { type: 'advance', seat, from: player.position, to: target, gained };
        this.moveTime(seat, target);
        return true;
    }

    buy(seat, { choice, orient, x, y }) {
        if (!Number.isInteger(choice) || choice < 0 || choice >= this.offer.length) return this.fail('そのパッチは選べません');
        const id = this.offer[choice];
        const patch = PATCHES[id];
        const player = this.players[seat];
        if (player.buttons < patch.cost) return this.fail('ボタンが足りません');
        const forms = ORIENTATIONS[id];
        if (!Number.isInteger(orient) || orient < 0 || orient >= forms.length) return this.fail('向きが正しくありません');
        if (!Number.isInteger(x) || !Number.isInteger(y)) return this.fail('置く場所が正しくありません');
        const cells = placementCells(player.quilt, forms[orient], x, y);
        if (!cells) return this.fail('そこには置けません');

        player.buttons -= patch.cost;
        player.income += patch.income;
        for (const [cx, cy] of cells) player.quilt[cy][cx] = id;
        player.placed.push({ id, cells });
        // 中立の駒は、買ったパッチのあった場所へ進む
        this.ring = [...this.ring.slice(choice + 1), ...this.ring.slice(0, choice)];
        this.checkBonus(seat);
        const target = Math.min(END, player.position + patch.time);
        this.record(seat, { type: 'buy', choice, orient, x, y }, `${player.name}：パッチを買った（ボタン${patch.cost}・時間${patch.time}）`);
        this.lastMove = { type: 'buy', seat, id, cells, from: player.position, to: target };
        this.moveTime(seat, target);
        return true;
    }

    placeLeather(seat, { x, y }) {
        const player = this.players[seat];
        if (!Number.isInteger(x) || !Number.isInteger(y) || !placementCells(player.quilt, [[0, 0]], x, y)) return this.fail('そこには置けません');
        player.quilt[y][x] = 'L';
        player.placed.push({ id: 'L', cells: [[x, y]] });
        this.checkBonus(seat);
        this.record(seat, { type: 'leather', x, y }, `${player.name}：革のパッチを置いた`);
        this.lastMove = { type: 'leather', seat, cells: [[x, y]] };
        this.pendingLeather.count--;
        if (this.pendingLeather.count === 0 || countEmpty(player.quilt) === 0) this.pendingLeather = null;
        this.afterTurn();
        return true;
    }

    // 時間の駒を進める。収入のマスを通ればボタン、革のパッチのマスを最初に通れば革のパッチ
    moveTime(seat, target) {
        const player = this.players[seat];
        const start = player.position;
        const incomes = passed(INCOME_SPACES, start, target).length;
        if (incomes > 0 && player.income > 0) {
            player.buttons += incomes * player.income;
            this.logs.push(`${player.name}：収入でボタンを${incomes * player.income}もらった`);
        }
        const leathers = passed(this.leatherLeft, start, target);
        this.leatherLeft = this.leatherLeft.filter(s => !leathers.includes(s));
        player.position = target;
        if (target !== start) this.top = seat; // あとから来た人が上
        if (target === END && player.finishedTurn === null) player.finishedTurn = this.turn;
        // 置く場所がなければ、革のパッチはもらえない
        const count = Math.min(leathers.length, countEmpty(player.quilt));
        if (this.lastMove) this.lastMove.leathers = leathers.length;
        if (count > 0) this.pendingLeather = { seat, count };
        this.afterTurn();
    }

    checkBonus(seat) {
        if (this.bonusOwner === null && hasFullSquare(this.players[seat].quilt)) {
            this.bonusOwner = seat;
            this.players[seat].bonus = true;
            this.logs.push(`${this.players[seat].name}：7×7 がそろった（+${BONUS_POINTS}）`);
        }
    }

    afterTurn() {
        this.turn++;
        if (!this.pendingLeather && this.players.every(p => p.position === END)) this.finish();
    }

    score(seat) {
        const p = this.players[seat];
        const empty = countEmpty(p.quilt);
        return { buttons: p.buttons, empty, bonus: p.bonus ? BONUS_POINTS : 0, total: p.buttons - empty * 2 + (p.bonus ? BONUS_POINTS : 0) };
    }

    // 得点：ボタン − 空きマス×2 ＋ ボーナス。同点なら先にゴールした人の勝ち
    finish() {
        this.phase = 'end';
        const standings = this.players.map(p => ({ seat: p.seat, ...this.score(p.seat), finishedTurn: p.finishedTurn }));
        standings.sort((a, b) => b.total - a.total || a.finishedTurn - b.finishedTurn);
        this.result = { standings, winner: standings[0].seat, tie: standings[0].total === standings[1].total };
        this.logs.push('ゲーム終了');
    }

    record(seat, command, log) {
        this.commands.push({ seat, command });
        this.logs.push(log);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }
}
