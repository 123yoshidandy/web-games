/**
 * CPU とヒント（DOM に依存しない。ゲームの乱数は使わない）
 * CPU が解き終える時刻は、ルールの側（game.js の cpuFinishTime）がシードから決める。ここでは宝石の列を選ぶ
 * suggest(state, seat)：その席が今できる操作（解くときは解答、宝石のときは列）。ヒント・テスト・通し試験で使う
 */

import { solve } from './solver.js';
import { placedCells } from './pieces.js';
import { puzzleOf, pickerOf, reachableRows, GEMS_PER_TAKE, sortedCounts } from './game.js';

// 列の宝石を取ったあとの点（多い色をさらに伸ばすほど高い。同じ色ばかりの順位の決め方に合わせる）
function scoreRow(state, seat, row, focus) {
    const gems = { ...state.gems[seat] };
    state.gemRows[row].slice(0, GEMS_PER_TAKE).forEach(color => { gems[color] += 1; });
    const counts = sortedCounts(gems);
    if (!focus) return counts.reduce((sum, n) => sum + n, 0);
    // 一番多い色を重く、2番目以降を軽く（同点のときの比べ方）
    return counts.reduce((sum, n, i) => sum + n * 100 ** (counts.length - 1 - i) / 100 ** (counts.length - 2), 0);
}

// 宝石の列を選ぶ。やさしい CPU は数だけを見て、ほかは色をそろえる
export function chooseRow(state, seat) {
    const rows = reachableRows(state);
    const focus = state.level !== 'easy' || !state.players[seat].isCPU;
    let best = rows[0];
    let bestScore = -Infinity;
    for (const row of rows) {
        const score = scoreRow(state, seat, row, focus) - Math.abs(row - state.pawns[seat]) * 1e-6;
        if (score > bestScore) {
            best = row;
            bestScore = score;
        }
    }
    return best;
}

// CPU が今する操作（宝石を取る番の CPU がいれば { seat, command }）。なければ null
export function cpuCommand(state) {
    const seat = pickerOf(state);
    if (seat === null || !state.players[seat].isCPU) return null;
    return { seat, command: { type: 'pick', row: chooseRow(state, seat) } };
}

// おすすめの操作
export function suggest(state, seat) {
    if (state.phase === 'play' && state.results[seat] === null) {
        const puzzle = puzzleOf(state, seat);
        const solution = solve(puzzle.shape, puzzle.pieces)[0];
        return solution ? { type: 'submit', placements: solution } : null;
    }
    if (state.phase === 'collect' && pickerOf(state) === seat) return { type: 'pick', row: chooseRow(state, seat) };
    return null;
}

const cellKeys = (placement) => placedCells(placement).map(([x, y]) => `${x},${y}`);
const sameCells = (a, b) => a.id === b.id && cellKeys(a).sort().join(' ') === cellKeys(b).sort().join(' ');

// ヒント：盤面に正しいピースを1つ置く。置いてあるピースのままで解けるならその続き、
// 解けなければ解答の1つから選び、ぶつかるピースをトレイに戻す
// 返り値 { place, remove: [ピースの id] }。置くものがなければ null
export function hintMove(puzzle, placed) {
    const continued = solve(puzzle.shape, puzzle.pieces, { fixed: placed })[0];
    if (continued) {
        const place = continued.find(p => !placed.some(q => q.id === p.id));
        return place ? { place, remove: [] } : null;
    }
    const solution = solve(puzzle.shape, puzzle.pieces)[0];
    if (!solution) return null;
    const place = solution.find(p => !placed.some(q => sameCells(p, q)));
    if (!place) return null;
    const cells = new Set(cellKeys(place));
    const remove = placed.filter(q => q.id === place.id || cellKeys(q).some(k => cells.has(k))).map(q => q.id);
    return { place, remove };
}
