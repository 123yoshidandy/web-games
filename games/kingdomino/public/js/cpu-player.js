/**
 * CPU（DOM に依存しない）
 *
 * 置く：置ける場所ごとに「得点の増え方・王冠・同じ地形への隣接・埋められなくなるマス」を見積もり、いちばん高い場所を選ぶ。
 * 選ぶ：並んだドミノごとに「今の王国に置いたときのいちばんよい見積もり・王冠・次の手番の早さ」を見積もる。
 * 強すぎないように、人間らしい見落としを入れる（置ける場所やドミノをいくつか見落とす・見積もりのぶれ）。
 * CPU の判断は記録されないので、ゲームの乱数は使わない。状態から作ったシード付きの別の乱数を使う。
 */

import {
    DOMINOES, DIRS, KINGDOM_SIZE, cellKey, dominoCells, kingdomBounds, legalPlacements
} from './game.js';
import { createRandom } from './random.js';

// overlook：置ける場所・ドミノを見落とす確率、noise：見積もりのぶれ（点）
export const CPU_STYLES = {
    easy: { overlook: 0.35, noise: 2.2 },
    normal: { overlook: 0.12, noise: 0.8 },
    strong: { overlook: 0, noise: 0 } // 強さを測るときの比べる相手。画面では使わない
};

// 見積もりの重み
export const WEIGHTS = { growth: 0.7, emptyGrowth: 0.08, dead: 1.5, deadHarmony: 4, offCenter: 8, pickCrowns: 1.2, order: 0.8 };

function cpuRandom(game, seat) {
    const seed = (game.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0;
    return createRandom(seed);
}

// 5×5 に収まる範囲の中で、もう埋められない空きマス（隣に空きがない）の数
function deadCells(grid) {
    const b = kingdomBounds(grid);
    const x0 = b.maxX - KINGDOM_SIZE + 1;
    const x1 = b.minX + KINGDOM_SIZE - 1;
    const y0 = b.maxY - KINGDOM_SIZE + 1;
    const y1 = b.minY + KINGDOM_SIZE - 1;
    const free = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !grid[cellKey(x, y)];
    let dead = 0;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            if (free(x, y) && !DIRS.some(([dx, dy]) => free(x + dx, y + dy))) dead++;
        }
    }
    return dead;
}

const offCenter = grid => {
    const b = kingdomBounds(grid);
    return b.minX < -2 || b.maxX > 2 || b.minY < -2 || b.maxY > 2;
};

// 盤面の価値：今の得点に、領域の伸びしろを足したもの
// 王冠のある領域は、隣の空きマスに同じ地形が来れば王冠の数だけ伸びる。王冠のない広い領域も、あとで王冠が来れば効く
function boardValue(grid) {
    const b = kingdomBounds(grid);
    const x0 = b.maxX - KINGDOM_SIZE + 1;
    const x1 = b.minX + KINGDOM_SIZE - 1;
    const y0 = b.maxY - KINGDOM_SIZE + 1;
    const y1 = b.minY + KINGDOM_SIZE - 1;
    const free = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !grid[cellKey(x, y)];
    const seen = new Set();
    let value = 0;
    for (const [key, cell] of Object.entries(grid)) {
        if (cell.terrain === 'castle' || seen.has(key)) continue;
        let size = 0;
        let crowns = 0;
        const room = new Set();
        const stack = [key];
        seen.add(key);
        while (stack.length) {
            const current = stack.pop();
            const [x, y] = current.split(',').map(Number);
            size++;
            crowns += grid[current].crowns;
            for (const [dx, dy] of DIRS) {
                const next = cellKey(x + dx, y + dy);
                if (free(x + dx, y + dy)) room.add(next);
                if (!seen.has(next) && grid[next]?.terrain === cell.terrain) {
                    seen.add(next);
                    stack.push(next);
                }
            }
        }
        const growth = Math.min(room.size, 4);
        value += size * crowns + crowns * growth * WEIGHTS.growth + (crowns === 0 ? Math.min(size, 6) * growth * WEIGHTS.emptyGrowth : 0);
    }
    return value;
}

