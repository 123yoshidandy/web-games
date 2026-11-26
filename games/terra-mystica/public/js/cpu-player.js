/**
 * CPU の手を決める（DOM に依存しない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 手番の行動は、候補ごとに状態を写して打ってみて、評価（勝利点＋収入・資源・宗教の段・つながりの見込み）が
 *   一番上がるものを選ぶ。足りない資源は魔力などの交換で補う。どれも上がらなければパスする
 * - 選択（恩恵タイル・町タイル・魔力のもらい・鋤の使い道など）は、簡単な決まりで選ぶ
 * - easy（やさしい）は、評価に大きな揺れと、ときどきの誤りを混ぜる。normal（ふつう）は揺れが小さい
 * - strong（強さを測る比較用）は揺れがない
 */

import Game, { CONVERSIONS } from './game.js';
import { FACTIONS, CULTS, BONUS_CARDS, FAVOR_TILES, TOWN_TILES, NETWORK_VP, CULT_VP, ROUNDS, BUILDING_INFO, POWER_ACTIONS, SCORE_TILES } from './data.js';
import { HEXES, LAND, ADJ, BRIDGE_PAIRS, hexDistance, wheelDistance } from './map.js';
import { TERRAINS } from './data.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { noise: 4, blunder: 0.2, passMargin: 1.5, depth: 1 },
    normal: { noise: 0.4, blunder: 0, passMargin: 0.3, depth: 2, width: 5 },
    strong: { noise: 0, blunder: 0, passMargin: 0.3, depth: 2, width: 5 },
    flat: { noise: 0, blunder: 0, passMargin: 0.3, depth: 1 }
};

// 画面で選ぶ強さ
export const LEVELS = { easy: 'やさしい', normal: 'ふつう' };

