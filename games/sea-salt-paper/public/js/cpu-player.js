/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（ほかの人の手札・山札の並び・捨て札の山の中は見ない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：カードの値打ちを「今の点＋これから点になる見込み」で見積もり、引くカードを選ぶ。2枚組は出せるだけ出す
 *         ラウンドの終わりは、自分の点と、相手の見えている点・手札の枚数から見積もった点を比べて決める
 */

import { CARDS, TYPES, duoEffect } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';
import { cardPoints, colorBonus, countTypes } from './scoring.js';
import { DECK_SIZE, COLLECT_POINTS, MULTIPLIERS } from './cards.js';

// 強さ。easy・normal は画面で選べる。strong は揺れのない比較用（強さを測るときだけ使う）
// noise：見積もりの揺れ／stopAt：ストップを考え始める点／lead：ラストチャンスに必要な見積もりの差／rash：7点で早めに止める割合
export const PROFILES = {
    easy: { noise: 1.2, stopAt: 7, lead: 6, rash: 0.6, potential: 0.4 },
    normal: { noise: 0.35, stopAt: 9, lead: 3, rash: 0.1, potential: 1 },
    strong: { noise: 0.05, stopAt: 9, lead: 3, rash: 0, potential: 1 }
};
export const CPU_LEVELS = ['easy', 'normal'];
export const CPU_LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう' };

// CPU が操作する番か。ラウンドの結果は、全員が CPU のときだけ CPU が進める（人がいれば、人が結果を見て進める）
export function isCpuTurn(game) {
    if (game.phase === 'end') return false;
    if (game.phase === 'roundEnd') return game.players.every(p => p.isCPU);
    return game.players[game.current].isCPU;
}

// 判断用の乱数。ゲームの状態（シード・手数・席）だけから決まるので、同じ場面では同じ手になる
function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

const profileOf = (game, seat) => PROFILES[game.players[seat].cpuLevel ?? 'normal'] ?? PROFILES.normal;

export function chooseCpuCommand(game, seat = game.current, profile = profileOf(game, seat)) {
    const view = createGameView(game, seat);
    return decide(view, seat, cpuRandom(game, seat), profile);
}

// CPU に1手打たせる。決めた手が断られたら、通る手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end') return false;
    if (game.phase !== 'roundEnd' && seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return simpleCommands(game, seat).some(c => game.applyCommand(seat, c));
}

// 今の場面で試せる手の一覧（通るとは限らない）。CPU の手が通らないときと、テストのランダムな試合に使う
export function simpleCommands(game, seat) {
    switch (game.phase) {
        case 'draw': return [{ type: 'drawDeck' }, { type: 'takeDiscard', pile: 0 }, { type: 'takeDiscard', pile: 1 }];
        case 'keep': return game.drawn.flatMap(card => [0, 1].map(pile => ({ type: 'keep', card, pile })));
        case 'play': return [{ type: 'endTurn' }];
        case 'crab':
            if (game.crab.pile === null) return [0, 1].map(pile => ({ type: 'crabLook', pile }));
            return game.discards[game.crab.pile].map(card => ({ type: 'crabTake', card }));
        case 'roundEnd': return [{ type: 'nextRound' }];
        default: return [];
    }
}

// ---- 見積もり ----

// これから点になる見込み（そろっていない2枚組・収集の途中・数える札のない倍率）
function potential(ids) {
    const n = countTypes(ids);
    let p = 0;
    ['crab', 'boat', 'fish'].forEach(t => { if (n[t] % 2 === 1) p += 0.45; });
    if (n.swimmer !== n.shark) p += 0.4;
    if (n.shell === 1) p += 0.7;
    if (n.octopus === 1) p += 0.8;
    if (n.sailor === 1) p += 1.2;
    Object.entries(MULTIPLIERS).forEach(([type, m]) => { if (n[type] > 0 && n[m.of] < (COLLECT_POINTS[m.of]?.length ?? 9) - 1) p += 0.35 * m.each; });
    p += 0.1 * n.mermaid;
    return p;
}

// 2枚組の効果の値打ち（そろえば出して、効果が働く）
const EFFECT_VALUE = { crab: 0.9, boat: 1.2, fish: 0.8, steal: 0.8 };

function value(ids, profile) {
    return cardPoints(ids) + profile.potential * potential(ids) + 0.12 * colorBonus(ids);
}

// 手札（と出した2枚組）に card を足したときの増え方
function gainOf(mine, card, profile) {
    let g = value([...mine, card], profile) - value(mine, profile);
    // 手札の中で新しく2枚組ができるなら、効果の分も足す
    const hand = mine.handOnly ?? [];
    const pair = hand.find(id => duoEffect(id, card));
    if (pair !== undefined) g += EFFECT_VALUE[duoEffect(pair, card)];
    return g;
}

// 見えていないカード（山札とほかの人の手札にあるかもしれないもの）
function unseenCards(view, seat) {
    const seen = new Set();
    view.players.forEach(p => {
        p.duos.flat().forEach(id => seen.add(id));
        (p.hand ?? []).forEach(id => seen.add(id));
    });
    view.discards.forEach(pile => { if (pile.top !== null) seen.add(pile.top); });
    (view.crab?.cards ?? []).forEach(id => seen.add(id));
    const all = Array.from({ length: DECK_SIZE }, (_, i) => i);
    return all.filter(id => !seen.has(id));
}

