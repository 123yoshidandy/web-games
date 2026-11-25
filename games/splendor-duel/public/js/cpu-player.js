/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（山札の並びや、相手が伏せて予約したカードはのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：場と予約のカードから「ねらうカード」を決め、不足分のトークンが多く入る連なりを取り、買えるようになったら買う
 *         特権は、使えば今すぐ買えるときだけ使う。相手があと1枚で勝てるカードは、見えていれば予約して止める
 * - 強すぎないように、人間らしい見落としを混ぜる（場のカードの一部を見ていない・評価が揺れる・
 *   いちばん良い連なりを見逃す・買えるのに見送る・相手の勝ち筋に気づかない）
 */

import {
    CARDS, ROYALS, COLORS, PEARL, GOLD, GEM_AND_PEARL, LEVELS, TOKEN_LIMIT, RESERVE_LIMIT,
    WIN_POINTS, WIN_CROWNS, WIN_COLOR_POINTS, ROYAL_CROWNS, countTokens, needOf, takeLines, isGemOrPearl
} from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

// 強さの設定。easy・normal が画面で選べる CPU。strong は見落としのない比較用（強さを測るときだけ使う）
export const PROFILES = {
    easy: { overlook: 0.4, noise: 0.5, lineSlip: 0.45, skipBuy: 0.25, reserveRate: 0.1, block: 0, privilegeUse: 0.4 },
    normal: { overlook: 0.2, noise: 0.25, lineSlip: 0.2, skipBuy: 0.1, reserveRate: 0.25, block: 0.5, privilegeUse: 0.8 },
    strong: { overlook: 0, noise: 0.05, lineSlip: 0, skipBuy: 0, reserveRate: 0.35, block: 1, privilegeUse: 1 }
};
export const CPU_LEVELS = ['easy', 'normal'];

export const isCpuTurn = (game) => game.phase !== 'end' && game.players[game.current].isCPU;

// 判断用の乱数。ゲームの状態（シード・手数・席）だけから決まるので、同じ場面では同じ手になる
function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

const profileOf = (game, seat) => PROFILES[game.players[seat].cpuLevel ?? 'normal'] ?? PROFILES.normal;

// 手番の CPU の操作を1つ決める
export function chooseCpuCommand(game, seat = game.current, profile = profileOf(game, seat)) {
    const view = createGameView(game, seat);
    return decide(view, seat, cpuRandom(game, seat), profile);
}

// CPU に1手打たせる。決めた手が断られたら、できる手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile ?? profileOf(game, seat));
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    // 特権と補充は、何度も試すと進まなくなるので最後に回す
    const fallback = game.legalCommands().sort((a, b) => (a.type === 'privilege') - (b.type === 'privilege'));
    return fallback.some(c => game.applyCommand(seat, c));
}

// ---- 判断 ----

