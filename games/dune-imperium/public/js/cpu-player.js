/**
 * CPU とヒント（DOM に依存しない）
 * 効果の部品ごとに「今の自分にとっての値打ち」を見積もり、一番値打ちの高い手を選ぶ
 *   ふつう：いつも一番の手。戦いでは、順位が上がるときだけ戦闘の陰謀カードを使う
 *   やさしい：上位の手から迷って選ぶ。買い物や紛争に送る部隊も気まぐれで、戦闘の陰謀カードは使わない
 * 迷いには、ゲームの乱数ではなく、手数と席から作った別の乱数を使う（ゲームの乱数を消費すると、記録の再現がずれる）
 */

import { CARD_BY_ID, SPACE_BY_ID, INTRIGUE_BY_ID, CONFLICT_BY_ID, LEADER_BY_ID, FACTIONS, SELL_RATES, RESERVE } from './cards.js';
import { canPay } from './game.js';
import { createRandom } from './random.js';

export const CPU_LEVELS = ['easy', 'normal'];

const TRASH_ORDER = ['dagger', 'recon', 'dunePlanet', 'diplomacy', 'convincing'];

const BASE = { solari: 0.9, spice: 1.5, water: 1.6 };
// ソラリは場所の費用にしか使わないので、払う値打ちは低めに見る
const PAY_RATE = { solari: 0.72, spice: 1, water: 1 };

// 資源1つの値打ち。持っている量が多いほど・終盤ほど下げる（使わずに抱えたまま終わらないように）
function unitValue(game, p, k) {
    const have = p[k];
    let v = BASE[k] * (have >= 10 ? 0.45 : have >= 6 ? 0.75 : 1);
    if (game.round >= 9) v *= 0.6;
    if (k === 'solari' && p.swordmaster) v *= 0.85;
    return v;
}

// 払うものの値打ち（game と p がなければ、今の状態によらない見積もり）
function costValue(cost, game = null, p = null) {
    return Object.entries(cost ?? {}).reduce((sum, [k, n]) => sum + n * PAY_RATE[k] * (game ? unitValue(game, p, k) : BASE[k]), 0);
}

function influenceValue(game, seat, f) {
    const p = game.players[seat];
    const cur = p.influence[f];
    if (cur >= 6) return 0;
    let v = 1.5;
    if (cur + 1 === 2) v += 6;
    if (cur + 1 === 4 && !p.bonusTaken[f]) v += 2;
    const holder = game.alliance[f];
    if (cur + 1 >= 4 && holder !== seat && (holder === null || cur + 1 > game.players[holder].influence[f])) v += 6;
    if (holder !== null && holder !== seat && game.players[holder].influence[f] - cur <= 2) v += 1;
    return v;
}

// 効果の並びの値打ち
export function valueOf(game, seat, effects, ctx = {}) {
    return (effects ?? []).reduce((sum, e) => sum + atomValue(game, seat, e, ctx), 0);
}

