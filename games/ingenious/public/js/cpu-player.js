/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビュー（自分の手札・盤・全員の得点）だけを見て決める。ほかの人の手札や袋の並びはのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう
 * - 伸び：得点を低い順に並べ、低いものほど重く数えた値（WEIGHTS）がどれだけ上がるか。いちばん低い色を伸ばす手ほどよい
 * - インジーニアス（もう1枚置ける）に届く手は、さらに高く見る
 * - ふさぐ：見込みのよい手について、置いたあとに相手が伸ばせる量（空いたマスに相手のいちばん低い色を置いたときの最大の点）が
 *   どれだけ減るかを足す。相手の伸びを止める手が選ばれる
 * - 取り替えられるときは、いつも取り替える
 * やさしい：半分は合計の点がいちばん多い手、半分はでたらめ。取り替えは半々
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { COLOR_ORDER } from './colors.js';
import { CELLS, CELL_COUNT, NEIGHBORS } from './board.js';

export const CPU_LEVELS = ['easy', 'normal'];
const WEIGHTS = [16, 6, 3, 1.5, 0.8, 0.4]; // 低い色から順の重み
const BONUS_VALUE = 30;  // インジーニアス1回の値
const SHORTLIST = 24;    // ふさぐ量まで見る手の数
const BLOCK_WEIGHT = 0.3;

// ---- 盤の計算（ビューから） ----

const open = (view, cell) => cell >= 0 && CELLS[cell].ring <= view.radius && view.board[cell] === null;

// a に color を置いたときの点（b の向きは数えない）
function linePoints(board, a, b, color) {
    let points = 0;
    for (let d = 0; d < 6; d++) {
        let c = NEIGHBORS[a][d];
        if (c === b) continue;
        while (c >= 0 && board[c] === color) {
            points++;
            c = NEIGHBORS[c][d];
        }
    }
    return points;
}

// 置ける2マスの組（[a, b]。同じ組を2回数えないよう、向き 0〜2 だけ）
export function placements(view, seat = view.you) {
    const first = view.players[seat].placed === 0 && view.freeSymbols.length > 0;
    const near = first ? new Set(view.freeSymbols.flatMap(s => NEIGHBORS[s])) : null;
    const out = [];
    for (let a = 0; a < CELL_COUNT; a++) {
        if (!open(view, a)) continue;
        for (let d = 0; d < 3; d++) {
            const b = NEIGHBORS[a][d];
            if (!open(view, b)) continue;
            if (near && !near.has(a) && !near.has(b)) continue;
            out.push([a, b]);
        }
    }
    return out;
}