function decide(view, seat, random, profile) {
    const me = view.players[seat];
    const opponent = view.players[1 - seat];
    if (view.phase === 'choose') return decideChoice(view, me, opponent, random, profile);
    if (view.phase === 'discard') return { type: 'discard', tokens: chooseDiscard(view, me, random, profile) };

    const plans = evaluateCards(view, me, random, profile);
    const affordable = plans.filter(p => p.affordable).sort((a, b) => b.value - a.value);
    const targets = plans.filter(p => !p.affordable && p.reachable).sort((a, b) => b.score - a.score);
    const target = targets[0] ?? null;
    const goldCell = view.board.indexOf(GOLD);
    const canReserve = goldCell >= 0 && me.reserved.length < RESERVE_LIMIT;
    const lines = takeLines(view.board);

    // 今買えて勝てるカードがあれば買う（目の前の勝ちは見落とさない）
    const winning = view.affordable.find(id => {
        const card = CARDS[id];
        return winsWith(me, card, card.color === 'wild' ? bestWildColor(me, card) : card.color, view);
    });
    if (winning !== undefined) return { type: 'buy', card: winning };

    // 特権を使えば勝てるカード・ねらうカードが今すぐ買えるなら、1個ずつ取る
    const privilegeCell = choosePrivilegeCell(view, me, targets, random, profile);
    if (privilegeCell !== null) return { type: 'privilege', cell: privilegeCell };

    // 相手があと1手で勝てる場のカードがあれば、予約して止める（気づくかどうかは強さ次第）
    if (canReserve && random() < profile.block) {
        const threat = findThreat(view, opponent);
        if (threat !== null) return { type: 'reserve', card: threat, gold: goldCell };
    }

    // 買う：買えるカードの良さが、ねらうカードを待つ価値と同じくらいなら買う
    // トークンが一杯なら、取っても返すだけになるので、買えるものを買ってトークンをボーナスに変える
    const handFull = countTokens(me.tokens) >= TOKEN_LIMIT - 2;
    if (affordable.length > 0) {
        const best = affordable[0];
        const worth = best.value >= (target ? target.score * 1.1 : 0);
        if (handFull || (worth && random() >= profile.skipBuy) || lines.length === 0) return { type: 'buy', card: best.card.id };
    }

    // 予約する：ねらうカードが場にあって良いカードなら、黄金を取りつつ押さえる
    if (canReserve && target && !target.reserved && target.card.level >= 2 && target.missing <= 4 && random() < profile.reserveRate) {
        return { type: 'reserve', card: target.card.id, gold: goldCell };
    }

    // トークンを取る
    if (lines.length > 0) {
        const take = chooseLine(view, me, lines, targets, random, profile);
        // 役に立つトークンがほとんどないなら、予約して黄金を取るほうがよい
        if (take.score < 0.6 && canReserve && (target || plans.length > 0)) {
            const card = target && !target.reserved ? target.card.id : bestBoardCard(plans);
            if (card !== null) return { type: 'reserve', card, gold: goldCell };
        }
        return { type: 'take', cells: take.cells };
    }

    // 取れるトークンがない：買う・予約する・補充する
    if (affordable.length > 0) return { type: 'buy', card: affordable[0].card.id };
    if (canReserve) {
        const card = bestBoardCard(plans);
        if (card !== null) return { type: 'reserve', card, gold: goldCell };
        const level = LEVELS.find(l => view.deckCounts[l] > 0);
        if (level) return { type: 'reserve', level, gold: goldCell };
    }
    if (countTokens(view.bag) > 0 && view.board.includes(null)) return { type: 'replenish' };
    return { type: 'pass' };
}

const bestBoardCard = (plans) => plans.filter(p => !p.reserved).sort((a, b) => b.score - a.score)[0]?.card.id ?? null;

// 盤と袋にある色ごとの数（これから集められる量のめやす）
const supplyOf = (view) => {
    const supply = { ...view.bag };
    view.board.forEach(t => { if (t) supply[t] = (supply[t] ?? 0) + 1; });
    return supply;
};

// カードを買ったあとの勝ちの条件（王族のカードの点は、もらえる最低の2点で見積もる）
function winsWith(player, card, color, view) {
    const crownsAfter = player.crowns + card.crowns;
    const royalGain = view.royals.length > 0 && ROYAL_CROWNS.some(n => player.crowns < n && crownsAfter >= n) ? 2 : 0;
    if (player.points + card.points + royalGain >= WIN_POINTS) return true;
    if (crownsAfter >= WIN_CROWNS) return true;
    return !!color && COLORS.includes(color) && player.colorPoints[color] + card.points >= WIN_COLOR_POINTS;
}

// 色なしのカードを写す色：その色の点が10点に近い色、なければボーナスの多い色
function bestWildColor(player, card) {
    const owned = COLORS.filter(c => player.bonuses[c] > 0);
    if (owned.length === 0) return null;
    return owned.sort((a, b) => (player.colorPoints[b] + card.points * 0.5 + player.bonuses[b] * 0.3)
        - (player.colorPoints[a] + card.points * 0.5 + player.bonuses[a] * 0.3))[0];
}

const ABILITY_VALUE = { turn: 1.6, token: 0.6, privilege: 0.8, steal: 0.7 };