function atomValue(game, seat, e, ctx) {
    const p = game.players[seat];
    const level = CONFLICT_BY_ID[game.conflict]?.level ?? 1;
    if (e.solari) return e.solari * unitValue(game, p, 'solari');
    if (e.spice) return e.spice * unitValue(game, p, 'spice');
    if (e.water) return e.water * unitValue(game, p, 'water');
    if (e.troops) return e.troops * (0.9 + level * 0.25);
    if (e.draw) return e.draw * (game.phase === 'turns' && !p.hasRevealed ? 1.3 : 0.2);
    if (e.intrigue) return e.intrigue * 1.6;
    if (e.vp) return e.vp * 7;
    if (e.persuasion) return e.persuasion * 0.9;
    if (e.swords) return e.swords * (p.troopsIn > 0 ? 0.6 : 0.25);
    if (e.influence) {
        if (e.influence === 'any') return Math.max(0, ...FACTIONS.map(f => influenceValue(game, seat, f)));
        const f = e.influence === 'space' ? SPACE_BY_ID[ctx.space]?.icon : e.influence;
        return FACTIONS.includes(f) ? influenceValue(game, seat, f) : 0;
    }
    if (e.trash) return [...p.hand, ...p.discard, ...p.deck].some(id => TRASH_ORDER.includes(id)) ? 1 : 0;
    if (e.trashSelf) return 0.5;
    if (e.pay) return canPay(p, e.pay) ? Math.max(0, valueOf(game, seat, e.then, ctx) - costValue(e.pay, game, p)) : 0;
    if (e.choice) return Math.max(...e.choice.map(c => valueOf(game, seat, c, ctx)));
    if (e.bond) return 0.5 * valueOf(game, seat, e.then, ctx);
    if (e.needInfluence) return Object.entries(e.needInfluence).every(([f, n]) => p.influence[f] >= n) ? valueOf(game, seat, e.then, ctx) : 0;
    if (e.ifCouncil) return p.council ? valueOf(game, seat, e.ifCouncil, ctx) : 0;
    if (e.signet) return valueOf(game, seat, LEADER_BY_ID[p.leader].signet, ctx);
    if (e.council) return p.council ? 0 : (game.round <= 6 ? 7 : 3);
    if (e.swordmaster) return game.round <= 3 ? 10 : game.round <= 5 ? 7 : 1.5;
    if (e.mentat) return 2.5;
    if (e.foldspace) return 1;
    if (e.steal) return game.players.filter(o => o.id !== seat && o.intrigue.length >= 4).length * 1.6;
    if (e.harvest) {
        const n = e.harvest + (game.bonusSpice[ctx.space] ?? 0);
        return p.leader === 'ariana' ? (n - 1) * 1.5 + 1.3 : n * 1.5;
    }
    if (e.sell) return Math.max(0, ...Object.entries(SELL_RATES).filter(([n]) => p.spice >= Number(n)).map(([n, s]) => (s + (p.leader === 'memnon' ? 2 : 0)) * unitValue(game, p, 'solari') - Number(n) * unitValue(game, p, 'spice')));
    if (e.control) return 2;
    return 0;
}

// カードの値打ち（買うときの見積もり。今の状態によらない）
const STATIC = { persuasion: 1, swords: 0.6, draw: 1.2, intrigue: 1.4, troops: 1, solari: 0.9, spice: 1.3, water: 1.4, vp: 7 };
function staticValue(effects) {
    return (effects ?? []).reduce((sum, e) => {
        const key = Object.keys(STATIC).find(k => e[k]);
        if (key) return sum + e[key] * STATIC[key];
        if (e.influence) return sum + 2.5;
        if (e.trash) return sum + 1;
        if (e.pay) return sum + Math.max(0.3, staticValue(e.then) - costValue(e.pay));
        if (e.bond || e.needInfluence) return sum + 0.5 * staticValue(e.then);
        return sum;
    }, 0);
}

export function cardWorth(id) {
    const c = CARD_BY_ID[id];
    return 0.7 * staticValue(c.agent) + staticValue(c.reveal) + staticValue(c.acquire) + 0.25 * c.icons.length + (c.anySpace ? 1 : 0);
}

function revealValue(game, seat, id) {
    return valueOf(game, seat, CARD_BY_ID[id].reveal, { card: id });
}

// エージェントを置く手の値打ち
export function placementValue(game, seat, { card, space }) {
    const p = game.players[seat];
    const id = p.hand[card];
    const s = SPACE_BY_ID[space];
    const c = CARD_BY_ID[id];
    const ctx = { space, card: id };
    let v = valueOf(game, seat, s.effects, ctx) + valueOf(game, seat, c.agent, ctx) - costValue(game.spaceCost(seat, s), game, p);
    if (FACTIONS.includes(s.icon)) v += influenceValue(game, seat, s.icon);
    if (s.control && game.control[space] === seat) v += valueOf(game, seat, [s.control], ctx);
    if (s.combat) {
        const level = CONFLICT_BY_ID[game.conflict]?.level ?? 1;
        const troops = (s.effects.find(e => e.troops)?.troops ?? 0) + Math.min(2, p.garrison);
        v += Math.min(troops, 4) * (0.3 + 0.35 * level);
    }
    return v - 0.7 * revealValue(game, seat, id);
}

