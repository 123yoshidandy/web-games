/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（山札の並びや、ほかの人が伏せて予約したカードはのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：場と予約のカードから「ねらうカード」を決め、その不足分の宝石を集め、買えるようになったら買う
 * - 強すぎないように、人間らしい見落としを混ぜる（場のカードの一部を見ていない・評価が揺れる・買えるのに見送る）
 */

import { CARDS, NOBLES, COLORS, GOLD, LEVELS, TOKEN_LIMIT, RESERVE_LIMIT, countTokens } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

// 強さの設定。normal が画面で使う CPU。strong は見落としのない比較用（強さを測るときだけ使う）
export const PROFILES = {
    normal: { overlook: 0.3, noise: 0.35, skipBuy: 0.15, reserveRate: 0.25, nobleWeight: 0.5, lookahead: false },
    strong: { overlook: 0, noise: 0.05, skipBuy: 0, reserveRate: 0.4, nobleWeight: 0.8, lookahead: true }
};

export const isCpuTurn = (game) => game.phase !== 'end' && game.players[game.current].isCPU;

// 判断用の乱数。ゲームの状態（シード・手数・席）だけから決まるので、同じ場面では同じ手になる
function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// 手番の CPU の操作を1つ決める
export function chooseCpuCommand(game, seat = game.current, profile = PROFILES[game.players[seat].cpuLevel ?? 'normal'] ?? PROFILES.normal) {
    const view = createGameView(game, seat);
    return decide(view, seat, cpuRandom(game, seat), profile);
}

// CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return simpleCommands(game, seat).some(c => game.applyCommand(seat, c));
}

// CPU の手が通らないときに試す、いちばん単純な手（通るものを順に試す）
export function simpleCommands(game, seat) {
    const player = game.players[seat];
    const commands = [];
    if (game.phase === 'discard') {
        let excess = countTokens(player.tokens) - TOKEN_LIMIT;
        const tokens = {};
        [...COLORS, GOLD].forEach(c => {
            const n = Math.min(excess, player.tokens[c]);
            if (n > 0) tokens[c] = n;
            excess -= n;
        });
        commands.push({ type: 'discard', tokens });
    }
    if (game.phase === 'noble') game.nobleChoices.forEach(noble => commands.push({ type: 'noble', noble }));
    if (game.phase === 'action') {
        [...game.boardCards(), ...player.reserved.map(r => r.id)].forEach(card => commands.push({ type: 'buy', card }));
        const colors = COLORS.filter(c => game.bank[c] > 0);
        if (colors.length > 0) commands.push({ type: 'take', tokens: Object.fromEntries(colors.slice(0, 3).map(c => [c, 1])) });
        game.boardCards().forEach(card => commands.push({ type: 'reserve', card }));
        LEVELS.forEach(level => commands.push({ type: 'reserve', level }));
        commands.push({ type: 'pass' });
    }
    return commands;
}

// ---- 判断 ----

function decide(view, seat, random, profile) {
    const me = view.players[seat];
    if (view.phase === 'noble') return { type: 'noble', noble: view.nobleChoices[0] };
    if (view.phase === 'discard') return { type: 'discard', tokens: chooseDiscard(view, me, random, profile) };

    const plans = evaluateCards(view, me, random, profile);
    const affordable = plans.filter(p => p.missing === 0).sort((a, b) => b.value - a.value);
    const targets = plans.filter(p => p.missing > 0).sort((a, b) => b.score - a.score);
    const target = targets[0] ?? null;

    // 買う：買えるカードの良さが、ねらうカードを待つ価値と同じくらいなら買う
    // 宝石が一杯なら、取っても返すだけになるので、買えるものを買って宝石をボーナスに変える
    const handFull = countTokens(me.tokens) >= TOKEN_LIMIT - 1;
    if (affordable.length > 0) {
        const best = affordable[0];
        const wins = me.points + best.card.points >= 15;
        const worth = best.value / 1.2 >= (target ? target.score * 0.8 : 0);
        if (wins || handFull || (worth && random() >= profile.skipBuy) || !canTakeAnything(view)) return { type: 'buy', card: best.card.id };
    }

    // 予約する：ねらうカードが場にあって、もう少しで買えるなら、黄金を取りつつ押さえる
    const canReserve = me.reserved.length < RESERVE_LIMIT;
    if (canReserve && target && !target.reserved && view.bank[GOLD] > 0 && target.totalNeed <= TOKEN_LIMIT) {
        const valuable = target.card.level >= 2 && target.missing <= 3;
        if ((valuable && random() < profile.reserveRate) || (handFull && target.missing <= 4)) return { type: 'reserve', card: target.card.id };
    }

    // 宝石を取る
    const take = chooseTake(view, me, targets, random);
    if (take) return { type: 'take', tokens: take };

    // 取れる宝石がない：予約するか、買えるものを買う
    if (affordable.length > 0) return { type: 'buy', card: affordable[0].card.id };
    if (canReserve) {
        const card = target && !target.reserved ? target.card.id : firstBoardCard(view);
        if (card !== null) return { type: 'reserve', card };
        const level = LEVELS.find(l => view.deckCounts[l] > 0);
        if (level) return { type: 'reserve', level };
    }
    return { type: 'pass' };
}

const canTakeAnything = (view) => COLORS.some(c => view.bank[c] > 0);
const firstBoardCard = (view) => LEVELS.flatMap(l => view.board[l]).find(id => id !== null) ?? null;

