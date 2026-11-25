/**
 * キングドミノのルールと状態（DOM に依存しない）
 *
 * 操作はすべて applyCommand(seat, command) に通す。受け付けたら true、断ったら false と lastError。
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる。
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）。
 *
 * 操作：
 *   { type: 'pick', index }        並んだドミノの index 番目に王様を置く（最初の並びでは current、以降は next）
 *   { type: 'place', x, y, dir }   今のドミノを王国に置く。1つ目のマスを (x, y)、2つ目をその dir の向きの隣に置く
 *   { type: 'discard' }            置ける場所がないときだけ、今のドミノを捨てる
 *
 * 王国の座標は城を (0, 0) とする。王国は城を含めて 5×5 に収める
 */

import { createRandom, createSeed, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const KINGDOM_SIZE = 5;
export const TERRAINS = ['wheat', 'forest', 'lake', 'grass', 'swamp', 'mine'];
export const TERRAIN_NAMES = { wheat: '小麦畑', forest: '森', lake: '湖', grass: '草原', swamp: '沼地', mine: '鉱山', castle: '城' };
// 人数ごとの、使うドミノの数と1人あたりの王様の数
export const SETUP = {
    2: { dominoes: 24, kingsPerPlayer: 2 },
    3: { dominoes: 36, kingsPerPlayer: 1 },
    4: { dominoes: 48, kingsPerPlayer: 1 }
};
export const BONUS = { middleKingdom: 10, harmony: 5 };
// 向き：0 右、1 下、2 左、3 上
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// ドミノ48枚（番号, [地形, 王冠], [地形, 王冠]）。番号が大きいほど価値が高い
const RAW = [
    [1, 'wheat', 0, 'wheat', 0], [2, 'wheat', 0, 'wheat', 0], [3, 'forest', 0, 'forest', 0], [4, 'forest', 0, 'forest', 0],
    [5, 'forest', 0, 'forest', 0], [6, 'forest', 0, 'forest', 0], [7, 'lake', 0, 'lake', 0], [8, 'lake', 0, 'lake', 0],
    [9, 'lake', 0, 'lake', 0], [10, 'grass', 0, 'grass', 0], [11, 'grass', 0, 'grass', 0], [12, 'swamp', 0, 'swamp', 0],
    [13, 'wheat', 0, 'forest', 0], [14, 'wheat', 0, 'lake', 0], [15, 'wheat', 0, 'grass', 0], [16, 'wheat', 0, 'swamp', 0],
    [17, 'forest', 0, 'lake', 0], [18, 'forest', 0, 'grass', 0], [19, 'wheat', 1, 'forest', 0], [20, 'wheat', 1, 'lake', 0],
    [21, 'wheat', 1, 'grass', 0], [22, 'wheat', 1, 'swamp', 0], [23, 'wheat', 1, 'mine', 0], [24, 'forest', 1, 'wheat', 0],
    [25, 'forest', 1, 'wheat', 0], [26, 'forest', 1, 'wheat', 0], [27, 'forest', 1, 'wheat', 0], [28, 'forest', 1, 'lake', 0],
    [29, 'forest', 1, 'grass', 0], [30, 'lake', 1, 'wheat', 0], [31, 'lake', 1, 'wheat', 0], [32, 'lake', 1, 'forest', 0],
    [33, 'lake', 1, 'forest', 0], [34, 'lake', 1, 'forest', 0], [35, 'lake', 1, 'forest', 0], [36, 'wheat', 0, 'grass', 1],
    [37, 'lake', 0, 'grass', 1], [38, 'wheat', 0, 'swamp', 1], [39, 'grass', 0, 'swamp', 1], [40, 'mine', 1, 'wheat', 0],
    [41, 'wheat', 0, 'grass', 2], [42, 'lake', 0, 'grass', 2], [43, 'wheat', 0, 'swamp', 2], [44, 'grass', 0, 'swamp', 2],
    [45, 'mine', 2, 'wheat', 0], [46, 'swamp', 0, 'mine', 2], [47, 'swamp', 0, 'mine', 2], [48, 'wheat', 0, 'mine', 3]
];
export const DOMINOES = Object.fromEntries(RAW.map(([id, a, ac, b, bc]) => [id, {
    id,
    halves: [{ terrain: a, crowns: ac }, { terrain: b, crowns: bc }]
}]));

export const cellKey = (x, y) => `${x},${y}`;

// 城だけの王国
export const createKingdom = () => ({ [cellKey(0, 0)]: { terrain: 'castle', crowns: 0 } });

export function kingdomBounds(grid) {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const key of Object.keys(grid)) {
        const [x, y] = key.split(',').map(Number);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX, maxX, minY, maxY };
}

export const dominoCells = (x, y, dir) => [[x, y], [x + DIRS[dir][0], y + DIRS[dir][1]]];

