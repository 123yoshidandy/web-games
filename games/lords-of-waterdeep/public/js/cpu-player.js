/**
 * CPU
 * 打てる手（置く場所・選ぶもの）を1つずつ、ゲームの写しで試し、その後の自分の状態を点数にして一番よい手を選ぶ
 * - 写しでは、見えない山札（クエスト・陰謀・建物）を CPU 用の乱数で混ぜ直す（山札の順をのぞかない）
 * - ゲームの乱数は使わない（記録の再現がずれないように）
 * - 試した後に出る決めごとは、簡単な決め方（greedy）で答えて先へ進めてから点数を付ける
 *
 * 強さ
 * - easy（やさしい）：ロードの目標・プロット・建物の値打ちを考えない
 * - normal（ふつう）：ロードの目標に合うクエストを重く見て、建物とプロットの先の値打ちも数える
 */

import {
    QUEST_BY_ID, LORD_BY_ID, BUILDING_BY_ID, CUBES, RESOURCES, UNIT, units, FAVOR_OPTIONS, ROUNDS
} from './cards.js';

export const CPU_LEVELS = ['easy', 'normal'];
// クエストの見込みの付け方 [そろっていなくても見込む割合, そろい具合の効き方, 重く見るクエストの数]
// ふつう（直線）はやさしいに 2人で約9割勝つ（scripts/cpu-match.mjs で測った）
const TUNING = { easy: [0.15, 2, 3], normal: [0.2, 1, 4] };

export function isCpuTurn(game) {
    const [seat] = game.actors();
    return seat !== undefined && game.players[seat].isCPU;
}

