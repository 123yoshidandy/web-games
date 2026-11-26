/**
 * CPU の手を決める（DOM に依存しない）
 * - コリドールには隠す情報がないので、盤の状態をそのまま読む
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 局面の値打ち＝相手（4人では一番ゴールに近い相手）の最短の歩数 − 自分の最短の歩数 ＋ 残りの壁の差 × 壁の値打ち
 * - 候補の手は、駒の動ける先と、相手の最短の道を切る壁だけ（ほかの壁は、その場では誰の歩数も変えない）
 * - ふつう：次の手番の人の応手まで2手を読む（応手は、その人にとって一番良い手とみなす）
 *   やさしい：自分の1手だけを読み、壁をあまり使わず、評価の揺れが大きく、ときどき3番目までの手を選ぶ
 * - どちらも、すぐ勝てる手は見逃さない。前に出た局面へ戻る手は少し下げる
 * - 1手の考える時間は TIME_LIMIT_MS で打ち切る（ふつうは読める数で決まり、時間は安全弁）
 */

import { legalActions, applyAction, pawnMoves, wallReason, paths, distances, xOf, yOf, SIZE, SLOTS, positionKey } from './rules.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { depth: 1, noise: 1.2, sloppy: 0.3, wallValue: 1.1 },
    normal: { depth: 2, noise: 0.3, sloppy: 0, wallValue: 0.45 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

export const TIME_LIMIT_MS = 800;
const WIN = 1000;
const REPEAT_PENALTY = 0.6;

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// 局面の値打ち（seat の側から見て）
export function evaluate(state, seat, wallValue = PROFILES.normal.wallValue) {
    const r = state.result;
    if (r) return r.winner === seat ? WIN : -WIN;
    const d = distances(state);
    let rival = Infinity;
    let rivalWalls = 0;
    for (let q = 0; q < d.length; q++) {
        if (q === seat) continue;
        rival = Math.min(rival, d[q]);
        rivalWalls += state.walls[q];
    }
    rivalWalls /= d.length - 1;
    return rival - d[seat] + wallValue * (state.walls[seat] - rivalWalls);
}

// マス a・b の間をふさぐ壁（2つ）
function wallsCutting(a, b) {
    const lo = Math.min(a, b);
    const x = xOf(lo);
    const y = yOf(lo);
    const list = [];
    if (Math.abs(a - b) === SIZE) {
        for (const ax of [x - 1, x]) if (ax >= 0 && ax < SLOTS && y < SLOTS) list.push({ x: ax, y, o: 'h' });
    } else {
        for (const ay of [y - 1, y]) if (ay >= 0 && ay < SLOTS && x < SLOTS) list.push({ x, y: ay, o: 'v' });
    }
    return list;
}

// 手番の人の候補の手：駒の動ける先と、相手の最短の道を切る置ける壁
export function candidateActions(state) {
    if (state.result) return [];
    const seat = state.current;
    const list = pawnMoves(state, seat).map(c => ({ type: 'move', x: xOf(c), y: yOf(c) }));
    if (state.walls[seat] > 0) {
        const ps = paths(state);
        const seen = new Set();
        ps.forEach((path, q) => {
            if (q === seat || !path) return;
            for (let i = 1; i < path.length; i++) {
                for (const w of wallsCutting(path[i - 1], path[i])) {
                    const key = `${w.x},${w.y},${w.o}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    if (!wallReason(state, w, ps)) list.push({ type: 'wall', ...w });
                }
            }
        });
    }
    return list.length ? list : legalActions(state);
}

class TimeUp extends Error {}

// 手ごとの値打ち（手番の人から見て）を並べる
export function scoreActions(state, profile = PROFILES.normal, { deadline = Date.now() + TIME_LIMIT_MS } = {}) {
    const me = state.current;
    const wv = profile.wallValue ?? PROFILES.normal.wallValue;
    const scored = candidateActions(state).map(action => {
        const next = applyAction(state, action);
        return { action, next, score: evaluate(next, me, wv) };
    });
    if ((profile.depth ?? 2) < 2) return scored;
    // 次の手番の人の応手を読む。その人は、自分から見た値打ちが一番高い手を選ぶとみなす
    const deeper = [];
    try {
        for (const item of scored) {
            if (item.next.result) {
                deeper.push(item);
                continue;
            }
            if (Date.now() > deadline) throw new TimeUp();
            const q = item.next.current;
            let best = -Infinity;
            let worstForMe = Infinity;
            for (const reply of candidateActions(item.next)) {
                const after = applyAction(item.next, reply);
                const theirs = evaluate(after, q, wv);
                const mine = evaluate(after, me, wv);
                // 同じ値打ちの応手が並んだら、自分に厳しい方を見る
                if (theirs > best || (theirs === best && mine < worstForMe)) {
                    best = theirs;
                    worstForMe = mine;
                }
            }
            deeper.push({ ...item, score: worstForMe === Infinity ? item.score : worstForMe });
        }
        return deeper;
    } catch (error) {
        if (!(error instanceof TimeUp)) throw error;
        // 読めた手は読んだ値、読めなかった手は1手の値から割り引いた値で比べる
        return deeper.concat(scored.slice(deeper.length).map(x => ({ ...x, score: x.score - 2 })));
    }
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const state = game.state;
    const actions = game.legalActions();
    if (actions.length === 0) return null;
    if (actions.length === 1) return actions[0];
    const random = cpuRandom(game, seat);
    if (profile.random) return actions[Math.floor(random() * actions.length)];
    const scored = scoreActions(state, profile);
    // すぐ勝てる手は必ず選ぶ
    const winning = scored.find(x => x.next.result?.winner === seat);
    if (winning) return winning.action;
    // 前に出た局面へ戻る手は少し下げる（堂々巡りしないように）
    for (const x of scored) {
        const seen = game.positions?.[positionKey(x.next)] ?? 0;
        if (seen > 0) x.score -= REPEAT_PENALTY * seen;
    }
    const noisy = scored
        .map(x => ({ ...x, score: x.score + (random() - 0.5) * 2 * (profile.noise ?? 0) }))
        .sort((a, b) => b.score - a.score);
    if (random() < (profile.sloppy ?? 0)) {
        // 負けがすぐ見える手は避けて、上位3つから選ぶ
        const top = noisy.filter(x => x.score > -WIN / 2).slice(0, 3);
        if (top.length) return strip(top[Math.floor(random() * top.length)].action);
    }
    return strip(noisy[0].action);
}

const strip = (a) => a.type === 'wall' ? { type: 'wall', x: a.x, y: a.y, o: a.o } : a.type === 'move' ? { type: 'move', x: a.x, y: a.y } : { type: a.type };

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
    return game.legalActions().some(a => game.applyCommand(seat, a));
}

// ヒント：人の番に、CPU が選ぶ手を返す（ふつうの読みで、揺れを入れない）。コリドールに隠れた情報はない
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
const HINT_PROFILE = { ...PROFILES.normal, noise: 0 };
export function suggest(game, seat) {
    if (game.isOver() || game.current !== seat) return null;
    return chooseCpuCommand(game, seat, HINT_PROFILE);
}
