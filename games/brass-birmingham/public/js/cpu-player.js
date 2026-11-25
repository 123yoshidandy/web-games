/**
 * CPU の手の選び方
 * 候補の手（建てる・ネットワーク・売る・開発・借りる・パス）を、ルールの関数で写しの状態に試し、
 * 試したあとの盤面の良さ（得点＋見込み＋収入＋お金）が一番高い手を選ぶ
 * 見るのは盤面と自分の手札だけ（山札の並びやほかの人の手札は見ない）。ゲームの乱数は使わない
 */

import { INDUSTRIES, INDUSTRY_ORDER, LOCATIONS, tileDef } from './data.js';
import {
    buildOptions, networkOptions, sellOptions, developOptions, canLoan, trial, eraPoints, incomeLevel, roundsPerEra,
    distances, slotLoc, merchantAccepts, networkOf, nextLevel, buildBlocker, currentSeat, locationLinkValue
} from './rules.js';
import { LINK_BY_ID } from './data.js';

export const PROFILES = {
    // ふつう：相手を気にせず、評価に揺れを混ぜる。鉄道は1本ずつ
    normal: { name: 'ふつう', noise: 3, wOpp: 0, doubleRail: false, wIncome: 0.22, lookCarry: 0.4 },
    // つよい：相手の得を少し引き、鉄道の2本引きも考える
    strong: { name: 'つよい', noise: 0, wOpp: 0.25, doubleRail: true, wIncome: 0.15, lookCarry: 0.7, sellBias: 1.15 }
};

const PASS_PENALTY = 2;       // パスは1手を捨てるので、少し下げる
const LOAN_WHEN_BELOW = 12;  // パスしかないとき、お金がこれより少なければ借りる

export const LEVELS = Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [k, v.name]));

export function cpuActors(game) {
    const seat = game.turn;
    return seat !== null && seat !== undefined && game.players[seat]?.isCPU ? [seat] : [];
}

// このラウンドのあとに残るラウンドの数
function roundsLeft(state) {
    const per = roundsPerEra(state.numPlayers);
    return state.era === 'canal' ? per - state.round + per : per - state.round;
}

// お金の値。鉄道の時代の終わりが近いほど、使い道がないので下げる
function moneyValue(state, money, left) {
    const base = money <= 25 ? money * 0.32 : 8 + (money - 25) * 0.15;
    if (state.era === 'canal' || left >= 2) return base;
    return base * (left === 1 ? 0.5 : 0.05);
}

// まだ裏返っていないタイルが、終わりまでに裏返りそうな見込み
function flipChance(state, slot, tile, dist, profile) {
    const def = INDUSTRIES[tile.industry];
    if (def.sell) {
        const ok = Object.keys(state.merchants).some(m => merchantAccepts(state, m, tile.industry) && dist[slotLoc(m)] !== undefined);
        return Math.min(0.95, (ok ? 0.8 : state.era === 'canal' ? 0.35 : 0.45) * (profile.sellBias ?? 1));
    }
    if (def.resource === 'beer') return 0.7;
    return Math.max(0.3, 1 - tile.cubes * 0.12);
}

function playerValue(state, seat, profile, left) {
    const p = state.players[seat];
    const canal = state.era === 'canal';
    const ep = eraPoints(state, seat);
    let v = p.vp + ep.links + ep.tiles;
    const late = canal ? 1 : Math.min(1, (left + 1) / 3);
    for (const [slot, tile] of Object.entries(state.board)) {
        if (tile.owner !== seat) continue;
        const td = tileDef(tile.industry, tile.level);
        const carries = canal && tile.level >= 2;
        if (tile.flipped) {
            if (carries) v += td.vp * profile.lookCarry;
            continue;
        }
        const chance = flipChance(state, slot, tile, distances(state, [slotLoc(slot)]), profile) * late;
        const levels = td.income / (p.incomeSpace < 30 ? 2 : 3);
        v += chance * (td.vp * (carries ? 1 + profile.lookCarry * 0.6 : 1) + levels * left * profile.wIncome + td.link * 0.6);
    }
    // 自分のリンクの見込み（隣の町の、まだ裏返っていないタイルの分）
    for (const [id, owner] of Object.entries(state.links)) {
        if (owner !== seat) continue;
        for (const loc of LINK_BY_ID[id].ends) {
            if (!LOCATIONS[loc]) continue;
            for (const [slot, tile] of Object.entries(state.board)) {
                if (!tile.flipped && slotLoc(slot) === loc) v += tileDef(tile.industry, tile.level).link * 0.45;
            }
            const empty = LOCATIONS[loc].slots.filter((_, i) => !state.board[`${loc}:${i}`]).length;
            v += empty * 0.25 * (canal ? 1 : late);
        }
    }
    v += incomeLevel(p.incomeSpace) * (left + (state.era === 'rail' && left === 0 ? 0 : 0.5)) * profile.wIncome;
    v += moneyValue(state, p.money, left);
    // 開発の見込み：鉄道の時代に建てられないレベル1が残っていると困る
    const per = roundsPerEra(state.numPlayers);
    for (const ind of INDUSTRY_ORDER) {
        const level = nextLevel(p, ind);
        if (!level) continue;
        const td = tileDef(ind, level);
        if (td.canalOnly) v -= canal ? (state.round >= per - 2 ? 1.2 : 0.2) : 3;
        v += td.vp * 0.04;
    }
    if (canal) v += networkOf(state, seat).size * 0.35;
    return v;
}