// 今操作が必要な CPU の席
export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// seat の CPU に1手（交換を含めて数手）打たせる。決めた手が断られたら、いちばん単純な答えで前に進める
export function runCpuStep(game, seat, profile = PROFILES.normal) {
    if (!game.actors().includes(seat)) return false;
    let commands = [];
    try {
        commands = chooseCpuCommands(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    let applied = 0;
    for (const command of commands) {
        if (!game.applyCommand(seat, command)) break;
        applied++;
    }
    if (applied > 0 && applied === commands.length) return true;
    // 本命が断られたら（交換だけが通ったときも）、いちばん単純な答えで進める
    return fallback(game, seat) || applied > 0;
}

// どうしても決まらないときの答え（必ず前に進む）
function fallback(game, seat) {
    const w = game.waiting();
    if (!w || w.seat !== seat) return true;
    const tries = {
        place: () => LAND.map(hex => ({ type: 'place', hex })),
        bonus: () => Object.keys(game.state.bonusPool).map(id => ({ type: 'bonus', id })),
        spades: () => [{ type: 'done' }],
        favor: () => game.availableFavors(seat).map(id => ({ type: 'favor', id })),
        town: () => Object.keys(TOWN_TILES).map(id => ({ type: 'town', id })),
        leech: () => [{ type: 'leech', accept: false }],
        cultist: () => CULTS.map(track => ({ type: 'cultist', track })),
        darklings: () => [{ type: 'darklings', n: 0 }],
        action: () => [{ type: 'pass', bonus: Object.keys(game.state.bonusPool)[0] }, { type: 'pass' }]
    }[w.kind]?.() ?? [];
    return tries.some(command => game.applyCommand(seat, command));
}

// ヒント：seat のおすすめの手（CPU の「ふつう」が選ぶ手のうち、交換を除いた本命の1手）。seat が答える番でなければ null
export function suggest(game, seat) {
    if (game.state.phase === 'end' || !game.actors().includes(seat)) return null;
    const commands = chooseCpuCommands(game, seat, PROFILES.normal);
    return commands.filter(command => command.type !== 'convert').at(-1) ?? commands.at(-1) ?? null;
}

export function chooseCpuCommands(game, seat, profile = PROFILES.normal) {
    const w = game.waiting();
    const random = cpuRandom(game, seat);
    switch (w.kind) {
    case 'place': return [{ type: 'place', hex: choosePlacement(game, seat, random) }];
    case 'bonus': return [{ type: 'bonus', id: chooseBonus(game, seat) }];
    case 'favor': return [{ type: 'favor', id: chooseFavor(game, seat) }];
    case 'town': return [{ type: 'town', id: chooseTown(game, seat) }];
    case 'leech': return [{ type: 'leech', accept: chooseLeech(game, seat, w) }];
    case 'cultist': return [{ type: 'cultist', track: bestCultTrack(game, seat, 1) }];
    case 'darklings': return [{ type: 'darklings', n: Math.min(3, game.players[seat].res.W) }];
    case 'spades': return chooseSpades(game, seat, w);
    case 'action': return chooseAction(game, seat, profile, random);
    default: return [];
    }
}

// ---- 準備 ----

function choosePlacement(game, seat, random) {
    const s = game.state;
    const home = game.home(seat);
    const own = game.ownHexes(seat);
    let best = null;
    let bestScore = -Infinity;
    LAND.forEach(hex => {
        if (s.hexes[hex].terrain !== home || s.hexes[hex].building) return;
        let score = 0;
        ADJ[hex].forEach(n => {
            const h = s.hexes[n];
            if (!HEXES[n].land) score += 0.4;
            else if (h.building) score += h.owner === seat ? -1 : 1.2;
            else score += [2, 1.2, 0.5, 0.1][wheelDistance(h.terrain, home, TERRAINS)];
        });
        own.forEach(o => {
            const d = hexDistance(o, hex);
            if (d === 2) score += 2.5;
            else if (d === 3) score += 1;
            else if (d === 1) score -= 1.5;
        });
        score += random() * 0.6;
        if (score > bestScore) {
            bestScore = score;
            best = hex;
        }
    });
    return best;
}

function bonusValue(game, seat, id, coins = 0) {
    const p = game.players[seat];
    const card = BONUS_CARDS[id];
    const inc = card.income;
    let v = (inc.C ?? 0) * 0.4 + (inc.W ?? 0) * 1.1 + (inc.P ?? 0) * 1.6 + (inc.PW ?? 0) * 0.35 + coins * 0.4;
    if (card.passVp) Object.entries(card.passVp).forEach(([b, vp]) => { v += vp * (p.buildings[b] + (b === 'D' ? 1 : 0)) * 0.6; });
    if (card.action === 'spade') v += 1.8;
    if (card.action === 'cult') v += 1.2;
    if (card.ship && FACTIONS[p.faction].ship.max > 0) v += 0.8;
    return v;
}

function chooseBonus(game, seat) {
    const pool = game.state.bonusPool;
    return Object.keys(pool).sort((a, b) => bonusValue(game, seat, b, pool[b]) - bonusValue(game, seat, a, pool[a]))[0];
}

// ---- 選択 ----

function roundsLeft(game) {
    return Math.max(0, ROUNDS - game.state.round);
}

function favorValue(game, seat, id) {
    const p = game.players[seat];
    const f = FAVOR_TILES[id];
    const R = roundsLeft(game);
    let v = 0;
    Object.entries(f.cult).forEach(([track, n]) => { v += cultStepValue(game, seat, track, n); });
    if (f.income) v += ((f.income.C ?? 0) * 0.4 + (f.income.W ?? 0) * 1.1 + (f.income.PW ?? 0) * 0.3) * R;
    if (f.buildVp?.D) v += 2 * Math.min(8 - p.buildings.D, R * 1.3);
    if (f.buildVp?.TP) v += 3 * Math.min(4 - p.buildings.TP, R * 0.6);
    if (f.passTp) v += 2.5 * R;
    if (f.action) v += 0.9 * R;
    if (f.townSize) v += p.keys === 0 ? 2.5 : 1;
    return v;
}

function chooseFavor(game, seat) {
    const list = game.availableFavors(seat);
    return list.sort((a, b) => favorValue(game, seat, b) - favorValue(game, seat, a))[0];
}

function chooseTown(game, seat) {
    const pool = game.state.townPool;
    const value = (id) => {
        const t = TOWN_TILES[id];
        let v = t.vp;
        const g = t.gain ?? {};
        v += (g.C ?? 0) * 0.4 + (g.W ?? 0) * 1.1 + (g.P ?? 0) * 1.6 + (g.PW ?? 0) * 0.3;
        if (t.cult) v += sumOf(CULTS.map(track => cultStepValue(game, seat, track, 1)));
        return v;
    };
    return Object.keys(pool).filter(id => pool[id] > 0).sort((a, b) => value(b) - value(a))[0];
}

function chooseLeech(game, seat, w) {
    const { amount, vp } = game.leechAmount(w);
    if (amount <= 0) return false;
    if (vp === 0) return true;
    const R = roundsLeft(game);
    if (R === 0) return vp <= 1 && amount >= 2 && game.state.round < ROUNDS;
    if (vp <= 2) return true;
    return vp <= 3 && R >= 3;
}

// 宗教の段を n 進める価値（魔力の段・順位の見込み）
function cultStepValue(game, seat, track, n) {
    const p = game.players[seat];
    const pos = p.cult[track];
    let to = Math.min(pos + n, 10);
    if (to === 10 && !game.canAdvanceCult(seat, track)) to = 9;
    if (pos === 9 && !game.canAdvanceCult(seat, track)) return 0;
    let v = (to - pos) * 0.5;
    [[3, 1], [5, 2], [7, 2], [10, 3]].forEach(([step, pw]) => { if (pos < step && to >= step) v += pw * 0.35; });
    const others = game.players.filter(o => o.id !== seat).map(o => o.cult[track]);
    const top = Math.max(0, ...others);
    if (pos <= top && to > top) v += 2;
    else if (to > top - 2 && to <= top) v += 0.5;
    const tile = SCORE_TILES[game.state.scoreTiles[game.state.round - 1]];
    if (tile && tile.cult === track && game.state.round < ROUNDS && Math.floor(to / tile.req) > Math.floor(pos / tile.req)) v += 1.5;
    return v;
}

function bestCultTrack(game, seat, n) {
    return [...CULTS].sort((a, b) => cultStepValue(game, seat, b, n) - cultStepValue(game, seat, a, n))[0];
}

// 鋤の使い道：建てられる土地・自分の建物の近く・変える鋤の少ない土地を選ぶ
function chooseSpades(game, seat, w) {
    const s = game.state;
    const home = game.home(seat);
    let best = null;
    let bestScore = -Infinity;
    LAND.forEach(hex => {
        game.hexOptions(seat, hex).forEach(opt => {
            const c = opt.command;
            let score = 0;
            if (c.type === 'build') score = 100;
            else {
                const after = game.clone();
                if (!after.applyCommand(seat, c)) return;
                const becomesHome = after.state.hexes[hex].terrain === home;
                const ownNear = ADJ[hex].filter(n => s.hexes[n].owner === seat).length;
                const others = ADJ[hex].filter(n => s.hexes[n].building && s.hexes[n].owner !== seat).length;
                score = (becomesHome ? 6 : 1) + ownNear * 1.5 + others * 0.8;
                if (becomesHome && w.canBuild && !w.built && after.checkDwelling(seat, hex, { needReach: false }).ok) score += 8;
                if (c.full) score -= 2;
                const cost = opt.cost ?? {};
                score -= (cost.W ?? 0) * 0.6 + (cost.P ?? 0) * 1.2;
            }
            if (score > bestScore) {
                bestScore = score;
                best = c;
            }
        });
    });
    return [best ?? { type: 'done' }];
}

// ---- 手番の行動 ----

function chooseAction(game, seat, profile, random) {
    const weights = { ...WEIGHTS, ...profile.w };
    const base = evaluate(game, seat, weights);
    let scored = scorePlans(game, seat, weights, base);
    // 上位の候補は、続けて自分がもう1手打った先まで読む（ほかの人の手は読まない）
    if (profile.depth > 1) {
        scored.sort((a, b) => b.value - a.value);
        scored.slice(0, profile.width).forEach(item => {
            if (item.plan.at(-1).type === 'pass' || !item.after) return;
            const next = item.after;
            if (next.isOver() || next.state.phase !== 'actions' || next.state.queue.length > 0) return;
            next.state.current = seat;
            next.state.turnDone = false;
            const follow = scorePlans(next, seat, weights, base).filter(x => x.plan.at(-1).type !== 'pass');
            const bestFollow = Math.max(-Infinity, ...follow.map(x => x.value));
            if (bestFollow > item.value) item.value = item.value * 0.4 + bestFollow * 0.6;
        });
    }
    let best = null;
    let bestValue = -Infinity;
    scored.forEach(item => {
        item.value += (random() * 2 - 1) * profile.noise;
        if (item.value > bestValue) {
            bestValue = item.value;
            best = item.plan;
        }
    });
    if (profile.blunder > 0 && scored.length > 1 && random() < profile.blunder) {
        const pick = scored[Math.floor(random() * scored.length)];
        return pick.plan;
    }
    const pass = scored.find(x => x.plan.at(-1).type === 'pass');
    if (pass && best && best.at(-1).type !== 'pass' && bestValue < pass.value + profile.passMargin) return pass.plan;
    return best ?? [passCommand(game, seat)];
}

// 候補ごとに打ってみて、評価の増え方を出す
function scorePlans(game, seat, weights, base) {
    const scored = [];
    actionCandidates(game, seat).forEach(plan => {
        const after = game.clone();
        for (const c of plan) {
            if (!after.applyCommand(seat, c)) return;
        }
        resolveOwn(after, seat);
        scored.push({ plan, value: evaluate(after, seat, weights) - base, after });
    });
    return scored;
}

function passCommand(game, seat) {
    if (game.state.round >= ROUNDS) return { type: 'pass' };
    return { type: 'pass', bonus: chooseBonus(game, seat) };
}

// 自分の続きの選択（鋤・恩恵・町など）を、簡単な決まりで最後まで進める（評価のための先読み）
function resolveOwn(game, seat) {
    for (let guard = 0; guard < 12; guard++) {
        const w = game.waiting();
        if (!w || w.seat !== seat || w.kind === 'action' || w.kind === 'leech') return;
        const commands = chooseCpuCommands(game, seat, PROFILES.strong);
        if (!commands.length || !game.applyCommand(seat, commands[0])) {
            if (!fallback(game, seat)) return;
        }
    }
}

// 足りない資源を、交換で補う手順（補えなければ null）
export function paymentPlan(game, seat, cost) {
    const p = game.players[seat];
    const need = { C: 0, W: 0, P: 0, ...cost };
    const res = { ...p.res };
    let pw = [...p.power];
    const plan = [];
    const usePower = (n) => {
        // 3つ目の器から n 使う。足りなければ燃やす
        if (pw[2] < n) {
            const burn = n - pw[2];
            if (pw[1] < burn * 2) return false;
            pw = [pw[0], pw[1] - burn * 2, pw[2] + burn];
            plan.push({ type: 'convert', kind: 'burn', n: burn });
        }
        pw = [pw[0] + n, pw[1], pw[2] - n];
        return true;
    };
    const powerNeed = need.PW ?? 0;
    if (powerNeed > 0 && pw[2] < powerNeed) {
        const burn = powerNeed - pw[2];
        if (pw[1] < burn * 2) return null;
        pw = [pw[0], pw[1] - burn * 2, pw[2] + burn];
        plan.push({ type: 'convert', kind: 'burn', n: burn });
    }
    const spare = () => pw[2] - powerNeed;
    // 司祭
    if (res.P < need.P) {
        const n = need.P - res.P;
        if (spare() + Math.floor(pw[1] / 2) < 5 * n) return null;
        if (!usePower(5 * n)) return null;
        plan.push({ type: 'convert', kind: 'PW>P', n });
        res.P += n;
    }
    // 職人
    if (res.W < need.W) {
        let n = need.W - res.W;
        const byPower = Math.min(n, Math.floor((spare() + Math.floor(pw[1] / 2)) / 3));
        if (byPower > 0 && usePower(3 * byPower)) {
            plan.push({ type: 'convert', kind: 'PW>W', n: byPower });
            res.W += byPower;
            n -= byPower;
        }
        if (n > 0) {
            const byPriest = Math.min(n, res.P - need.P);
            if (byPriest < n) return null;
            plan.push({ type: 'convert', kind: 'P>W', n });
            res.P -= n;
            res.W += n;
        }
    }
    // コイン
    if (res.C < need.C) {
        let n = need.C - res.C;
        const byPower = Math.min(n, spare() + Math.floor(pw[1] / 2));
        if (byPower > 0 && usePower(byPower)) {
            plan.push({ type: 'convert', kind: 'PW>C', n: byPower });
            res.C += byPower;
            n -= byPower;
        }
        if (n > 0) {
            const byWorker = Math.min(n, res.W - need.W);
            if (byWorker > 0) {
                plan.push({ type: 'convert', kind: 'W>C', n: byWorker });
                res.W -= byWorker;
                n -= byWorker;
            }
        }
        if (n > 0 && p.faction === 'alchemists' && res.VP - n >= 0) {
            plan.push({ type: 'convert', kind: 'VP>C', n });
            n = 0;
        }
        if (n > 0) return null;
    }
    return plan;
}

// 手の候補（交換の手順＋本命の操作）
function actionCandidates(game, seat) {
    const p = game.players[seat];
    const out = [];
    const withCost = (command, cost) => {
        const plan = paymentPlan(game, seat, cost ?? {});
        if (plan) out.push([...plan, command]);
    };
    LAND.forEach(hex => game.hexOptions(seat, hex).forEach(opt => withCost(opt.command, opt.cost)));
    withCost({ type: 'ship' }, { C: 4, P: 1 });
    if (game.fac(seat).dig.cost) withCost({ type: 'dig' }, game.fac(seat).dig.cost);
    if (p.res.P > 0 || p.power[2] + Math.floor(p.power[1] / 2) >= 5) {
        CULTS.forEach(track => [3, 2, 1].forEach(steps => {
            if (game.checkPriest(seat, track, steps).ok || p.res.P === 0) withCost({ type: 'priest', track, steps }, { P: 1 });
        }));
    }
    Object.entries(POWER_ACTIONS).forEach(([id, act]) => {
        if (game.state.powerUsed[id] !== undefined) return;
        if (id === 'ACT1') {
            bridgeCandidates(game, seat).forEach(bridge => withCost({ type: 'power', id, bridge }, { PW: act.cost }));
            return;
        }
        withCost({ type: 'power', id }, { PW: act.cost });
    });
    game.availableSpecials(seat).forEach(id => {
        if (id === 'BON2' || id === 'FAV6' || id === 'ACTA') out.push([{ type: 'special', id, track: bestCultTrack(game, seat, id === 'ACTA' ? 2 : 1) }]);
        else if (id === 'BON1' || id === 'ACTG' || id === 'ACTC') out.push([{ type: 'special', id }]);
        else if (id === 'ACTW') {
            LAND.filter(hex => game.checkSpecial(seat, { id, hex }).ok).forEach(hex => out.push([{ type: 'special', id, hex }]));
        } else if (id === 'ACTN') {
            LAND.filter(hex => game.checkSpecial(seat, { id, hex }).ok).forEach(hex => out.push([{ type: 'special', id, hex }]));
        } else if (id === 'ACTE') {
            if (game.canPay(seat, { W: 2 })) bridgeCandidates(game, seat).forEach(bridge => out.push([{ type: 'special', id, bridge }]));
        } else if (id === 'ACTS') {
            game.ownHexes(seat).filter(hex => game.checkSpecial(seat, { id, hex }).ok).forEach(hex => out.push([{ type: 'special', id, hex }]));
        }
    });
    out.push([passCommand(game, seat)]);
    return out;
}

// 架けられる橋のうち、向こう岸が空き地か自分の建物のもの（ほかの人の建物へ架けても得がない）
function bridgeCandidates(game, seat) {
    const s = game.state;
    return BRIDGE_PAIRS.filter(pair => game.checkBridge(seat, pair).ok
        && pair.every(id => !s.hexes[id].building || s.hexes[id].owner === seat));
}

const sumOf = (list) => list.reduce((a, b) => a + b, 0);

// 評価の重み
export const WEIGHTS = {
    cv: [0.28, 0.005], wv: [0.3, 0.05], pv: [0.4, 0.08], income: 0.8,
    building: { D: 2, TP: 4, TE: 5, SH: 8, SA: 8 },
    netRank: 0.6, net: 0.8, sh: 3
};

// 要塞の力の、ラウンドあたりの値（W.sh の代わり。ないものは W.sh）
// 巨人の鋤2つ・遊牧民の砂嵐・魔女の飛行は、毎ラウンドの無料の住居に近い
const SH_VALUE = { giants: 5, nomads: 4.5, witches: 4.5, swarmlings: 4, chaosmagicians: 4 };

// 盤面の評価（その席から見た、勝利点に直した値）
export function evaluate(game, seat, W = WEIGHTS) {
    const s = game.state;
    const p = game.players[seat];
    const f = FACTIONS[p.faction];
    const R = s.phase === 'end' ? 0 : roundsLeft(game);
    let v = p.res.VP;
    if (s.phase === 'end') return v;
    // 資源（終わりが近いほど、3コインで1点の価値に近づく）
    const cv = W.cv[0] + W.cv[1] * R;
    const wv = W.wv[0] + W.wv[1] * R;
    const pv = W.pv[0] + W.pv[1] * R;
    v += p.res.C * cv + p.res.W * wv + p.res.P * pv + p.power[2] * (0.2 + 0.03 * R) + p.power[1] * (0.1 + 0.02 * R) + p.power[0] * 0.02 * R;
    // これからの収入（ボーナスカードを除く）
    const saveBonus = p.bonus;
    p.bonus = null;
    const inc = game.income(seat);
    p.bonus = saveBonus;
    v += (inc.C * 0.4 + inc.W * 1.0 + inc.P * 1.5 + inc.PW * 0.3) * R * W.income;
    // 建物そのもの（町・改良・つながりへの足場）
    const g = Math.min(R, 4) / 4;
    Object.entries(p.buildings).forEach(([b, n]) => { v += W.building[b] * n * g; });
    // 宗教の段（最後の順位の見込みと、魔力の段）
    CULTS.forEach(track => {
        const values = game.players.map(o => o.cult[track]);
        const pts = Game.rankPoints(values, CULT_VP)[seat];
        v += pts * 0.8 + p.cult[track] * 0.25;
    });
    // つながり
    const nets = game.players.map(o => game.networkSize(o.id));
    v += Game.rankPoints(nets, NETWORK_VP)[seat] * W.netRank + nets[seat] * W.net;
    // 鋤と航海の段（この先の変換と届く範囲）
    // 巨人は変換がいつも鋤2つなので、鋤の改良の値も2倍
    v += p.dig * 1.1 * Math.min(R, 4) * (p.faction === 'giants' ? 2 : 1);
    if (f.ship.max > 0) v += p.ship * 0.7 * Math.min(R, 3);
    // 要塞・聖域の力
    if (p.buildings.SH) v += (SH_VALUE[p.faction] ?? W.sh) * R;
    // 技師の要塞：自分の建物どうしをつなぐ橋は、パスのたびに3点
    if (p.faction === 'engineers' && p.buildings.SH) {
        const linked = s.bridges.filter(b => b.owner === seat && s.hexes[b.a].owner === seat && s.hexes[b.b].owner === seat).length;
        v += linked * 3 * R;
    }
    // 恩恵タイルの、これから効く分
    p.favors.forEach(id => {
        const fav = FAVOR_TILES[id];
        if (fav.buildVp?.D) v += 2 * Math.min(8 - p.buildings.D, R * 1.2);
        if (fav.buildVp?.TP) v += 3 * Math.min(4 - p.buildings.TP, R * 0.5);
        if (fav.passTp) v += fav.passTp[Math.min(4, p.buildings.TP + 1)] * R * 0.8;
        if (fav.action) v += 0.8 * R;
    });
    // 町の見込み（まだ町でない、自分の建物のかたまりの魔力）
    const groupPower = townProgress(game, seat);
    if (R > 0) v += Math.min(groupPower, 7) * 0.35;
    // 建てられる土地が近くにあるか（次の手の広がり）
    if (R > 0) {
        const home = f.terrain;
        const own = game.ownHexes(seat);
        let open = 0;
        own.forEach(o => ADJ[o].forEach(n => {
            const h = s.hexes[n];
            if (HEXES[n].land && !h.building) open += h.terrain === home ? 1 : 0.3;
        }));
        v += Math.min(open, 6) * 0.15;
    }
    // 交易所は隣に人がいると安く、寺院・聖域は恩恵につながる
    v += (BUILDING_INFO.D.max - p.buildings.D <= 0 ? -1 : 0);
    return v;
}

function townProgress(game, seat) {
    const s = game.state;
    const own = game.ownHexes(seat).filter(h => !s.hexes[h].town);
    const seen = new Set();
    let best = 0;
    own.forEach(start => {
        if (seen.has(start)) return;
        let power = 0;
        const stack = [start];
        seen.add(start);
        while (stack.length) {
            const a = stack.pop();
            power += BUILDING_INFO[s.hexes[a].building].power;
            game.townLinks(seat, a).forEach(b => {
                if (!seen.has(b) && !s.hexes[b].town) {
                    seen.add(b);
                    stack.push(b);
                }
            });
        }
        best = Math.max(best, power);
    });
    return best;
}

export { CONVERSIONS };
