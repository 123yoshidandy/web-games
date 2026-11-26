/**
 * CPU の手を決める（DOM に依存しない）
 * - サントリーニには隠す情報がないので、盤の状態をそのまま読む
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 手番を、操作の列（動く→建てる、神の力の追加の操作を含む）として数え上げ、同じ結果になる列は1つにまとめる
 * - 局面の値打ち＝自分の職人の良さ − 相手（3人では一番良い相手）の職人の良さ
 *   職人の良さ：段の高さ・上れる先・2段にいて隣に3段がある（次に勝てる）・中央への近さ
 * - ふつう：相手（3人では次の人）の応手まで読む。やさしい：自分の番だけを読み、揺れが大きく、ときどき3番目までの手を選ぶ
 * - どちらも、すぐ勝てる手は見逃さない
 * - 置く番は、1人ずつ、中央に近く相手に近いマスを選ぶ
 * - 1手の考える時間は TIME_LIMIT_MS で打ち切る（安全弁）
 */

import { legalSteps, applyStep, NEIGHBORS, ownerAt, xOf, yOf, stepKey } from './rules.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { depth: 1, noise: 4, sloppy: 0.4, naive: true },
    normal: { depth: 2, noise: 0.4, sloppy: 0 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

export const TIME_LIMIT_MS = 800;
const WIN = 100000;
const HEIGHT_VALUE = [0, 3, 8, 0];
const THREAT = 12;
// 1つの手番で調べる途中の局面の数の上限（ヘルメスが歩き回る場合など）。自分の番と、読む応手
const MAX_NODES = 2000;
const REPLY_NODES = 300;

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

const centrality = (c) => 2 - Math.max(Math.abs(xOf(c) - 2), Math.abs(yOf(c) - 2));

// 職人たちの良さ。threat：2段にいて、隣に上れる3段がある（次の自分の番に勝てる）
function workerValue(s, seat) {
    let v = 0;
    let anyThreat = false;
    for (const w of s.workers[seat]) {
        const h = s.height[w];
        v += HEIGHT_VALUE[h] + centrality(w) * 0.6;
        let climbs = 0;
        let threat = false;
        for (const n of NEIGHBORS[w]) {
            if (s.dome[n] || ownerAt(s, n) >= 0) continue;
            const nh = s.height[n];
            if (nh > h + 1) continue;
            v += 0.15;
            if (nh === h + 1) climbs++;
            if (h === 2 && nh === 3) threat = true;
        }
        v += Math.min(climbs, 2) * (h + 1) * 0.6;
        if (threat) {
            v += THREAT;
            anyThreat = true;
        }
    }
    return { v, threat: anyThreat };
}

const athenaBlocks = (s, seat) => s.gods.some((g, p) => p !== seat && g === 'athena' && s.alive[p] && s.athena[p]);

// 局面の値打ち（seat の側から見て）
// 次に動く人に脅しがあれば（アテナに止められていなければ）、その人はほぼ勝ち。naive（やさしい）は手番を見ない
export function evaluate(s, seat, naive = false) {
    const r = s.result;
    if (r) return r.winner === seat ? WIN : -WIN;
    if (!s.alive[seat]) return -WIN;
    const mover = s.phase === 'turn' && !naive ? s.current : -1;
    let rival = -Infinity;
    let mine = 0;
    for (let q = 0; q < s.players; q++) {
        if (!s.alive[q]) continue;
        const { v, threat } = workerValue(s, q);
        const value = threat && q === mover && !athenaBlocks(s, q) ? v + WIN / 20 : v;
        if (q === seat) mine = value;
        else rival = Math.max(rival, value);
    }
    return mine - rival;
}

const stateKey = (s) => `${s.current}|${s.workers.map(w => w.slice().sort((a, b) => a - b).join(',')).join('/')}|${s.height.join('')}|${s.dome.map(Number).join('')}|${s.alive.map(Number).join('')}|${s.athena.map(Number).join('')}`;

class TimeUp extends Error {}

// 今の手番の人の、手番の終わりまでの操作の列を数え上げる。[{ steps, state }]
export function enumerateTurns(state, { deadline = Infinity, maxNodes = MAX_NODES } = {}) {
    const seat = state.current;
    const leaves = new Map();
    const seen = new Set();
    let nodes = 0;
    // 幅優先で進める（ヘルメスは同じ段を何マスでも歩けるので、再帰にすると深くなりすぎる。短い列が先に見つかる）
    const queue = [{ s: state, steps: [] }];
    for (let head = 0; head < queue.length && nodes < maxNodes; head++) {
        const { s, steps } = queue[head];
        if ((++nodes & 31) === 0 && Date.now() > deadline) throw new TimeUp();
        for (const step of legalSteps(s)) {
            const next = applyStep(s, step);
            const list = [...steps, step];
            if (next.result || next.current !== seat || next.phase !== s.phase) {
                const key = stateKey(next);
                if (!leaves.has(key)) leaves.set(key, { steps: list, state: next });
                continue;
            }
            const key = `${stateKey(next)}|${JSON.stringify(next.turn)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ s: next, steps: list });
        }
    }
    return [...leaves.values()];
}

// 置く番：中央に近く、相手の職人に近いマスを選ぶ
function choosePlacement(game, random, profile) {
    const s = game.state;
    const seat = s.current;
    const others = s.workers.flatMap((w, p) => p === seat ? [] : w);
    const scored = legalSteps(s).map(step => {
        const c = step.to;
        let v = centrality(c) * 2;
        for (const o of others) v -= Math.max(Math.abs(xOf(c) - xOf(o)), Math.abs(yOf(c) - yOf(o))) * 0.4;
        // 自分の職人どうしは、少し離す
        for (const m of s.workers[seat]) if (Math.max(Math.abs(xOf(c) - xOf(m)), Math.abs(yOf(c) - yOf(m))) < 2) v -= 1;
        return { step, v: v + (random() - 0.5) * (profile.noise ?? 0) };
    }).sort((a, b) => b.v - a.v);
    return [scored[0].step];
}

// 手番の操作の列を選ぶ
export function chooseCpuTurn(game, seat = game.current, profile = PROFILES.normal) {
    const s = game.state;
    if (game.isOver() || s.current !== seat) return [];
    const random = cpuRandom(game, seat);
    if (profile.random) {
        const steps = game.legalSteps();
        return [steps[Math.floor(random() * steps.length)]];
    }
    if (s.phase === 'place') return choosePlacement(game, random, profile);
    const deadline = Date.now() + TIME_LIMIT_MS;
    let turns;
    try {
        turns = enumerateTurns(s, { deadline });
    } catch (error) {
        if (!(error instanceof TimeUp)) throw error;
        turns = [];
    }
    if (turns.length === 0) return [game.legalSteps()[0]];
    const winning = turns.find(t => t.state.result?.winner === seat);
    if (winning) return winning.steps;
    let scored = turns.map(t => ({ ...t, score: evaluate(t.state, seat, !!profile.naive) }));
    if ((profile.depth ?? 2) >= 2) scored = readReplies(scored, seat, deadline);
    const noisy = scored
        .map(x => ({ ...x, score: x.score + (random() - 0.5) * 2 * (profile.noise ?? 0) }))
        .sort((a, b) => b.score - a.score);
    if (random() < (profile.sloppy ?? 0)) {
        const top = noisy.filter(x => x.score > -WIN / 2).slice(0, 3);
        if (top.length) return top[Math.floor(random() * top.length)].steps;
    }
    return noisy[0].steps;
}

// 次の手番の人の応手を読む。その人は、自分から見た値打ちが一番高い手を選ぶとみなす
// 2人なら、相手の一番良い手は自分の一番悪い手なので、自分の値打ちの最小で枝刈りする
function readReplies(scored, seat, deadline) {
    scored.sort((a, b) => b.score - a.score);
    const out = [];
    let best = -Infinity;
    try {
        for (const item of scored) {
            if (Date.now() > deadline) throw new TimeUp();
            const s = item.state;
            if (s.result || s.phase !== 'turn') {
                out.push(item);
                continue;
            }
            const q = s.current;
            const twoPlayers = s.alive.filter(Boolean).length === 2;
            let mine = Infinity;
            let theirsBest = -Infinity;
            for (const reply of enumerateTurns(s, { deadline, maxNodes: REPLY_NODES })) {
                const after = reply.state;
                const m = evaluate(after, seat);
                if (twoPlayers) {
                    if (m < mine) mine = m;
                    if (mine <= best) break; // これより良くならない
                } else {
                    const t = evaluate(after, q);
                    if (t > theirsBest || (t === theirsBest && m < mine)) {
                        theirsBest = t;
                        mine = m;
                    }
                }
            }
            // 3人では、次の人が2つ先の人の勝ち筋をふさぐとは限らないので、2つ先の人に脅しを残す手は下げる
            if (!twoPlayers) {
                for (let r = 0; r < s.players; r++) {
                    if (r !== seat && r !== q && s.alive[r] && workerValue(s, r).threat && !athenaBlocks(s, r)) mine -= WIN / 40;
                }
            }
            const score = mine === Infinity ? item.score : mine;
            if (score > best) best = score;
            out.push({ ...item, score });
        }
        return out;
    } catch (error) {
        if (!(error instanceof TimeUp)) throw error;
        // 読めなかった手は、1手の値から割り引いて比べる
        const done = new Set(out.map(x => x.steps));
        return out.concat(scored.filter(x => !done.has(x.steps)).map(x => ({ ...x, score: x.score - 20 })));
    }
}

// CPU の手番を最後まで進める（オンライン対戦・CPU 同士の対戦用）。選んだ列が通らなければ、通る操作を順に試す
// 人の席のおすすめの1歩（ヒント）。CPU（ふつう）が考えた番の最初の1歩。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.isOver() || seat !== game.current) return null;
    return chooseCpuTurn(game, seat, PROFILES.normal)[0] ?? game.legalSteps()[0] ?? null;
}

export function runCpuStep(game, seat = game.current, profile = PROFILES.normal) {
    if (game.isOver() || seat !== game.current) return false;
    let plan = [];
    try {
        plan = chooseCpuTurn(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    let progressed = false;
    for (const step of plan) {
        if (game.current !== seat || !game.applyCommand(seat, step)) break;
        progressed = true;
    }
    if (!progressed) {
        const first = game.legalSteps()[0];
        progressed = !!first && game.applyCommand(seat, first);
    }
    // 番の途中で止まったら、建てる・終える操作を優先して番を終える
    const midTurn = () => {
        const t = game.state.turn;
        return game.state.phase === 'turn' && (t.moves > 0 || t.builds > 0 || t.prebuilt);
    };
    let guard = 0;
    while (!game.isOver() && game.current === seat && midTurn() && guard++ < 20) {
        const steps = game.legalSteps();
        const step = steps.find(a => a.type === 'build') ?? steps.find(a => a.type === 'end') ?? steps[0];
        if (!step || !game.applyCommand(seat, step)) break;
    }
    return progressed;
}

export const sameStep = (a, b) => stepKey(a) === stepKey(b);