// 場と予約のカードを、買うまでの手数と良さで評価する
function evaluateCards(view, me, random, profile) {
    const supply = supplyOf(view);
    const ids = [
        ...LEVELS.flatMap(level => view.pyramid[level]).filter(id => id !== null).map(id => ({ id, reserved: false })),
        ...me.reserved.filter(r => r.id !== null).map(r => ({ id: r.id, reserved: true }))
    ];
    const plans = [];
    ids.forEach(({ id, reserved }) => {
        // 見落とし：場のカードの一部は、この手番では目に入らない（予約したカードは覚えている）
        if (!reserved && random() < profile.overlook) return;
        const card = CARDS[id];
        const wild = card.color === 'wild';
        if (wild && !COLORS.some(c => me.bonuses[c] > 0)) return;
        const color = wild ? bestWildColor(me, card) : card.color;
        const need = needOf(card, me.bonuses);
        const deficit = Object.fromEntries(GEM_AND_PEARL.map(c => [c, Math.max(0, need[c] - me.tokens[c])]));
        const totalDeficit = GEM_AND_PEARL.reduce((sum, c) => sum + deficit[c], 0);
        const missing = Math.max(0, totalDeficit - me.tokens[GOLD]);
        const totalNeed = GEM_AND_PEARL.reduce((sum, c) => sum + need[c], 0);
        // 集められない（盤と袋にその色が足りない）分は、黄金か相手から戻るのを待つしかない
        const short = GEM_AND_PEARL.reduce((sum, c) => sum + Math.max(0, deficit[c] - (supply[c] ?? 0)), 0);
        const reachable = totalNeed <= TOKEN_LIMIT && short <= Math.max(0, 3 - me.reserved.length) * 0.5 + me.tokens[GOLD];
        // 1手番に取れる役に立つトークンは、平均して2個くらい
        let turns = missing === 0 ? 0 : missing / 2 + (short > 0 ? 1.5 : 0);
        if (missing > 0 && countTokens(me.tokens) + missing > TOKEN_LIMIT) turns += 1;

        const late = me.points >= 10 || me.cards.length >= 8;
        let value = card.points * (late ? 1.3 : 1);
        value += card.crowns * (me.crowns + card.crowns >= 3 && me.crowns < 3 ? 1.6 : me.crowns + card.crowns >= 6 && me.crowns < 6 ? 1.6 : 0.7);
        value += card.bonus * (late ? 0.35 : 0.8);
        if (card.ability) value += ABILITY_VALUE[card.ability];
        if (color && COLORS.includes(color) && card.points > 0) value += (me.colorPoints[color] / WIN_COLOR_POINTS) * card.points;
        const wins = winsWith(me, card, color, view);
        if (wins) value += 20;
        value *= 1 + (random() * 2 - 1) * profile.noise;
        const score = value / (turns + 1);
        plans.push({ card, reserved, need, deficit, missing, turns, value, score, wins, reachable, affordable: missing === 0 && view.affordable.includes(id) });
    });
    return plans;
}

// 色ごとの欲しさ：ねらうカードの不足分。上位のカードほど重い
function wantOf(me, targets) {
    const want = Object.fromEntries(GEM_AND_PEARL.map(c => [c, 0.05]));
    targets.slice(0, 4).forEach((plan, rank) => {
        const weight = rank === 0 ? 1 : 0.5 / rank;
        GEM_AND_PEARL.forEach(c => { want[c] += Math.min(plan.deficit[c], 4) > 0 ? weight * Math.min(1, plan.deficit[c] / 2 + 0.5) : 0; });
    });
    // パールは数が少なく、高いカードに要る
    want[PEARL] += 0.15;
    return want;
}

// 取る連なりを決める。役に立つ色が多く入る連なりを選び、相手に特権を渡す取り方とあふれる取り方は避ける
function chooseLine(view, me, lines, targets, random, profile) {
    const want = wantOf(me, targets);
    const held = countTokens(me.tokens);
    const scored = lines.map(cells => {
        const colors = cells.map(cell => view.board[cell]);
        const got = {};
        let score = 0;
        colors.forEach(c => {
            got[c] = (got[c] ?? 0) + 1;
            // 同じ色の2個目以降は、不足分を超えると価値が下がる
            const deficit = targets[0]?.deficit[c] ?? 0;
            score += got[c] <= Math.max(1, deficit) ? want[c] : want[c] * 0.3;
        });
        const sameThree = colors.length === 3 && colors.every(c => c === colors[0]);
        const twoPearls = colors.filter(c => c === PEARL).length >= 2;
        if (sameThree || twoPearls) score -= 0.7;
        const over = held + colors.length - TOKEN_LIMIT;
        if (over > 0) score -= over * 0.6;
        return { cells, score: score + random() * 0.05 };
    }).sort((a, b) => b.score - a.score);
    // 見逃し：いちばん良い連なりではなく、少し劣るものを選ぶことがある
    if (scored.length > 1 && random() < profile.lineSlip) {
        const pick = 1 + Math.floor(random() * Math.min(3, scored.length - 1));
        return scored[pick];
    }
    return scored[0];
}