const ranked = (list, score) => list.map(item => ({ item, v: score(item) })).sort((a, b) => b.v - a.v);

function randomFor(game, seat) {
    return createRandom((game.commands.length * 7919 + seat * 104729 + game.round * 31 + 17) >>> 0);
}

// やさしい：上位3つから、上ほど選ばれやすく選ぶ
function pickEasy(list, rand) {
    const top = list.slice(0, 3);
    const weights = [0.55, 0.3, 0.15].slice(0, top.length);
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < top.length; i++) {
        r -= weights[i];
        if (r <= 0) return top[i].item;
    }
    return top[0].item;
}

function choosePending(game, seat, level, rand) {
    const pd = game.pending;
    const p = game.players[seat];
    const easy = level === 'easy';
    const index = (() => {
        switch (pd.kind) {
            case 'deploy':
                return easy ? Math.floor(rand() * pd.options.length) : pd.options.length - 1;
            case 'faction': {
                const list = ranked(pd.options.map((f, i) => i), i => influenceValue(game, seat, pd.options[i]));
                return easy ? pickEasy(list, rand) : list[0].item;
            }
            case 'pay':
                return valueOf(game, seat, pd.then, pd.ctx) > costValue(pd.cost, game, p) - 0.2 ? 0 : 1;
            case 'choice': {
                const list = ranked(pd.options.map((_, i) => i), i => valueOf(game, seat, pd.options[i], pd.ctx));
                return list[0].item;
            }
            case 'trash': {
                if (easy && rand() < 0.5) return pd.options.length - 1;
                for (const id of TRASH_ORDER) {
                    const i = pd.options.findIndex(o => o.id === id && o.zone !== 'hand');
                    if (i >= 0) return i;
                }
                for (const id of TRASH_ORDER) {
                    const i = pd.options.findIndex(o => o.id === id);
                    if (i >= 0) return i;
                }
                return pd.options.length - 1;
            }
            case 'sell':
                return easy ? Math.floor(rand() * pd.options.length) : pd.options.length - 1;
            default:
                return 0;
        }
    })();
    return { type: 'choose', index };
}

function chooseCombat(game, seat, level) {
    if (level === 'easy') return { type: 'pass' };
    const p = game.players[seat];
    const mine = game.strength(seat);
    const others = game.players.filter(o => o.id !== seat).map(o => game.strength(o.id));
    const rankOf = (s) => others.filter(o => o >= s).length;
    const now = rankOf(mine);
    if (now === 0) return { type: 'pass' };
    let best = null;
    p.intrigue.forEach((id, index) => {
        const c = INTRIGUE_BY_ID[id];
        if (c.kind !== 'combat') return;
        const swords = c.effects.reduce((s, e) => s + (e.swords ?? 0) + (e.pay && canPay(p, e.pay) ? (e.then.find(t => t.swords)?.swords ?? 0) : 0), 0);
        const rank = rankOf(mine + swords);
        if (rank < now && (!best || rank < best.rank || (rank === best.rank && swords < best.swords))) best = { index, rank, swords };
    });
    return best ? { type: 'combat', index: best.index } : { type: 'pass' };
}