// 置く場所の見積もり
export function evaluatePlacement(grid, domino, { x, y, dir }, options = {}) {
    const after = { ...grid };
    const cells = dominoCells(x, y, dir);
    cells.forEach(([cx, cy], i) => { after[cellKey(cx, cy)] = domino.halves[i]; });
    let value = boardValue(after) - boardValue(grid);
    const lost = deadCells(after) - deadCells(grid);
    value -= lost * (options.harmony ? WEIGHTS.deadHarmony : WEIGHTS.dead);
    if (options.middleKingdom && !offCenter(grid) && offCenter(after)) value -= WEIGHTS.offCenter;
    return value;
}

// 置く場所を選ぶ（置ける場所がなければ null）
export function choosePlacement(game, seat, style = CPU_STYLES.normal, random = cpuRandom(game, seat)) {
    const domino = game.activeDomino;
    const grid = game.players[seat].grid;
    const all = legalPlacements(grid, domino);
    if (all.length === 0) return null;
    let candidates = all.filter(() => random() >= style.overlook);
    if (candidates.length === 0) candidates = [all[Math.floor(random() * all.length)]];
    let best = null;
    let bestValue = -Infinity;
    for (const p of candidates) {
        const value = evaluatePlacement(grid, domino, p, game.options) + (random() * 2 - 1) * style.noise;
        if (value > bestValue) {
            bestValue = value;
            best = p;
        }
    }
    return best;
}

// 選ぶドミノの見積もり
function evaluatePick(game, seat, line, index) {
    const domino = DOMINOES[line[index].domino];
    const grid = game.players[seat].grid;
    const placements = legalPlacements(grid, domino);
    const placeValue = placements.length
        ? Math.max(...placements.map(p => evaluatePlacement(grid, domino, p, game.options)))
        : (game.options.harmony ? -6 : -2);
    const crowns = domino.halves.reduce((sum, h) => sum + h.crowns, 0);
    // 番号が小さいドミノを選ぶと、次の並びを先に選べる
    const order = line.length > 1 ? (line.length - 1 - index) / (line.length - 1) : 0;
    return placeValue + crowns * WEIGHTS.pickCrowns + order * WEIGHTS.order;
}

// 選ぶドミノの位置を返す
export function choosePick(game, seat, style = CPU_STYLES.normal, random = cpuRandom(game, seat)) {
    const line = game.pickLine;
    const free = line.map((slot, i) => (slot.king === null ? i : -1)).filter(i => i >= 0);
    let candidates = free.filter(() => random() >= style.overlook * 0.6);
    if (candidates.length === 0) candidates = [free[Math.floor(random() * free.length)]];
    let best = candidates[0];
    let bestValue = -Infinity;
    for (const index of candidates) {
        const value = evaluatePick(game, seat, line, index) + (random() * 2 - 1) * style.noise;
        if (value > bestValue) {
            bestValue = value;
            best = index;
        }
    }
    return best;
}

// CPU の手（操作）を決める
export function chooseCommand(game, seat = game.currentSeat, style = CPU_STYLES.normal) {
    if (game.pickLine) return { type: 'pick', index: choosePick(game, seat, style) };
    const placement = choosePlacement(game, seat, style);
    return placement ? { type: 'place', ...placement } : { type: 'discard' };
}

export const isCpuTurn = game => game.phase !== 'end' && game.players[game.currentSeat].isCPU;

// CPU の番なら1手進める。進めたら true
export function runCpuStep(game, style = CPU_STYLES.normal) {
    if (!isCpuTurn(game)) return false;
    const seat = game.currentSeat;
    if (game.applyCommand(seat, chooseCommand(game, seat, style))) return true;
    // 想定していない形で断られたら、いちばん単純な答えで必ず進める
    if (game.pickLine) return game.applyCommand(seat, { type: 'pick', index: game.pickLine.findIndex(s => s.king === null) });
    const [first] = game.getLegalPlacements();
    return game.applyCommand(seat, first ? { type: 'place', ...first } : { type: 'discard' });
}

// ヒント：人の番に、CPU（見落としもぶれもない強さ）が選ぶ手を返す。見るのは公開の情報だけ（山の並びは見ない）
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.phase === 'end' || game.currentSeat !== seat) return null;
    return chooseCommand(game, seat, CPU_STYLES.strong);
}