// 特権を使えば、勝てるカードかねらうカードが今すぐ買えるなら、その不足の色のマス
function choosePrivilegeCell(view, me, targets, random, profile) {
    if (me.privileges <= 0 || view.replenished) return null;
    const plan = targets.find(p => p.missing > 0 && p.missing <= me.privileges && (p.wins || p.value >= 3));
    if (!plan || random() >= profile.privilegeUse) return null;
    // 黄金で埋める分を除いた不足（missing）を、盤にある不足の色で埋められるか
    const onBoard = {};
    view.board.forEach(t => { if (isGemOrPearl(t)) onBoard[t] = (onBoard[t] ?? 0) + 1; });
    const lacking = GEM_AND_PEARL.filter(c => plan.deficit[c] > 0 && (onBoard[c] ?? 0) > 0);
    const coverable = lacking.reduce((sum, c) => sum + Math.min(plan.deficit[c], onBoard[c]), 0);
    if (lacking.length === 0 || coverable < plan.missing) return null;
    return view.board.indexOf(lacking[0]);
}

// 相手が次の手番で買えて勝てる、場のカード（伏せた予約は見えないので数えない）
function findThreat(view, opponent) {
    const cards = LEVELS.flatMap(level => view.pyramid[level]).filter(id => id !== null);
    for (const id of cards) {
        const card = CARDS[id];
        const wild = card.color === 'wild';
        if (wild && !COLORS.some(c => opponent.bonuses[c] > 0)) continue;
        const color = wild ? bestWildColor(opponent, card) : card.color;
        if (!winsWith(opponent, card, color, view)) continue;
        const need = needOf(card, opponent.bonuses);
        const lacking = GEM_AND_PEARL.reduce((sum, c) => sum + Math.max(0, need[c] - opponent.tokens[c]), 0);
        // 黄金と特権と、1手番で取れる分（3個）を足して届くなら危ない
        if (lacking <= opponent.tokens[GOLD] + opponent.privileges + 2) return id;
    }
    return null;
}

// 能力の選択
function decideChoice(view, me, opponent, random, profile) {
    const { type, options } = view.choice;
    if (type === 'wild') {
        const card = CARDS[view.choice.card];
        const best = bestWildColor(me, card);
        return { type: 'wild', color: options.includes(best) ? best : options[0] };
    }
    if (type === 'token') {
        // どれを取っても色は同じ。相手の取りやすい連なりを崩すため、隣に宝石の多いマスを取る
        const neighbors = (cell) => takeLines(view.board).filter(l => l.length >= 2 && l.includes(cell)).length;
        const cell = [...options].sort((a, b) => neighbors(b) - neighbors(a))[0];
        return { type: 'token', cell };
    }
    if (type === 'steal') {
        const plans = evaluateCards(view, me, random, { ...profile, overlook: 0 }).filter(p => !p.affordable).sort((a, b) => b.score - a.score);
        const want = wantOf(me, plans);
        const color = [...options].sort((a, b) => want[b] - want[a] || opponent.tokens[b] - opponent.tokens[a])[0];
        return { type: 'steal', color };
    }
    if (type === 'royal') {
        // 勝てるなら点の高いもの。ふだんは「もう一度」と3点を好む
        const order = (id) => {
            const royal = ROYALS[id];
            if (me.points + royal.points >= WIN_POINTS) return 100 + royal.points;
            return royal.points + (royal.ability === 'turn' ? 1.2 : royal.ability === 'steal' ? 0.4 : royal.ability === 'privilege' ? 0.5 : 0);
        };
        return { type: 'royal', royal: [...options].sort((a, b) => order(b) - order(a))[0] };
    }
    return null;
}

// 10個を超えた分を返す。ねらうカードに要らない色、多く持っている色から返す。黄金は最後
function chooseDiscard(view, me, random, profile) {
    let excess = view.discardCount;
    const plans = evaluateCards(view, me, random, { ...profile, overlook: 0 }).filter(p => !p.affordable).sort((a, b) => b.score - a.score);
    const keep = Object.fromEntries(GEM_AND_PEARL.map(c => [c, 0]));
    plans.slice(0, 3).forEach((plan, rank) => {
        GEM_AND_PEARL.forEach(c => { keep[c] += Math.min(plan.need[c], me.tokens[c]) * (rank === 0 ? 3 : 1); });
    });
    const tokens = { ...me.tokens };
    const result = {};
    while (excess > 0) {
        const colors = GEM_AND_PEARL.filter(c => tokens[c] > 0);
        const color = colors.length > 0
            ? colors.sort((a, b) => keep[a] / tokens[a] - keep[b] / tokens[b])[0]
            : GOLD;
        tokens[color]--;
        result[color] = (result[color] ?? 0) + 1;
        excess--;
    }
    return result;
}