// ドミノを (x, y, dir) に置けるか
export function canPlace(grid, domino, x, y, dir) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(dir) || dir < 0 || dir > 3) return false;
    const cells = dominoCells(x, y, dir);
    if (cells.some(([cx, cy]) => grid[cellKey(cx, cy)])) return false;
    // 城を含めて 5×5 に収まるか
    const b = kingdomBounds(grid);
    for (const [cx, cy] of cells) {
        b.minX = Math.min(b.minX, cx); b.maxX = Math.max(b.maxX, cx);
        b.minY = Math.min(b.minY, cy); b.maxY = Math.max(b.maxY, cy);
    }
    if (b.maxX - b.minX >= KINGDOM_SIZE || b.maxY - b.minY >= KINGDOM_SIZE) return false;
    // どちらかのマスが、城か同じ地形のマスに接しているか
    return cells.some(([cx, cy], i) => {
        const terrain = domino.halves[i].terrain;
        return DIRS.some(([dx, dy]) => {
            const neighbor = grid[cellKey(cx + dx, cy + dy)];
            return neighbor && (neighbor.terrain === 'castle' || neighbor.terrain === terrain);
        });
    });
}

// 置ける場所の一覧（{ x, y, dir }）
export function legalPlacements(grid, domino) {
    const b = kingdomBounds(grid);
    const result = [];
    for (let y = b.maxY - KINGDOM_SIZE + 1; y <= b.minY + KINGDOM_SIZE - 1; y++) {
        for (let x = b.maxX - KINGDOM_SIZE + 1; x <= b.minX + KINGDOM_SIZE - 1; x++) {
            if (grid[cellKey(x, y)]) continue;
            for (let dir = 0; dir < 4; dir++) {
                if (canPlace(grid, domino, x, y, dir)) result.push({ x, y, dir });
            }
        }
    }
    return result;
}

// 得点：同じ地形がつながった領域ごとに「マスの数 × 王冠の数」
export function scoreKingdom(grid) {
    const seen = new Set();
    const properties = [];
    for (const [key, cell] of Object.entries(grid)) {
        if (cell.terrain === 'castle' || seen.has(key)) continue;
        let size = 0;
        let crowns = 0;
        const stack = [key];
        seen.add(key);
        while (stack.length) {
            const current = stack.pop();
            const [x, y] = current.split(',').map(Number);
            size++;
            crowns += grid[current].crowns;
            for (const [dx, dy] of DIRS) {
                const next = cellKey(x + dx, y + dy);
                if (!seen.has(next) && grid[next]?.terrain === cell.terrain) {
                    seen.add(next);
                    stack.push(next);
                }
            }
        }
        properties.push({ terrain: cell.terrain, size, crowns, points: size * crowns });
    }
    return {
        properties,
        points: properties.reduce((sum, p) => sum + p.points, 0),
        largest: properties.reduce((max, p) => Math.max(max, p.size), 0),
        crowns: properties.reduce((sum, p) => sum + p.crowns, 0)
    };
}

// 城が 5×5 の真ん中にあるか（中王国）
export function isCentered(grid) {
    const b = kingdomBounds(grid);
    return b.minX === -2 && b.maxX === 2 && b.minY === -2 && b.maxY === 2;
}

