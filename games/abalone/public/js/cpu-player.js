/**
 * CPU の手を決める（DOM に依存しない）
 * - アバロンには隠す情報がないので、盤の状態をそのまま読む
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 局面の値打ち＝押し出した数の差（重く）＋中央への近さ＋玉のまとまり（隣り合う組の数）
 * - ふつう：アルファベータ法で相手の応手まで2手を読む（押し出す手から調べる）。やさしい：1手だけを読み、揺れが大きく、ときどき3番目までの手を選ぶ
 * - どちらも、すぐ勝てる手は見逃さない。前に出た局面へ戻る手は少し下げる（堂々巡りしないように）
 * - 読む深さと調べる局面の数（NODE_BUDGET）で打ち切る。時間（TIME_LIMIT_MS）は安全弁
 */

import { legalMoves, examineMove, applyMove, positionKey, other, RING, STEP, SIZE, BLACK, WIN_CAPTURES } from './rules.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { depth: 1, noise: 10, sloppy: 0.3 },
    // 3手読みは2手読みに 19勝0敗で強すぎたので、ふつうは2手読みにした
    normal: { depth: 2, noise: 3, sloppy: 0 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

export const TIME_LIMIT_MS = 800;
export const NODE_BUDGET = 40000;
const WIN = 1000000;
const CAPTURE = 120;
const CENTER = 3;
const COHESION = 1;
const REPEAT_PENALTY = 25;
// 中央からの距離ごとの値打ち（外の輪ほど押し出されやすいので、急に下げる）
const RING_VALUE = [14, 12, 9, 4, -8];

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// 局面の値打ち（color の側から見て）
export function evaluate(s, color) {
    const r = s.result;
    if (r) return r.winner === color ? WIN : -WIN;
    const opp = other(color);
    let score = (s.captured[color] - s.captured[opp]) * CAPTURE;
    // 押し出しが勝ちに近いほど、1個の重みを増す
    score += (s.captured[color] ** 2 - s.captured[opp] ** 2) * 6;
    const b = s.board;
    for (let c = 0; c < SIZE; c++) {
        const v = b[c];
        if (!v) continue;
        const sign = v === color ? 1 : -1;
        let value = RING_VALUE[RING[c]] * CENTER / 3;
        // 右・右下・左下の3方向だけ見て、隣り合う同じ色の組を数える
        for (const d of [0, 5, 4]) {
            const n = STEP[c][d];
            if (n !== -1 && b[n] === v) value += COHESION;
        }
        score += sign * value;
    }
    return score;
}

// 調べる順：押し出す手（盤の外へ出す手が先）、3個の手、中央へ向かう手
function ordered(s, moves) {
    return moves.map(m => {
        let k = m.push ? 50 : 0;
        if (m.push) {
            const r = examineMove(s, m.cells, m.dir);
            if (r.pushed.some(([, to]) => to === -1)) k += 100;
        }
        k += m.cells.length * 2;
        return { m, k };
    }).sort((a, b) => b.k - a.k).map(x => x.m);
}

class Stop extends Error {}

function search(s, depth, alpha, beta, ctx) {
    if (s.result || depth === 0) return evaluate(s, s.current);
    if (++ctx.nodes > ctx.budget || ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline)) throw new Stop();
    let best = -Infinity;
    for (const m of ordered(s, legalMoves(s))) {
        const v = -search(applyMove(s, m), depth - 1, -beta, -alpha, ctx);
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
    }
    return best;
}

// 手ごとの値打ち（手番の人から見て）。深さを1から順に深め、打ち切ったらその手前の深さの結果を使う
export function scoreMoves(s, profile = PROFILES.normal, { deadline = Date.now() + TIME_LIMIT_MS, budget = NODE_BUDGET } = {}) {
    const me = s.current;
    const moves = ordered(s, legalMoves(s));
    let scored = moves.map(m => {
        const next = applyMove(s, m);
        return { m, next, score: evaluate(next, me) };
    });
    const ctx = { nodes: 0, budget, deadline };
    for (let depth = 2; depth <= (profile.depth ?? 1); depth++) {
        const sorted = scored.slice().sort((a, b) => b.score - a.score);
        const deeper = [];
        let alpha = -Infinity;
        try {
            for (const item of sorted) {
                const v = item.next.result ? item.score : -search(item.next, depth - 1, -Infinity, -alpha, ctx);
                deeper.push({ ...item, score: v });
                if (v > alpha) alpha = v;
            }
        } catch (error) {
            if (!(error instanceof Stop)) throw error;
            break;
        }
        // 枝刈りした手は「alpha 以下」しか分からないが、順位には読んだ値をそのまま使う
        scored = deeper;
    }
    return scored;
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const s = game.state;
    const moves = game.legalMoves();
    if (moves.length === 0) return null;
    const random = cpuRandom(game, seat);
    if (profile.random) return strip(moves[Math.floor(random() * moves.length)]);
    const scored = scoreMoves(s, profile);
    const winning = scored.find(x => x.next.result?.winner === s.current);
    if (winning) return strip(winning.m);
    for (const x of scored) {
        const seen = game.positions?.[positionKey(x.next)] ?? 0;
        if (seen > 0) x.score -= REPEAT_PENALTY * seen;
    }
    const noisy = scored
        .map(x => ({ ...x, score: x.score + (random() - 0.5) * 2 * (profile.noise ?? 0) }))
        .sort((a, b) => b.score - a.score);
    if (random() < (profile.sloppy ?? 0)) {
        const top = noisy.filter(x => x.score > -WIN / 2).slice(0, 3);
        if (top.length) return strip(top[Math.floor(random() * top.length)].m);
    }
    return strip(noisy[0].m);
}

// ヒント：人の番に、CPU（ふつう）が選ぶ手（盤はすべて見えている）。手は打たない
export function suggest(game, seat) {
    if (game.isOver() || game.current !== seat) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

const strip = (m) => ({ type: 'move', cells: m.cells.slice(), dir: m.dir });

// CPU の1手を進める。選んだ手が通らなければ、通る手を順に試す（止まらないように）
export function runCpuStep(game, seat = game.current, profile = PROFILES.normal) {
    if (game.isOver() || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return game.legalMoves().some(m => game.applyCommand(seat, m));
}

export { BLACK, WIN_CAPTURES };
