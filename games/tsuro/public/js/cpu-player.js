/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（盤・駒・自分の手札・山の枚数）だけを見て決める。山の並びとほかの人の手札はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ビューから作った別の乱数で決める
 *
 * ふつう：
 * - 置ける手（手札3枚 × 向き）を全部試し、駒の動きをたどる
 * - 自分が生き残る手を選ぶ。相手を盤の外へ出す・ぶつける手は高く見る。最後の相手を出せば勝ち
 * - 数手先：置いたあとに自分の前のマスへ「まだ見えていないタイル」が置かれたとき、生き残れる割合を見る
 *   さらに、残りの手札で次の手番に生き残れるか（その先の生き残りやすさも）を見る
 *   相手の生き残りやすさは、低いほどよい。盤の縁から遠いマスに面しているほうがよい
 * - どうしても脱落するなら、残りの全員を道連れにして引き分けにできる手を選ぶ
 * - 駒を置く：ほかの駒と同じマスに面さない、隅でない印を選ぶ
 * やさしい：置ける手から当てずっぽうに選ぶ（自分から脱落する手は、ルールで置けない）
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { TILE_COUNT, SIZE, START_MARKS, DISTINCT_ROTATIONS, simulate, rowOf, colOf } from './tiles.js';

export const CPU_LEVELS = ['easy', 'normal'];

// 点の重み（scripts/cpu-match.mjs で勝率を比べて決めた）
export const TUNING = { kill: 100, safety: 30, hand: 15, oppSafety: 12, edge: 1.5 };

// 自分の手札（試合ごとに違う）も混ぜる。手数と席だけだと、最初に駒を置く印が毎試合同じになる
const cpuRandom = (view) => {
    let seed = Math.imul(view.turn + 1, 0x9E3779B1) ^ Math.imul(view.you + 1, 0x85EBCA6B) ^ Math.imul(view.freeMarks.length + 1, 0x27D4EB2F);
    (view.players[view.you].hand ?? []).forEach(tile => { seed = Math.imul(seed ^ (tile + 1), 0x165667B1); });
    return createRandom(seed >>> 0);
};

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current]?.isCPU;

// ---- 盤の読み ----

const markersOf = (players) => players.filter(p => p.alive && p.pos).map(p => ({ seat: p.id, pos: p.pos }));

// 置いたあとの盤と駒
function applyMoves(board, markers, cell, placed, moves) {
    const nextBoard = [...board];
    nextBoard[cell] = placed;
    const gone = new Set(moves.filter(m => m.out).map(m => m.seat));
    const moved = new Map(moves.map(m => [m.seat, m.pos]));
    const nextMarkers = markers.filter(m => !gone.has(m.seat)).map(m => ({ seat: m.seat, pos: moved.get(m.seat) ?? m.pos }));
    return { board: nextBoard, markers: nextMarkers };
}

// まだ見えていないタイル（盤にも自分の手札にもないもの）。ほかの人の手札と山のどれか
const unseenTiles = (board, hand) => {
    const seen = new Set([...board.filter(Boolean).map(b => b.tile), ...hand]);
    return Array.from({ length: TILE_COUNT }, (_, i) => i).filter(t => !seen.has(t));
};

// seat の前のマスに、tiles のどれかがどれかの向きで置かれたとき、seat が生き残る割合（0〜1）
function survival(board, markers, seat, tiles) {
    const me = markers.find(m => m.seat === seat);
    if (!me || !tiles.length) return 0;
    let ok = 0;
    let all = 0;
    tiles.forEach(tile => {
        for (let rot = 0; rot < DISTINCT_ROTATIONS[tile]; rot++) {
            const moves = simulate(board, markers, me.pos.cell, { tile, rot });
            all++;
            if (!moves.some(m => m.seat === seat && m.out)) ok++;
        }
    });
    return ok / all;
}

// 残りの手札で、次の手番に生き残れるか（0：無理、1〜2：生き残れて、その先も安全なほど高い）
function handOutlook(board, markers, seat, hand, unseen) {
    const me = markers.find(m => m.seat === seat);
    if (!me) return 0;
    let best = 0;
    hand.forEach(tile => {
        for (let rot = 0; rot < DISTINCT_ROTATIONS[tile]; rot++) {
            const placed = { tile, rot };
            const moves = simulate(board, markers, me.pos.cell, placed);
            if (moves.some(m => m.seat === seat && m.out)) continue;
            const after = applyMoves(board, markers, me.pos.cell, placed, moves);
            best = Math.max(best, 1 + survival(after.board, after.markers, seat, unseen));
            if (best >= 2) return;
        }
    });
    return best;
}