// CPU の番なら1手打つ。打てたら true
export function runCpuStep(game) {
    const [seat] = game.actors();
    if (seat === undefined) return false;
    const level = game.players[seat].cpuLevel ?? 'normal';
    let command = null;
    try {
        command = chooseCommand(game, seat, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    // 思わぬことで決められなかったら、打てる手を順に試す（必ず前へ進める）
    for (const c of candidates(game, seat)) if (game.applyCommand(seat, c)) return true;
    return false;
}

// ---- 打てる手 ----

function combos(n, types) {
    const out = [];
    const walk = (i, left, acc) => {
        if (i === types.length - 1) {
            out.push({ ...acc, [types[i]]: left });
            return;
        }
        for (let k = left; k >= 0; k--) walk(i + 1, left - k, { ...acc, [types[i]]: k });
    };
    walk(0, n, {});
    return out;
}

export function candidates(game, seat) {
    const head = game.queue[0];
    if (!head) return game.legalSpaces(seat).map(space => ({ type: 'place', space }));
    const p = game.players[seat];
    switch (head.type) {
        case 'pick': return combos(head.n, head.types).map(cubes => ({ type: 'pick', cubes }));
        case 'quest': return game.inn.map((_, index) => ({ type: 'quest', index }));
        case 'buy': return game.hall.filter(h => h && (head.free || BUILDING_BY_ID[h.id].cost <= p.res.g)).map(h => ({ type: 'buy', building: h.id }));
        case 'intrigue': {
            const seen = new Set();
            return p.intrigue.map((id, index) => ({ id, index })).filter(({ id }) => !seen.has(id) && seen.add(id)).map(({ index }) => ({ type: 'intrigue', index }));
        }
        case 'opponent': return game.opponents(seat).map(s => ({ type: 'opponent', seat: s }));
        case 'option': return FAVOR_OPTIONS.map((_, index) => ({ type: 'option', index }));
        case 'target': return game.zoarTargets(seat).map(space => ({ type: 'target', space }));
        case 'complete': return [...game.completable(seat).map(quest => ({ type: 'complete', quest })), { type: 'complete', quest: null }];
        default: return [];
    }
}

// ---- 決める ----

export function chooseCommand(game, seat, level) {
    const head = game.queue[0];
    if (head?.type === 'opponent') return chooseOpponent(game, seat, head);
    let list = candidates(game, seat);
    // 達成できるなら必ず達成する（そろった資源を持ち越す得はほとんどない）
    if (head?.type === 'complete' && list.length > 1) list = list.filter(c => c.quest !== null);
    if (list.length <= 1) return list[0] ?? null;
    const salt = hashSalt(game, seat);
    let best = null;
    let bestScore = -Infinity;
    for (const command of list) {
        const score = simulate(game, seat, command, level, salt);
        if (score > bestScore) {
            bestScore = score;
            best = command;
        }
    }
    return best;
}

// 渡すもの（金貨など）は一番点の低い相手へ、義務クエストは一番点の高い相手へ
function chooseOpponent(game, seat, head) {
    const others = game.opponents(seat).map(s => game.players[s]);
    if (head.mandatory) {
        const free = others.filter(p => !game.hasMandatory(p.id));
        const pool = free.length ? free : others;
        return { type: 'opponent', seat: pool.reduce((a, b) => (b.vp > a.vp ? b : a)).id };
    }
    return { type: 'opponent', seat: others.reduce((a, b) => (b.vp < a.vp ? b : a)).id };
}

function hashSalt(game, seat) {
    let h = 2166136261 ^ (game.commands.length * 2654435761) ^ (seat * 40503) ^ (game.round * 97);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return (h ^ (h >>> 15)) >>> 0;
}

function simulate(game, seat, command, level, salt) {
    const sim = game.clone();
    // 見えない山札を混ぜ直す（どの手を試すときも同じ並びにして、公平に比べる）
    sim.rngState = salt;
    sim.shuffle(sim.questDeck);
    sim.shuffle(sim.intrigueDeck);
    sim.shuffle(sim.buildingDeck);
    if (!sim.applyCommand(seat, command)) return -Infinity;
    settle(sim, level);
    return evaluate(sim, seat, level);
}

// 決めごとを簡単な決め方で答えて、だれかが置く番まで進める
function settle(game, level) {
    for (let guard = 0; guard < 40 && game.queue.length; guard++) {
        const head = game.queue[0];
        const command = greedy(game, head.seat, head, level);
        if (command && game.applyCommand(head.seat, command)) continue;
        const fallback = candidates(game, head.seat).find(c => game.applyCommand(head.seat, c));
        if (!fallback) return;
    }
}

// ---- 簡単な決め方（試した後の先へ進めるのに使う） ----

function greedy(game, seat, head, level) {
    const p = game.players[seat];
    switch (head.type) {
        case 'pick': {
            const need = needs(game, seat, level);
            const cubes = {};
            for (let i = 0; i < head.n; i++) {
                const best = head.types.reduce((a, b) => ((need[b] ?? 0) * UNIT[b] + UNIT[b] * 0.1 > (need[a] ?? 0) * UNIT[a] + UNIT[a] * 0.1 ? b : a));
                cubes[best] = (cubes[best] ?? 0) + 1;
                need[best] = Math.max(0, (need[best] ?? 0) - 1);
            }
            return { type: 'pick', cubes };
        }
        case 'quest': {
            let best = 0;
            let bestScore = -Infinity;
            game.inn.forEach((id, index) => {
                const q = QUEST_BY_ID[id];
                const value = questValue(game, seat, q, level);
                const missing = units(shortfall(p.res, q.req));
                const score = value / Math.max(2, units(q.req)) - missing * 0.15;
                if (score > bestScore) {
                    bestScore = score;
                    best = index;
                }
            });
            return { type: 'quest', index: best };
        }
        case 'buy': {
            const options = game.hall.filter(h => h && (head.free || BUILDING_BY_ID[h.id].cost <= p.res.g));
            if (!options.length) return null;
            const best = options.reduce((a, b) => (b.vp + BUILDING_BY_ID[b.id].cost > a.vp + BUILDING_BY_ID[a.id].cost ? b : a));
            return { type: 'buy', building: best.id };
        }
        case 'intrigue': return { type: 'intrigue', index: 0 };
        case 'opponent': return chooseOpponent(game, seat, head);
        case 'option': {
            const need = needs(game, seat, level);
            let best = 0;
            let bestScore = -Infinity;
            FAVOR_OPTIONS.forEach((g, index) => {
                const score = RESOURCES.reduce((s, r) => s + Math.min(g[r] ?? 0, need[r] ?? 0) * UNIT[r] + (g[r] ?? 0) * UNIT[r] * 0.3, 0);
                if (score > bestScore) {
                    bestScore = score;
                    best = index;
                }
            });
            return { type: 'option', index: best };
        }
        case 'target': {
            const [space] = game.zoarTargets(seat);
            return space ? { type: 'target', space } : null;
        }
        case 'complete': {
            const list = game.completable(seat);
            if (!list.length) return { type: 'complete', quest: null };
            const best = list.reduce((a, b) => (questValue(game, seat, QUEST_BY_ID[b], level) > questValue(game, seat, QUEST_BY_ID[a], level) ? b : a));
            return { type: 'complete', quest: best };
        }
        default: return null;
    }
}

// ---- 点数 ----

const shortfall = (res, req) => Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, (req[r] ?? 0) - (res[r] ?? 0))]));

