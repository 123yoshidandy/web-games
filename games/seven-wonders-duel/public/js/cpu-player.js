/**
 * CPU の判断（DOM に依存しない）
 * 並びは自分の席のビューから読む（裏のカードの中身はのぞかない）。都市・コイン・捨て札・盤のトークンは全員に見える
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と手数から作った別の乱数で決める
 *
 * ふつう：手ごとに「自分の得（点・コイン・資源・軍事・科学・連鎖）− 払うコイン ＋ 相手に渡さない分 − 相手に新しく見せるカードの危険」を
 *        点に直して比べ、一番大きい手を選ぶ。その場で勝てる手は必ず打ち、相手が次に勝てるカードは取るか、見せないようにする
 * やさしい：建てられるカードから気まぐれに選び、ときどき七不思議を建て、建てられなければ捨てる
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import {
    CARDS, WONDERS, RESOURCES, militaryPoints, MILITARY_WIN
} from './cards.js';
import { fixedProduction, scienceSymbols, cardsOfColor, builtWonders, hasChain } from './game.js';

export const CPU_LEVELS = ['easy', 'normal'];
const WIN = 500;
const other = (seat) => 1 - seat;

// 時代ごとの重み（コインと資源は、序盤ほど役に立つ）
const coinWeight = (age) => [0, 0.6, 0.5, 0.4][age];
const RESOURCE_WEIGHT = { 1: 2.2, 2: 1.6, 3: 0.5 };
const UNKNOWN_EXPOSED = 1.5;  // 裏のカードを相手に見せるときの、見込みの価値

const ageOf = (game) => Math.max(1, game.age);

// 都市の軍事の点（自分 − 相手）
const militaryBalance = (pos) => militaryPoints(pos) - militaryPoints(-pos);

function militaryValue(game, seat, shields) {
    if (!shields) return 0;
    const pos = game.militaryFor(seat);
    const next = Math.min(MILITARY_WIN, pos + shields);
    if (next >= MILITARY_WIN) return WIN;
    let value = militaryBalance(next) - militaryBalance(pos) + 0.7 * shields;
    // 相手がコインを失うトークン
    game.militaryTokens.forEach(t => {
        if (!t.taken && t.loser === other(seat) && pos < t.at && next >= t.at) value += Math.min(t.coins, game.players[other(seat)].coins) * coinWeight(ageOf(game));
    });
    // 都に近づくほど、攻めも守りも大事になる
    if (next >= 5) value += 1.2 * shields;
    if (pos <= -4) value += 1.5 * shields + (pos <= -6 ? 3 * shields : 0);
    return value;
}

function scienceValue(game, seat, symbol) {
    const symbols = scienceSymbols(game.players[seat]);
    const distinct = new Set(symbols).size;
    if (!symbols.includes(symbol)) {
        if (distinct + 1 >= 6) return WIN;
        return 1.5 + (distinct >= 3 ? 1.8 * (distinct - 2) : 0);
    }
    // 2つ目：盤の進歩トークンを1枚
    if (symbols.filter(s => s === symbol).length === 1 && game.tokensBoard.length) {
        return Math.max(...game.tokensBoard.map(t => tokenValue(game, seat, t)));
    }
    return 0;
}

function resourceValue(game, seat, produce, factor = 1) {
    const age = ageOf(game);
    const fixed = fixedProduction(game.players[seat]);
    return Object.entries(produce).reduce((sum, [r, n]) => {
        const have = fixed[r];
        const scarce = r === 'glass' || r === 'papyrus' ? 1.2 : 1;
        const decay = have >= 2 ? 0.35 : have === 1 ? 0.7 : 1;
        return sum + n * RESOURCE_WEIGHT[age] * scarce * decay * factor;
    }, 0);
}

export function tokenValue(game, seat, token) {
    const age = ageOf(game);
    const player = game.players[seat];
    const unbuilt = player.wonders.filter(w => !w.built).length;
    const cw = coinWeight(age);
    switch (token) {
        case 'agriculture': return 4 + 6 * cw;
        case 'philosophy': return 7;
        case 'mathematics': return 3 * (player.tokens.length + 1) + 1;
        case 'law': return scienceValue(game, seat, 'law');
        case 'urbanism': return 6 * cw + (age < 3 ? 2 : 0.5);
        case 'strategy': return [0, 3.5, 2.5, 1.2][age];
        case 'theology': return unbuilt * 1.2;
        case 'architecture': return unbuilt * 1.3;
        case 'masonry': return [0, 3, 2.2, 1.2][age];
        case 'economy': return [0, 3, 2, 1][age];
        default: return 0;
    }
}

// seat がカード key を建てたときの価値（払うコインは含まない）
export function cardValue(game, seat, key) {
    const card = CARDS[key];
    const player = game.players[seat];
    const age = ageOf(game);
    const cw = coinWeight(age);
    let value = card.vp;
    let coins = card.coins;
    if (card.per) {
        const count = card.per.wonders ? builtWonders(player).length
            : player.cards.filter(k => card.per.colors.includes(CARDS[k].color)).length + (card.per.colors.includes(card.color) ? 1 : 0);
        coins += count * card.per.coins;
    }
    if (card.guild) {
        const counts = game.players.map(p => {
            if (card.guild.count[0] === 'wonders') return builtWonders(p).length + (age < 3 ? 1 : 0);
            if (card.guild.count[0] === 'money') return Math.floor(p.coins / 3);
            return p.cards.filter(k => card.guild.count.includes(CARDS[k].color)).length;
        });
        const best = Math.max(...counts);
        value += best * card.guild.vp;
        coins += best * card.guild.coins;
    }
    if (hasChain(player, card.free) && player.tokens.includes('urbanism')) coins += 4;
    value += coins * cw;
    if (card.produce) value += resourceValue(game, seat, card.produce);
    if (card.choice) value += RESOURCE_WEIGHT[age] * 1.1;
    if (card.reserve) value += card.reserve.length * [0, 1.4, 1.1, 0.4][age];
    if (card.shields) value += militaryValue(game, seat, card.shields + (card.color === 'red' && player.tokens.includes('strategy') ? 1 : 0));
    if (card.science) value += scienceValue(game, seat, card.science);
    // 次の時代を無料にする印
    if (card.chain && age < 3) value += age === 1 ? 1.2 : 0.8;
    // 捨てるとコインの増える黄
    if (card.color === 'yellow') value += 0.3;
    return value;
}

export function wonderValue(game, seat, key) {
    const wonder = WONDERS[key];
    const age = ageOf(game);
    const cw = coinWeight(age);
    const opponent = game.players[other(seat)];
    let value = wonder.vp + wonder.coins * cw + Math.min(wonder.loss, opponent.coins) * cw;
    value += militaryValue(game, seat, wonder.shields);
    if (wonder.replay || game.players[seat].tokens.includes('theology')) value += 3;
    if (wonder.choice) value += RESOURCE_WEIGHT[age] * 1.3;
    if (wonder.destroy) {
        const targets = cardsOfColor(opponent, wonder.destroy);
        value += targets.length ? Math.max(...targets.map(k => resourceValue(game, other(seat), CARDS[k].produce ?? {}, 0.8))) + 0.5 : 0;
    }
    if (wonder.revive) value += game.discardPile.length ? Math.max(...game.discardPile.map(k => cardValue(game, seat, k))) : 0;
    if (wonder.library) value += game.tokensOut.length ? 3.5 : 0;
    return value;
}

// 並び（ビュー）から、slot を取ったあとに新しく取れるようになる番号
function exposedAfter(structure, slot) {
    const taken = structure.map((s, i) => s.taken || i === slot);
    const open = (i) => !taken[i] && !structure.some((s, j) => !taken[j] && s.row === structure[i].row + 1 && Math.abs(s.x - structure[i].x) < 2);
    return structure.map((_, i) => i).filter(i => i !== slot && !structure[i].accessible && open(i));
}

// 相手がそのカードを建てたときの価値（払えなければ下げる）
function opponentValue(game, seat, key) {
    const opp = other(seat);
    const price = game.cardPrice(opp, key);
    const value = cardValue(game, opp, key) - price.coins * coinWeight(ageOf(game));
    return price.coins <= game.players[opp].coins ? value : Math.min(value, WIN / 10) * 0.4;
}

function normalCommand(game, seat, view) {
    const age = ageOf(game);
    const cw = coinWeight(age);
    const player = game.players[seat];
    const options = view.options;
    const slots = Object.keys(options.cards).map(Number);
    const oppValues = Object.fromEntries(slots.map(i => [i, opponentValue(game, seat, view.structure[i].key)]));
    let best = null;
    const consider = (command, score) => {
        if (!best || score > best.score) best = { command, score };
    };
    for (const slot of slots) {
        const key = view.structure[slot].key;
        // 相手に渡さない分と、新しく見せるカードの危険
        const deny = 0.5 * Math.max(0, oppValues[slot]);
        const restBest = Math.max(0, ...slots.filter(i => i !== slot).map(i => oppValues[i]));
        const exposed = exposedAfter(view.structure, slot);
        const exposedBest = Math.max(0, ...exposed.map(i => (view.structure[i].faceUp ? opponentValue(game, seat, view.structure[i].key) : UNKNOWN_EXPOSED)));
        const exposure = exposedBest >= WIN / 2 ? WIN / 2 : 0.3 * Math.max(0, exposedBest - restBest);
        const base = deny - exposure;
        const o = options.cards[slot];
        if (o.canBuild) consider({ type: 'build', slot }, base + cardValue(game, seat, key) - o.price * cw);
        consider({ type: 'discard', slot }, base + options.discard * cw - 0.6);
        for (const [wonder, wo] of Object.entries(options.wonders)) {
            if (wo.canBuild) consider({ type: 'wonder', slot, wonder }, base + wonderValue(game, seat, wonder) - wo.price * cw - 0.3);
        }
    }
    return best.command;
}

function easyCommand(game, seat, view, random) {
    const options = view.options;
    const slots = Object.keys(options.cards).map(Number);
    const buildable = slots.filter(i => options.cards[i].canBuild);
    const wonders = Object.entries(options.wonders).filter(([, w]) => w.canBuild).map(([k]) => k);
    if (wonders.length && random() < 0.25) {
        return { type: 'wonder', slot: slots[Math.floor(random() * slots.length)], wonder: wonders[Math.floor(random() * wonders.length)] };
    }
    if (buildable.length && random() < 0.85) {
        // 安いものほど選びやすく
        const weights = buildable.map(i => 1 / (1 + options.cards[i].price));
        let r = random() * weights.reduce((s, w) => s + w, 0);
        for (let k = 0; k < buildable.length; k++) {
            r -= weights[k];
            if (r <= 0) return { type: 'build', slot: buildable[k] };
        }
        return { type: 'build', slot: buildable.at(-1) };
    }
    return { type: 'discard', slot: slots[Math.floor(random() * slots.length)] };
}

function pickBest(list, score) {
    let best = list[0];
    let bestScore = -Infinity;
    list.forEach(item => {
        const s = score(item);
        if (s > bestScore) {
            best = item;
            bestScore = s;
        }
    });
    return best;
}

// CPU の席 seat が次に打つ操作
export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    const random = createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1)) >>> 0);
    const easy = level === 'easy';
    const opponent = game.players[other(seat)];
    switch (game.phase) {
        case 'draft': {
            const offer = view.draft.offer;
            if (easy) return { type: 'pickWonder', wonder: offer[Math.floor(random() * offer.length)] };
            return { type: 'pickWonder', wonder: pickBest(offer, k => wonderValue(game, seat, k) - WONDERS[k].cost.coins * 0 - totalCost(WONDERS[k].cost) * 0.25) };
        }
        case 'play':
            return easy ? easyCommand(game, seat, view, random) : normalCommand(game, seat, view);
        case 'progress':
            return { type: 'progress', token: easy ? view.tokensBoard[0] : pickBest(view.tokensBoard, t => tokenValue(game, seat, t)) };
        case 'library':
            return { type: 'progress', token: easy ? view.libraryDraw[0] : pickBest(view.libraryDraw, t => tokenValue(game, seat, t)) };
        case 'destroy': {
            const targets = cardsOfColor(opponent, view.pending.color);
            return { type: 'destroy', card: pickBest(targets, k => resourceValue(game, other(seat), CARDS[k].produce ?? {})) };
        }
        case 'revive':
            return { type: 'revive', card: easy ? view.discard[0] : pickBest(view.discard, k => cardValue(game, seat, k)) };
        case 'starter':
            return { type: 'starter', seat };
        default:
            return null;
    }
}

const totalCost = (cost) => RESOURCES.reduce((n, r) => n + cost[r], 0);

export function nextCpuSeat(game) {
    const seat = game.actors()[0];
    return seat !== undefined && game.players[seat].isCPU ? seat : null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// CPU の1手を打つ。思わぬ答えで断られたら、条件を満たす最小の答え（捨てる・最初の候補）で必ず進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const command = chooseCommand(game, seat, level);
    if (command && game.applyCommand(seat, command)) return command;
    const view = createGameView(game, seat);
    const fallbacks = [
        view.draft && { type: 'pickWonder', wonder: view.draft.offer[0] },
        { type: 'discard', slot: game.accessibleSlots()[0] },
        { type: 'progress', token: (view.libraryDraw ?? view.tokensBoard)[0] },
        view.pending?.color && { type: 'destroy', card: cardsOfColor(game.players[other(seat)], view.pending.color)[0] },
        { type: 'revive', card: game.discardPile[0] },
        { type: 'starter', seat }
    ].filter(Boolean);
    for (const fallback of fallbacks) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}