// ボーナスの色の価値：基本の値＋場の貴族に近づく分（足りない色ほど、残りが少ない貴族ほど高い）
function bonusValue(view, me, color, profile) {
    let value = me.cards.length < 8 ? 0.8 : 0.4; // 序盤は割引が効くので高め
    view.nobles.forEach(id => {
        const req = NOBLES[id].req;
        if (req[color] <= me.bonuses[color]) return;
        const remaining = COLORS.reduce((sum, c) => sum + Math.max(0, req[c] - me.bonuses[c]), 0);
        value += profile.nobleWeight * 3 / (remaining + 2);
    });
    return value;
}

// 場と予約のカードを、買うまでの手数と良さで評価する
function evaluateCards(view, me, random, profile) {
    const ids = [
        ...LEVELS.flatMap(level => view.board[level]).filter(id => id !== null).map(id => ({ id, reserved: false })),
        ...me.reserved.filter(r => r.id !== null).map(r => ({ id: r.id, reserved: true }))
    ];
    const plans = [];
    ids.forEach(({ id, reserved }) => {
        // 見落とし：場のカードの一部は、この手番では目に入らない（予約したカードは覚えている）
        if (!reserved && random() < profile.overlook) return;
        const card = CARDS[id];
        const need = Object.fromEntries(COLORS.map(c => [c, Math.max(0, card.cost[c] - me.bonuses[c])]));
        const deficit = Object.fromEntries(COLORS.map(c => [c, Math.max(0, need[c] - me.tokens[c])]));
        const totalDeficit = COLORS.reduce((sum, c) => sum + deficit[c], 0);
        const missing = Math.max(0, totalDeficit - me.tokens[GOLD]);
        const maxDeficit = Math.max(...COLORS.map(c => deficit[c]));
        const totalNeed = COLORS.reduce((sum, c) => sum + need[c], 0);
        // 1手番に取れる役に立つ宝石は、平均して3個より少ない
        let turns = missing === 0 ? 0 : Math.max(missing / 2.4, Math.max(0, maxDeficit - me.tokens[GOLD]) / 2);
        // 場に足りない色は、集めるのに時間がかかる
        COLORS.forEach(c => { if (deficit[c] > view.bank[c]) turns += 1; });
        // 持っている宝石と合わせて10個を超えるなら、先にほかのカードを買って手を空ける必要がある
        if (missing > 0 && countTokens(me.tokens) + missing > TOKEN_LIMIT) turns += 1;
        let value = card.points + bonusValue(view, me, card.bonus, profile);
        if (me.points + card.points >= 15) value += 5;
        // 先を読む CPU は、15点に近い終盤ほど点数を重く見る
        if (profile.lookahead && me.points >= 9) value += card.points * 0.5;
        value *= 1 + (random() * 2 - 1) * profile.noise;
        let score = value / (turns + 1.2);
        // 宝石を10個より多く使うカードは、ボーナスが育つまで買えない
        if (totalNeed > TOKEN_LIMIT) score *= 0.1;
        plans.push({ card, reserved, need, deficit, missing, turns, totalNeed, value, score });
    });
    return plans;
}

// 取る宝石を決める。ねらうカードの不足分を優先し、次の候補、場に多い色の順に足す
function chooseTake(view, me, targets, random) {
    const available = COLORS.filter(c => view.bank[c] > 0);
    if (available.length === 0) return null;
    const weight = Object.fromEntries(COLORS.map(c => [c, random() * 0.1]));
    targets.slice(0, 4).forEach((plan, rank) => {
        COLORS.forEach(c => { weight[c] += plan.deficit[c] * (rank === 0 ? 3 : 1 / (rank + 1)); });
    });
    const target = targets[0];
    // ねらうカードに足りないのが1色だけで2個以上なら、同じ色を2個取る
    if (target) {
        const needed = COLORS.filter(c => target.deficit[c] > 0);
        if (needed.length === 1 && target.deficit[needed[0]] >= 2 && view.bank[needed[0]] >= 4) return { [needed[0]]: 2 };
    }
    // 10個を超えそうなら、2個で済む取り方を選ぶ
    const tokensAfter = countTokens(me.tokens) + Math.min(3, available.length);
    if (tokensAfter > TOKEN_LIMIT) {
        const best = [...available].sort((a, b) => weight[b] - weight[a])[0];
        if (view.bank[best] >= 4 && weight[best] >= 1) return { [best]: 2 };
    }
    const picked = [...available].sort((a, b) => weight[b] - weight[a] || view.bank[b] - view.bank[a]).slice(0, 3);
    return Object.fromEntries(picked.map(c => [c, 1]));
}

// 10個を超えた分を返す。ねらうカードに要らない色、多く持っている色から返す。黄金は最後
function chooseDiscard(view, me, random, profile) {
    let excess = view.discardCount;
    const plans = evaluateCards(view, me, random, { ...profile, overlook: 0 }).sort((a, b) => b.score - a.score);
    const keep = Object.fromEntries(COLORS.map(c => [c, 0]));
    plans.slice(0, 3).forEach((plan, rank) => {
        COLORS.forEach(c => { keep[c] += Math.min(plan.need[c], me.tokens[c]) * (rank === 0 ? 3 : 1); });
    });
    const tokens = { ...me.tokens };
    const result = {};
    while (excess > 0) {
        const colors = COLORS.filter(c => tokens[c] > 0);
        const color = colors.length > 0
            ? colors.sort((a, b) => keep[a] / tokens[a] - keep[b] / tokens[b])[0]
            : GOLD;
        tokens[color]--;
        result[color] = (result[color] ?? 0) + 1;
        excess--;
    }
    return result;
}