// 手番の人が打てる手（{ tile, cells, gains }）
export function legalMoves(view) {
    const me = view.players[view.you];
    const seen = new Set();
    const tiles = me.hand.filter(t => {
        const key = [...t].sort().join(',');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const moves = [];
    for (const [a, b] of placements(view)) {
        for (const t of tiles) {
            const orders = t[0] === t[1] ? [t] : [t, [t[1], t[0]]];
            for (const tile of orders) {
                const gains = {};
                gains[tile[0]] = (gains[tile[0]] ?? 0) + linePoints(view.board, a, b, tile[0]);
                gains[tile[1]] = (gains[tile[1]] ?? 0) + linePoints(view.board, b, a, tile[1]);
                moves.push({ tile, cells: [a, b], gains });
            }
        }
    }
    return moves;
}

// 低い色ほど重く数えた値
export function utility(scores) {
    return COLOR_ORDER.map(c => scores[c]).sort((x, y) => x - y).reduce((s, v, i) => s + v * WEIGHTS[i], 0);
}

// 色ごとの重み（その人の得点で、低い順の重み）
function rankWeights(scores) {
    const order = [...COLOR_ORDER].sort((x, y) => scores[x] - scores[y]);
    return Object.fromEntries(order.map((c, i) => [c, WEIGHTS[i]]));
}

// 盤のどこかに color を置いたときの、いちばん多い点（色ごと）
function opportunity(view, board) {
    const best = Object.fromEntries(COLOR_ORDER.map(c => [c, 0]));
    for (let x = 0; x < CELL_COUNT; x++) {
        if (!(CELLS[x].ring <= view.radius && board[x] === null)) continue;
        // となりに置ける空きがないマスには置けない
        if (!NEIGHBORS[x].some(nb => nb >= 0 && CELLS[nb].ring <= view.radius && board[nb] === null)) continue;
        const sum = {};
        for (let d = 0; d < 6; d++) {
            let c = NEIGHBORS[x][d];
            const color = c >= 0 ? board[c] : null;
            if (!color) continue;
            let k = 0;
            while (c >= 0 && board[c] === color) {
                k++;
                c = NEIGHBORS[c][d];
            }
            sum[color] = (sum[color] ?? 0) + k;
        }
        Object.entries(sum).forEach(([color, v]) => { if (v > best[color]) best[color] = v; });
    }
    return best;
}

// ---- 手を選ぶ（ビューだけを見る） ----

export function chooseCommand(view, level = 'normal', rand = Math.random) {
    if (view.phase === 'swap') {
        const swap = level === 'easy' ? rand() < 0.5 : true;
        return { type: swap ? 'swap' : 'keep' };
    }
    if (view.phase !== 'place') return null;
    const moves = legalMoves(view);
    if (!moves.length) return null;
    let move;
    if (level === 'easy') {
        move = rand() < 0.5
            ? moves.reduce((b, m) => (total(m) > total(b) ? m : b))
            : moves[Math.floor(rand() * moves.length)];
    } else {
        // grow は、ふさぐ効き目を測るための比べる相手（伸ばすだけ。画面からは選べない）
        move = chooseNormal(view, moves, rand, level !== 'grow');
    }
    return { type: 'place', tile: move.tile, cells: move.cells };
}

const total = (m) => Object.values(m.gains).reduce((s, v) => s + v, 0);

function chooseNormal(view, moves, rand, blocking = true) {
    const side = view.sides[view.players[view.you].side];
    const base = utility(side.scores);
    const scored = moves.map(m => {
        const after = { ...side.scores };
        let bonus = 0;
        Object.entries(m.gains).forEach(([c, v]) => {
            const before = after[c];
            after[c] = Math.min(view.maxScore, before + v);
            view.bonusAt.forEach(mark => { if (before < mark && after[c] >= mark) bonus++; });
        });
        return { m, score: utility(after) - base + bonus * BONUS_VALUE + rand() * 0.5 };
    }).sort((x, y) => y.score - x.score);
    // 相手の伸びをふさぐ量を、見込みのよい手だけで比べる
    const opponents = view.sides.filter((s, i) => i !== view.players[view.you].side);
    if (!opponents.length || !blocking) return scored[0].m;
    const weights = opponents.map(s => rankWeights(s.scores));
    const before = opportunity(view, view.board);
    let best = null;
    for (const x of scored.slice(0, SHORTLIST)) {
        const board = [...view.board];
        board[x.m.cells[0]] = x.m.tile[0];
        board[x.m.cells[1]] = x.m.tile[1];
        const after = opportunity(view, board);
        let block = 0;
        weights.forEach(w => COLOR_ORDER.forEach(c => { block += w[c] * (before[c] - after[c]); }));
        const score = x.score + BLOCK_WEIGHT * block / opponents.length;
        if (!best || score > best.score) best = { m: x.m, score };
    }
    return best.m;
}

// CPU 用の乱数（ゲームの乱数とは別）
export const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 操作を待っている CPU に1手打たせる。思わぬ選択を求められたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, level ?? game.players[seat].cpuLevel ?? 'normal', cpuRandom(game, seat));
    if (command && game.applyCommand(seat, command)) return command;
    if (game.phase === 'swap') return game.applyCommand(seat, { type: 'keep' }) ? { type: 'keep' } : null;
    const [cells] = placements(view, seat);
    const fallback = { type: 'place', tile: game.players[seat].hand[0], cells };
    return game.applyCommand(seat, fallback) ? fallback : null;
}