function evaluate(state, seat, profile) {
    const left = roundsLeft(state);
    let v = playerValue(state, seat, profile, left);
    if (profile.wOpp > 0) {
        let opp = 0;
        state.players.forEach((_, s) => {
            if (s === seat) return;
            const p = state.players[s];
            const ep = eraPoints(state, s);
            opp += p.vp + ep.links + ep.tiles + incomeLevel(p.incomeSpace) * left * profile.wIncome;
        });
        v -= profile.wOpp * opp / Math.max(1, state.numPlayers - 1);
    }
    return v;
}

// 手札のカードを残しておく値（捨てるカードを選ぶのに使う）
function cardValue(state, seat, card) {
    if (card.kind === 'wildLoc' || card.kind === 'wildInd') return 6;
    const p = state.players[seat];
    if (card.kind === 'ind') return card.industries.some(ind => nextLevel(p, ind)) ? 1.2 : 0.2;
    const def = LOCATIONS[card.loc];
    let count = 0;
    def.slots.forEach((allowed, i) => allowed.forEach(ind => {
        if (!buildBlocker(state, seat, `${card.loc}:${i}`, ind)) count++;
    }));
    return count > 0 ? 1 + Math.min(count, 3) * 0.4 : 0.1;
}

function cheapestCard(state, seat, ids = null) {
    const hand = state.players[seat].hand.filter(c => !ids || ids.includes(c.id));
    let best = null;
    for (const card of hand) {
        const v = cardValue(state, seat, card);
        if (!best || v < best.v) best = { id: card.id, v };
    }
    return best;
}

// 決まった揺れ（同じ局面と手なら同じ値）。ゲームの乱数は使わない
function noise(state, command, amount) {
    if (!amount) return 0;
    const text = `${state.era}${state.round}${state.turnIdx}${state.actionsLeft}${JSON.stringify(command)}`;
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (((h >>> 0) % 1000) / 1000 - 0.5) * 2 * amount;
}

export function chooseCommand(state, seat, profile = PROFILES.normal) {
    const hand = state.players[seat].hand;
    const discard = cheapestCard(state, seat);
    const candidates = [];
    const add = (command, after, cardCost) => {
        const score = evaluate(after, seat, profile) - cardCost * 0.4 + noise(state, command, profile.noise);
        candidates.push({ command, score });
    };

    for (const o of buildOptions(state, seat)) {
        const card = cheapestCard(state, seat, o.cards);
        add({ type: 'build', card: card.id, slot: o.slot, industry: o.industry }, o.after, card.v);
    }

    const singles = networkOptions(state, seat).map(o => ({ ...o, score: evaluate(o.after, seat, profile) }));
    singles.forEach(o => add({ type: 'network', card: discard.id, links: [o.id] }, o.after, discard.v));
    if (state.era === 'rail' && profile.doubleRail) {
        singles.sort((a, b) => b.score - a.score).slice(0, 4).forEach(first => {
            for (const o of networkOptions(state, seat, first.id)) {
                add({ type: 'network', card: discard.id, links: [first.id, o.id] }, o.after, discard.v);
            }
        });
    }

    // 売る：一番よい売り方を1つずつ足していく
    let sold = [];
    let soldAfter = null;
    let soldScore = -Infinity;
    for (;;) {
        const options = sellOptions(state, seat, sold);
        let best = null;
        for (const o of options) {
            const score = evaluate(o.after, seat, profile);
            if (!best || score > best.score) best = { ...o, score };
        }
        if (!best || (sold.length > 0 && best.score <= soldScore)) break;
        sold = [...sold, { slot: best.slot, merchant: best.merchant }];
        soldAfter = best.after;
        soldScore = best.score;
    }
    if (sold.length > 0) add({ type: 'sell', card: discard.id, sales: sold }, soldAfter, discard.v);

    const developSingles = developOptions(state, seat);
    developSingles.forEach(o => add({ type: 'develop', card: discard.id, industries: [o.industry] }, o.after, discard.v));
    developSingles.slice(0, 3).forEach(first => {
        for (const o of developOptions(state, seat, first.industry)) {
            add({ type: 'develop', card: discard.id, industries: [first.industry, o.industry] }, o.after, discard.v);
        }
    });

    if (canLoan(state, seat)) {
        const t = trial(state, seat, { type: 'loan', card: discard.id });
        if (t.ok) add({ type: 'loan', card: discard.id }, t.state, discard.v);
    }

    const pass = trial(state, seat, { type: 'pass', card: discard.id });
    if (pass.ok) add({ type: 'pass', card: discard.id }, pass.state, discard.v);
    candidates.forEach(c => { if (c.command.type === 'pass') c.score -= PASS_PENALTY; });

    if (candidates.length === 0) return { type: 'pass', card: hand[0].id };
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0].command;
    // パスしかないほどお金がないなら、終わりまでまだあるうちは借りる
    if (best.type === 'pass' && roundsLeft(state) >= 2 && state.players[seat].money < LOAN_WHEN_BELOW) {
        const loan = candidates.find(c => c.command.type === 'loan');
        if (loan) return loan.command;
    }
    return best;
}

// CPU の1手を進める。選んだ手が断られたら（想定外のとき）、パスで必ず前に進める
export function runCpuStep(game, seat, profile = PROFILES.normal) {
    if (currentSeat(game.state) !== seat) return false;
    const command = chooseCommand(game.state, seat, profile);
    if (game.applyCommand(seat, command)) return true;
    const card = game.state.players[seat].hand[0];
    return !!card && game.applyCommand(seat, { type: 'pass', card: card.id });
}

// 画面で、捨てるカードの初期値に使う（残しておく値が一番低いカード）
export function suggestDiscard(state, seat, ids = null) {
    return cheapestCard(state, seat, ids)?.id ?? null;
}