// 受けているクエストを達成するのに足りない資源（価値の高いクエストから順に割り当てた残り）
function needs(game, seat, level) {
    const p = game.players[seat];
    const res = { ...p.res };
    const need = { f: 0, r: 0, w: 0, c: 0, g: 0 };
    rankQuests(game, seat, level).slice(0, 3).forEach(({ q }) => {
        RESOURCES.forEach(r => {
            const req = q.req[r] ?? 0;
            const take = Math.min(res[r], req);
            res[r] -= take;
            need[r] += req - take;
        });
    });
    return need;
}

function rankQuests(game, seat, level) {
    const p = game.players[seat];
    const mandatory = game.hasMandatory(seat);
    return p.quests.map(id => {
        const q = QUEST_BY_ID[id];
        let value = questValue(game, seat, q, level);
        if (mandatory && q.type === 'mandatory') value += 100; // 先に片付けないと、ほかが達成できない
        return { q, value };
    }).sort((a, b) => b.value / Math.max(2, units(b.q.req)) - a.value / Math.max(2, units(a.q.req)));
}

function roundsLeft(game) {
    return Math.max(0, ROUNDS - game.round);
}

// 達成したときに得る点の見込み
export function questValue(game, seat, q, level) {
    const p = game.players[seat];
    const left = roundsLeft(game);
    const r = q.reward;
    let value = (r.vp ?? 0) + units(r) * 0.9 + (r.intrigue ?? 0) * 1.5 + (r.quest ?? 0) * 1.5 + (r.building ? 6 : 0);
    if (q.type === 'mandatory') return value + 4;
    p.plots.forEach(id => {
        const plot = QUEST_BY_ID[id].plot;
        if (plot.kind === 'typeVp' && plot.qtype === q.type) value += 2;
    });
    if (level === 'easy') return value + (q.plot ? 2 : 0);
    const lord = LORD_BY_ID[p.lord];
    if (lord.types.includes(q.type)) value += 4;
    if (q.plot) value += plotValue(q.plot, left);
    return value;
}

function plotValue(plot, left) {
    switch (plot.kind) {
        case 'typeVp': return left * 0.7;
        case 'extra': return left * (plot.res === 'w' || plot.res === 'c' ? 1.6 : 1.1);
        case 'lieutenant': return (left + 1) * 2.4;
        case 'roundPick': return left * 1.6;
        case 'buildVp': return left * 0.6;
        default: return 0;
    }
}

// これから置ける回数の見込み
function placementsLeft(game, p) {
    let total = game.phase === 'place' || game.phase === 'ambassador' ? p.agentsLeft : 0;
    for (let round = game.round + 1; round <= ROUNDS; round++) total += p.agents + (round >= 5 && game.round < 5 ? 1 : 0);
    return total;
}

export function evaluate(game, seat, level) {
    const p = game.players[seat];
    if (game.isOver()) return p.vp;
    const lord = LORD_BY_ID[p.lord];
    const left = roundsLeft(game);
    const capacity = placementsLeft(game, p) * 2.4;
    let v = p.vp;
    const res = { ...p.res };
    rankQuests(game, seat, level).forEach(({ q, value }, i) => {
        const total = units(q.req);
        let covered = 0;
        RESOURCES.forEach(r => {
            const take = Math.min(res[r], q.req[r] ?? 0);
            res[r] -= take;
            covered += take * UNIT[r];
        });
        const missing = total - covered;
        const frac = total ? covered / total : 1;
        const feasible = missing <= 0 ? 1 : Math.max(0, Math.min(1, 1 - missing / (capacity + 0.01)));
        // ふつうは集めた分だけ見込みが増える（直線）。やさしいは、ほぼそろうまで見込みを低く見る
        const [base, exp, keep] = TUNING[level] ?? TUNING.normal;
        v += Math.min(value, 60) * (base + (1 - base) * frac ** exp) * feasible * (i < keep ? 1 : 0.35);
    });
    // 割り当てなかった資源（終わりには冒険者1体1点・金貨2で1点になる）
    v += (res.f + res.r) * 0.8 + (res.w + res.c) * 1.2 + res.g * 0.4;
    v += p.intrigue.length * (left > 0 || p.agentsLeft > 0 ? (level === 'easy' ? 1 : 1.6) : 0.1);
    const owned = game.buildings.filter(b => b.owner === seat).length;
    if (level !== 'easy') {
        v += owned * left * 0.9;
        if (lord.buildings) v += owned * 6;
        else v += p.completed.filter(id => lord.types.includes(QUEST_BY_ID[id].type)).length * 4;
        p.plots.forEach(id => { v += plotValue(QUEST_BY_ID[id].plot, left); });
        if (game.ambassador.holder === seat) v += 2;
        if (game.firstPlayer === seat) v += 0.6;
    } else {
        v += owned * left * 0.3;
    }
    return v;
}

// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(game.actors()[0] === seat)) return null;
    return chooseCommand(game, seat, 'normal');
}