// ボーナスを含めた得点の内訳
export function playerScore(player, options) {
    const base = scoreKingdom(player.grid);
    const middle = options.middleKingdom && isCentered(player.grid) ? BONUS.middleKingdom : 0;
    const harmony = options.harmony && player.discarded === 0 ? BONUS.harmony : 0;
    return { ...base, middle, harmony, total: base.points + middle + harmony };
}

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, middleKingdom, harmony }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        this.seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { middleKingdom: !!options.middleKingdom, harmony: !!options.harmony };
        this.random = createRandom(this.seed);
        const setup = SETUP[players.length];
        this.players = players.map((player, seat) => ({
            seat,
            name: player.name,
            isCPU: !!player.isCPU,
            grid: createKingdom(),
            placed: 0,
            discarded: 0
        }));
        // ドミノを混ぜ、人数に合わせて使う分だけを残す（残りは見ずに箱へ戻す）
        const all = shuffle(Object.keys(DOMINOES).map(Number), this.random);
        this.deck = all.slice(0, setup.dominoes);
        this.kings = [];
        players.forEach((_, seat) => {
            for (let i = 0; i < setup.kingsPerPlayer; i++) this.kings.push({ id: this.kings.length, seat });
        });
        this.lineSize = this.kings.length;
        // 最初の並びに王様を置く順番はランダム
        this.initialOrder = shuffle(this.kings.map(king => king.id), this.random);
        this.initialIndex = 0;
        this.current = this.drawLine();
        this.next = null;
        this.round = 1;
        this.phase = 'initial'; // 'initial'（最初の並びを選ぶ） / 'play' / 'end'
        this.activeIndex = 0;
        this.step = 'pick';
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

    // 山から並びを1列引き、番号の小さい順に並べる
    drawLine() {
        const ids = this.deck.splice(0, this.lineSize).sort((a, b) => a - b);
        return ids.map(domino => ({ domino, king: null, done: false }));
    }

    // 今動く王様
    get activeKing() {
        if (this.phase === 'initial') return this.kings[this.initialOrder[this.initialIndex]];
        if (this.phase === 'play') return this.kings[this.current[this.activeIndex].king];
        return null;
    }

    // 今動く人の席（終わったら null）
    get currentSeat() {
        return this.activeKing?.seat ?? null;
    }

    // 今置くドミノ
    get activeDomino() {
        return this.phase === 'play' && this.step === 'place' ? DOMINOES[this.current[this.activeIndex].domino] : null;
    }

    // 王様を置ける並び
    get pickLine() {
        if (this.phase === 'initial') return this.current;
        if (this.phase === 'play' && this.step === 'pick') return this.next;
        return null;
    }

    getLegalPlacements() {
        const domino = this.activeDomino;
        return domino ? legalPlacements(this.players[this.currentSeat].grid, domino) : [];
    }

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (seat !== this.currentSeat) return this.fail('あなたの番ではありません');
        if (command.type === 'pick') return this.pick(seat, command);
        if (command.type === 'place') return this.place(seat, command);
        if (command.type === 'discard') return this.discard(seat);
        return this.fail('今はその操作はできません');
    }

    pick(seat, { index }) {
        const line = this.pickLine;
        if (!line) return this.fail('今はドミノを選べません');
        if (!Number.isInteger(index) || index < 0 || index >= line.length) return this.fail('ドミノが正しくありません');
        if (line[index].king !== null) return this.fail('そのドミノはもう選ばれています');

        const king = this.activeKing;
        line[index].king = king.id;
        this.record(seat, { type: 'pick', index }, `${this.players[seat].name}：${line[index].domino}番を選んだ`);
        this.lastMove = { type: 'pick', seat, king: king.id, domino: line[index].domino, index, initial: this.phase === 'initial' };
        if (this.phase === 'initial') {
            this.initialIndex++;
            if (this.initialIndex >= this.initialOrder.length) {
                this.next = this.drawLine();
                this.phase = 'play';
                this.activeIndex = 0;
                this.step = 'pick';
            }
        } else {
            this.step = 'place';
        }
        return true;
    }

    place(seat, { x, y, dir }) {
        if (this.phase !== 'play' || this.step !== 'place') return this.fail('今はドミノを置けません');
        const domino = this.activeDomino;
        const player = this.players[seat];
        if (!canPlace(player.grid, domino, x, y, dir)) return this.fail('そこには置けません');

        dominoCells(x, y, dir).forEach(([cx, cy], i) => {
            player.grid[cellKey(cx, cy)] = { ...domino.halves[i] };
        });
        player.placed++;
        this.current[this.activeIndex].done = true;
        this.record(seat, { type: 'place', x, y, dir }, `${player.name}：${domino.id}番を置いた`);
        this.lastMove = { type: 'place', seat, domino: domino.id, x, y, dir, index: this.activeIndex };
        this.afterPlace();
        return true;
    }

    discard(seat) {
        if (this.phase !== 'play' || this.step !== 'place') return this.fail('今はドミノを捨てられません');
        if (this.getLegalPlacements().length > 0) return this.fail('置ける場所があるときは捨てられません');
        const domino = this.activeDomino;
        this.players[seat].discarded++;
        this.current[this.activeIndex].done = true;
        this.record(seat, { type: 'discard' }, `${this.players[seat].name}：${domino.id}番を捨てた`);
        this.lastMove = { type: 'discard', seat, domino: domino.id, index: this.activeIndex };
        this.afterPlace();
        return true;
    }

    // 置いたら、次の王様へ。並びの王様が全員動いたら、次の並びへ
    afterPlace() {
        this.activeIndex++;
        if (this.activeIndex >= this.current.length) {
            if (!this.next) {
                this.finish();
                return;
            }
            this.current = this.next;
            this.next = this.deck.length ? this.drawLine() : null;
            this.activeIndex = 0;
            this.round++;
        }
        // 次の並びがあれば、まず王様を次の並びへ移す（選ぶ）。最後の並びは置くだけ
        this.step = this.next ? 'pick' : 'place';
    }

    // ゲームの終わり：得点と順位。同点なら最大の領域が広い方、それも同じなら王冠が多い方
    finish() {
        this.phase = 'end';
        const standings = this.players.map(player => ({ seat: player.seat, ...playerScore(player, this.options) }));
        const better = (a, b) => b.total - a.total || b.largest - a.largest || b.crowns - a.crowns;
        standings.sort(better);
        standings.forEach((entry, i) => {
            entry.rank = i > 0 && better(standings[i - 1], entry) === 0 ? standings[i - 1].rank : i + 1;
        });
        this.result = { standings, winners: standings.filter(e => e.rank === 1).map(e => e.seat) };
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