// ほかの人がそのラウンドで持っていそうな点
function estimateOpponent(p) {
    if (p.hand) return p.points;
    return p.points + p.handCount * 0.75;
}

// ---- 決める ----

export function decide(view, seat, random, profile) {
    const me = view.players[seat];
    const hand = me.hand ?? [];
    const mine = Object.assign([...hand, ...me.duos.flat()], { handOnly: hand });
    const jitter = () => (random() - 0.5) * 2 * profile.noise;

    if (view.phase === 'roundEnd') return { type: 'nextRound' };

    if (view.phase === 'draw') {
        const options = [];
        view.discards.forEach((pile, i) => {
            if (pile.top !== null) options.push({ command: { type: 'takeDiscard', pile: i }, score: gainOf(mine, pile.top, profile) + jitter() });
        });
        if (view.deckCount > 0) {
            const unseen = unseenCards(view, seat);
            const gains = unseen.map(id => gainOf(mine, id, profile)).sort((a, b) => b - a);
            const mean = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
            // 2枚から選べるので、平均より少し上を見込む
            const top = gains.length ? gains[Math.floor(gains.length / 4)] : 0;
            options.push({ command: { type: 'drawDeck' }, score: (mean + top) / 2 + 0.25 + jitter() });
        }
        options.sort((a, b) => b.score - a.score);
        return options[0]?.command ?? { type: 'drawDeck' };
    }

    if (view.phase === 'keep') {
        const [a, b] = view.drawn;
        const ga = gainOf(mine, a, profile) + jitter();
        const gb = gainOf(mine, b, profile) + jitter();
        const card = ga >= gb ? a : b;
        const other = card === a ? b : a;
        return { type: 'keep', card, pile: discardPile(view, other) };
    }

    if (view.phase === 'crab') {
        if (view.crab.pile === null) {
            // 枚数の多い山のほうが、良いカードがありそう
            const piles = [0, 1].filter(i => view.discards[i].count > 0);
            piles.sort((x, y) => view.discards[y].count - view.discards[x].count);
            return { type: 'crabLook', pile: piles[0] };
        }
        const best = [...view.crab.cards].sort((x, y) => gainOf(mine, y, profile) - gainOf(mine, x, profile))[0];
        return { type: 'crabTake', card: best };
    }

    if (view.phase === 'play') {
        const duo = chooseDuo(view, seat, hand);
        if (duo) return duo;
        if (view.canEnd) {
            const call = chooseCall(view, seat, me, random, profile);
            if (call) return { type: call };
        }
        return { type: 'endTurn' };
    }
    return null;
}

// 残りのカードを置く山。空の山があればそこ。なければ、ほかの人が欲しがりそうな一番上をふさぐ
function discardPile(view, card) {
    const empty = [0, 1].filter(i => view.discards[i].count === 0);
    if (empty.length === 1) return empty[0];
    const worth = (id) => (id === null ? -1 : { mermaid: 3, duo: 1, collect: 1.2, multi: 0.8 }[TYPES[CARDS[id].type].group]);
    return worth(view.discards[0].top) >= worth(view.discards[1].top) ? 0 : 1;
}

// 出す2枚組（効果のあるものから）。出せるものがなければ null
function chooseDuo(view, seat, hand) {
    const options = [];
    for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
            const effect = duoEffect(hand[i], hand[j]);
            if (effect) options.push({ cards: [hand[i], hand[j]], effect });
        }
    }
    if (options.length === 0) return null;
    const rank = (o) => {
        if (o.effect === 'fish') return view.deckCount > 0 ? 4 : 0;
        if (o.effect === 'crab') return view.discards.some(p => p.count > 0) ? 3 : 0;
        if (o.effect === 'steal') return view.stealTargets.length > 0 ? 2 : 0;
        return 1; // ボートは最後（ほかの効果を先に使ってから、もう1回）
    };
    options.sort((a, b) => rank(b) - rank(a));
    const pick = options[0];
    const command = { type: 'duo', cards: pick.cards };
    if (pick.effect === 'steal' && view.stealTargets.length > 0) {
        // 手札の多い人から取る
        const targets = [...view.stealTargets].sort((a, b) => view.players[b].handCount - view.players[a].handCount);
        command.target = targets[0];
    }
    return command;
}

// ストップ・ラストチャンス・続ける（null）
function chooseCall(view, seat, me, random, profile) {
    const pts = me.points;
    const others = view.players.filter(p => p.id !== seat);
    const best = Math.max(...others.map(estimateOpponent));
    // このラウンドで目標に届くなら、すぐ止める
    if (me.score + pts >= view.target && pts >= best) return 'stop';
    // 山札が少ないと、点なしで終わるおそれがある
    if (view.deckCount <= view.players.length * 2) return 'stop';
    if (pts >= view.threshold && pts - best >= profile.lead && view.deckCount > view.players.length * 3) return 'lastChance';
    if (pts >= profile.stopAt) return 'stop';
    if (random() < profile.rash) return 'stop';
    return null;
}