function chooseTurn(game, seat, level, rand) {
    const p = game.players[seat];
    const easy = level === 'easy';
    if (game.stage === 'buy') {
        const slots = [...game.row.map((_, i) => i), ...RESERVE.map(c => c.id)];
        const buys = slots.filter(slot => {
            const cost = game.buyCost(slot);
            return cost !== null && cost <= p.persuasion;
        });
        if (!buys.length) return { type: 'done' };
        const idOf = (slot) => (Number.isInteger(slot) ? game.row[slot] : slot);
        const list = ranked(buys, slot => cardWorth(idOf(slot)) + CARD_BY_ID[idOf(slot)].cost * 0.35);
        if (easy) return rand() < 0.2 ? { type: 'done' } : { type: 'buy', slot: pickEasy(list, rand) };
        return { type: 'buy', slot: list[0].item };
    }
    // 策略の陰謀カード：得になるものは番の初めに使う
    const plot = p.intrigue.findIndex(id => {
        const c = INTRIGUE_BY_ID[id];
        return c.kind === 'plot' && valueOf(game, seat, c.effects) > 0.3;
    });
    if (plot >= 0 && (!easy || rand() < 0.5)) return { type: 'plot', index: plot };
    const placements = game.legalPlacements(seat);
    if (!placements.length) return { type: 'reveal' };
    const list = ranked(placements, m => placementValue(game, seat, m));
    if (list[0].v < -0.5) return { type: 'reveal' };
    const move = easy ? pickEasy(list, rand) : list[0].item;
    return { type: 'agent', card: move.card, space: move.space };
}

// その席の手を選ぶ（状態は変えない）。打てる手がなければ null
export function chooseCommand(game, seat, level = 'normal') {
    if (!game.actors().includes(seat)) return null;
    const rand = randomFor(game, seat);
    if (game.pending) return choosePending(game, seat, level, rand);
    if (game.phase === 'combat') return chooseCombat(game, seat, level);
    if (game.phase === 'turns') return chooseTurn(game, seat, level, rand);
    return null;
}

// ヒント：ふつうの CPU と同じ手
export function suggest(game, seat) {
    return chooseCommand(game, seat, 'normal');
}

// 今打てる手をすべて（テストと、CPU が進めないときの逃げ道）
export function candidates(game, seat) {
    if (!game.actors().includes(seat)) return [];
    const p = game.players[seat];
    if (game.pending) return game.pending.options.map((_, index) => ({ type: 'choose', index }));
    if (game.phase === 'combat') {
        return [{ type: 'pass' }, ...p.intrigue.map((id, index) => ({ id, index })).filter(x => INTRIGUE_BY_ID[x.id].kind === 'combat').map(x => ({ type: 'combat', index: x.index }))];
    }
    const plots = p.intrigue.map((id, index) => ({ id, index })).filter(x => INTRIGUE_BY_ID[x.id].kind === 'plot').map(x => ({ type: 'plot', index: x.index }));
    if (game.stage === 'buy') {
        const slots = [...game.row.map((_, i) => i), ...RESERVE.map(c => c.id)];
        return [{ type: 'done' }, ...slots.filter(slot => {
            const cost = game.buyCost(slot);
            return cost !== null && cost <= p.persuasion;
        }).map(slot => ({ type: 'buy', slot })), ...plots];
    }
    return [{ type: 'reveal' }, ...game.legalPlacements(seat).map(m => ({ type: 'agent', ...m })), ...plots];
}

export function isCpuTurn(game) {
    const [seat] = game.actors();
    return !game.isOver() && seat !== undefined && !!game.players[seat].isCPU;
}

// CPU の席の手を1つ打つ。進んだら true
export function runCpuStep(game) {
    const [seat] = game.actors();
    if (seat === undefined || game.isOver()) return false;
    const level = game.players[seat].cpuLevel ?? 'normal';
    const command = chooseCommand(game, seat, level);
    if (command && game.applyCommand(seat, command)) return true;
    // 思わぬ形で通らなければ、いちばん単純な手から試す
    for (const c of candidates(game, seat)) {
        if (game.applyCommand(seat, c)) return true;
    }
    return false;
}