// 盤の縁からの近さ（縁のマスは 0、内側ほど大きい）
const edgeDistance = (cell) => Math.min(rowOf(cell), colOf(cell), SIZE - 1 - rowOf(cell), SIZE - 1 - colOf(cell));

// ---- 手を選ぶ ----

export function chooseMark(view, level) {
    const random = cpuRandom(view);
    const free = view.freeMarks;
    if (level === 'easy') return free[Math.floor(random() * free.length)];
    const faced = new Set(view.players.filter(p => p.pos).map(p => p.pos.cell));
    let best = free[0];
    let bestScore = -Infinity;
    free.forEach(mark => {
        const cell = START_MARKS[mark].cell;
        const corner = (rowOf(cell) === 0 || rowOf(cell) === SIZE - 1) && (colOf(cell) === 0 || colOf(cell) === SIZE - 1);
        const score = (faced.has(cell) ? -8 : 0) + (corner ? -3 : 0) + random();
        if (score > bestScore) {
            bestScore = score;
            best = mark;
        }
    });
    return best;
}

export function scoreMoves(view) {
    const seat = view.you;
    const me = view.players[seat];
    const board = view.board.map(b => b ? { tile: b.tile, rot: b.rot } : null);
    const markers = markersOf(view.players);
    const cell = me.pos.cell;
    const others = markers.filter(m => m.seat !== seat).map(m => m.seat);
    return view.moves.filter(m => m.allowed).map(move => {
        const placed = { tile: move.tile, rot: move.rot };
        const moves = simulate(board, markers, cell, placed);
        const gone = new Set(moves.filter(m => m.out).map(m => m.seat));
        const killed = others.filter(s => gone.has(s)).length;
        const left = others.length - killed;
        if (gone.has(seat)) return { move, score: -1000 + (left === 0 ? 500 : 0) + killed * 10 };
        if (left === 0) return { move, score: 10000 };
        const after = applyMoves(board, markers, cell, placed, moves);
        const hand = [...me.hand];
        hand.splice(hand.indexOf(move.tile), 1);
        const unseen = unseenTiles(after.board, hand);
        const pool = [...unseen, ...hand];
        const mine = after.markers.find(m => m.seat === seat);
        const safety = survival(after.board, after.markers, seat, pool);
        const outlook = handOutlook(after.board, after.markers, seat, hand, unseen);
        const rivals = after.markers.filter(m => m.seat !== seat);
        const oppSafety = rivals.length ? rivals.reduce((s, m) => s + survival(after.board, after.markers, m.seat, pool), 0) / rivals.length : 0;
        const score = TUNING.kill * killed + TUNING.safety * safety + TUNING.hand * outlook
            - TUNING.oppSafety * oppSafety + TUNING.edge * edgeDistance(mine.pos.cell);
        return { move, score };
    });
}

export function chooseMove(view, level) {
    const random = cpuRandom(view);
    const allowed = view.moves.filter(m => m.allowed);
    if (!allowed.length) return null;
    if (level === 'easy') return allowed[Math.floor(random() * allowed.length)];
    // 同じ点の手は、迷いの乱数で選ぶ
    let best = null;
    let bestScore = -Infinity;
    scoreMoves(view).forEach(({ move, score }) => {
        const noisy = score + random() * 0.01;
        if (noisy > bestScore) {
            bestScore = noisy;
            best = move;
        }
    });
    return best;
}

export function decide(view, level) {
    if (view.phase === 'place') return { type: 'place', mark: chooseMark(view, level) };
    const move = chooseMove(view, level);
    return move ? { type: 'play', tile: move.tile, rotation: move.rot } : null;
}

// ヒント：人のビューから、おすすめの手（CPU の「ふつう」が選ぶ手）を返す。自分の番でなければ null
export function suggest(view) {
    if (view.over || view.current !== view.you || !view.players[view.you]?.alive) return null;
    if (view.phase === 'play' && !view.moves?.length) return null;
    return decide(view, 'normal');
}

// CPU の番なら1手打つ。打てたら true
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    const p = game.players[seat];
    const level = p.cpuLevel ?? 'normal';
    const view = createGameView(game, seat);
    const command = decide(view, level);
    if (command && game.applyCommand(seat, command)) return true;
    // 思わぬ答えで断られたら、いちばん単純な手で進める
    const fallback = view.phase === 'place'
        ? { type: 'place', mark: view.freeMarks[0] }
        : (() => {
            const m = view.moves.find(x => x.allowed);
            return m ? { type: 'play', tile: m.tile, rotation: m.rot } : null;
        })();
    return !!fallback && game.applyCommand(seat, fallback);
}
