/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビューだけを見て決める。相手の手札や山札の並び、交易デッキの並びはのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう
 * - 手札は全部出す。廃棄の効果では、スカウトとバイパーを捨て札から先に廃棄する
 * - 獲得：カードの値（費用＋引く効果・前哨・廃棄の効果の上乗せ＋持っている同じ勢力の数）がいちばん高いものから、交易が続く限り買う
 * - 攻撃：とどめを刺せるなら権威へ。前哨は先に壊す。ほかの基地は、壊せて値打ちがあれば壊し、残りで権威を攻撃する
 * - 選ぶもの：権威が少なければ権威を、交易が足りそうなら交易を選ぶ。廃棄のエクスプローラーは、とどめのときと後半に使う
 * やさしい：手札を順に全部出し、買えるものからでたらめに買い、前哨から攻撃する。廃棄の効果は使わない
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { CARDS, EXPLORER } from './cards.js';

export const CPU_LEVELS = ['easy', 'normal'];
const WEAK = new Set(['scout', 'viper']);

// ---- カードの値 ----

function cardValue(key, view) {
    const c = CARDS[key];
    let v = c.cost;
    const all = [...c.primary, ...c.ally, ...c.scrap];
    if (all.some(e => e.draw || e.drawIfBases || e.drawPerBlob)) v += 1.5;
    if (all.some(e => e.scrapHandOrDiscard || e.brainWorld)) v += view.turnNumber < 12 ? 1.2 : 0;
    if (c.type === 'outpost') v += 0.5;
    if (c.type !== 'ship') v += 0.4 * Math.min(4, c.defense) / 4;
    // 同じ勢力を集めると同盟の能力が出やすい
    const me = view.players[view.you];
    const owned = [...(me.hand ?? []), ...me.discard, ...me.inPlay, ...me.bases].filter(x => CARDS[x.key].faction === c.faction && c.faction !== 'none').length;
    v += 0.5 * Math.min(5, owned);
    if (key === 'explorer') v = view.turnNumber < 8 ? 1.6 : 0.8;
    return v;
}

const lowValue = (key) => (key === 'viper' ? 0 : key === 'scout' ? 1 : 2 + CARDS[key].cost);

// ---- 選ぶもの ----

function answerPrompt(view, level, rand) {
    const pr = view.prompt;
    const me = view.players[view.you];
    const opp = view.players[1 - view.you];
    const hand = me.hand ?? [];
    const pick = (list, n) => list.slice(0, n).map(x => x.id);
    const byLow = (list) => [...list].sort((a, b) => lowValue(a.key) - lowValue(b.key));
    if (pr.kind === 'or') {
        if (level === 'easy') return { type: 'choose', option: Math.floor(rand() * pr.options.length) };
        const score = (effects) => effects.reduce((s, e) => s
            + (e.authority ? e.authority * (me.authority < 20 ? 1.5 : 0.4) : 0)
            + (e.trade ? e.trade * (view.turn.trade + e.trade >= 3 ? 1.2 : 0.8) : 0)
            + (e.combat ? e.combat * (opp.authority - view.turn.combat <= e.combat ? 3 : 0.9) : 0)
            + (e.drawPerBlob ? view.turn.blobPlayed * 2.2 : 0)
            + (e.recycle ? Math.min(2, hand.filter(x => WEAK.has(x.key)).length) * 1.4 : 0), 0);
        let best = 0;
        pr.options.forEach((o, i) => { if (score(o) > score(pr.options[best])) best = i; });
        return { type: 'choose', option: best };
    }
    if (pr.kind === 'discard') return { type: 'choose', cards: pick(byLow(hand), pr.count) };
    if (pr.kind === 'scrapHand') return { type: 'choose', cards: pick(byLow(hand), 1) };
    if (pr.kind === 'scrapCards' || pr.kind === 'brainWorld') {
        if (level === 'easy') return { type: 'choose', cards: [] };
        // 捨て札のバイパー・スカウトを先に（手札のスカウトはこの手番の交易になるため後）
        const weak = [...me.discard.filter(x => WEAK.has(x.key)), ...hand.filter(x => x.key === 'viper'), ...hand.filter(x => x.key === 'scout')];
        return { type: 'choose', cards: pick(weak, pr.max) };
    }
    if (pr.kind === 'recycle') return { type: 'choose', cards: pick(hand.filter(x => WEAK.has(x.key)), pr.max) };
    if (pr.kind === 'scrapRow') {
        if (level === 'easy') return { type: 'choose', cards: [] };
        const big = [...view.tradeRow].sort((a, b) => CARDS[b.key].cost - CARDS[a.key].cost)[0];
        return { type: 'choose', cards: big && CARDS[big.key].cost >= 6 && CARDS[big.key].cost > view.turn.trade ? [big.id] : [] };
    }
    if (pr.kind === 'destroyBase') {
        const best = [...opp.bases].sort((a, b) => CARDS[b.key].defense - CARDS[a.key].defense)[0];
        return { type: 'choose', cards: best ? [best.id] : [] };
    }
    if (pr.kind === 'copyShip') {
        const ships = me.inPlay.filter(x => x.id !== pr.source && CARDS[x.key].type === 'ship');
        const best = [...ships].sort((a, b) => CARDS[b.key].cost - CARDS[a.key].cost)[0];
        return { type: 'choose', cards: [best.id] };
    }
    if (pr.kind === 'freeShip') {
        const ships = view.tradeRow.filter(x => CARDS[x.key].type === 'ship');
        const best = [...ships].sort((a, b) => cardValue(b.key, view) - cardValue(a.key, view))[0];
        return { type: 'choose', cards: best ? [best.id] : [] };
    }
    return { type: 'choose', cards: [] };
}

// ---- 手番 ----

export function chooseCommand(view, level = 'normal', rand = Math.random) {
    const me = view.players[view.you];
    const opp = view.players[1 - view.you];
    if (view.phase === 'end' || !view.answering.includes(view.you)) return null;
    if (view.prompt) return answerPrompt(view, level, rand);
    const hand = me.hand ?? [];
    // 1. 手札を出す（ふつうは、廃棄の効果のあるカードを後に出して、スカウトから交易を得てから廃棄する）
    if (hand.length) {
        if (level === 'easy') return { type: 'play', card: hand[0].id };
        const order = [...hand].sort((a, b) => {
            const s = (k) => (CARDS[k].primary.some(e => e.scrapHandOrDiscard) ? 1 : 0);
            return s(a.key) - s(b.key);
        });
        return { type: 'play', card: order[0].id };
    }
    const outposts = opp.bases.filter(b => CARDS[b.key].type === 'outpost');
    const combat = view.turn.combat;
    // 2. 廃棄の能力（ふつう）：とどめを刺せるとき、または後半のエクスプローラー
    if (level === 'normal') {
        const scrappable = [...me.inPlay, ...me.bases].filter(x => CARDS[view.turn.used[x.id]?.as ?? x.key].scrap.length);
        const combatFrom = (x) => CARDS[view.turn.used[x.id]?.as ?? x.key].scrap.reduce((s, e) => s + (e.combat ?? 0), 0);
        const extra = scrappable.reduce((s, x) => s + (me.inPlay.some(y => y.id === x.id) ? combatFrom(x) : 0), 0);
        if (!outposts.length && combat < opp.authority && combat + extra >= opp.authority) {
            const x = scrappable.find(y => me.inPlay.some(z => z.id === y.id) && combatFrom(y) > 0);
            if (x) return { type: 'scrap', card: x.id };
        }
        const late = view.turnNumber >= 14;
        const explorer = me.inPlay.find(x => x.key === 'explorer');
        if (late && explorer) return { type: 'scrap', card: explorer.id };
    }
    // 3. 攻撃
    if (combat > 0) {
        if (!outposts.length && combat >= opp.authority) return { type: 'attack', target: 'player' };
        const breakable = (list) => list.filter(b => CARDS[b.key].defense <= combat).sort((a, b) => CARDS[b.key].defense - CARDS[a.key].defense);
        if (outposts.length) {
            const [o] = breakable(outposts);
            if (o) return { type: 'attack', target: o.id };
        } else {
            const bases = breakable(opp.bases);
            if (level === 'normal' && bases.length && CARDS[bases[0].key].defense >= 4) return { type: 'attack', target: bases[0].id };
            return { type: 'attack', target: 'player' };
        }
    }
    // 4. 獲得
    const affordable = [...view.tradeRow.filter(x => CARDS[x.key].cost <= view.turn.trade).map(x => ({ id: x.id, key: x.key })),
        ...(view.explorers > 0 && view.turn.trade >= EXPLORER.cost ? [{ id: 'explorer', key: 'explorer' }] : [])];
    if (affordable.length) {
        if (level === 'easy') {
            const x = affordable[Math.floor(rand() * affordable.length)];
            if (rand() < 0.85) return { type: 'buy', card: x.id };
        } else {
            const best = affordable.sort((a, b) => cardValue(b.key, view) - cardValue(a.key, view))[0];
            return { type: 'buy', card: best.id };
        }
    }
    return { type: 'end' };
}

// CPU 用の乱数（ゲームの乱数とは別）
export const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 操作を待っている CPU に1手打たせる。通らなければ、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, level ?? game.players[seat].cpuLevel ?? 'normal', cpuRandom(game, seat));
    if (command && game.applyCommand(seat, command)) return command;
    const simple = view.prompt ? simpleAnswer(game, seat) : { type: 'end' };
    return game.applyCommand(seat, simple) ? simple : null;
}

// 選ぶものに、条件を満たすいちばん小さい答えで答える
function simpleAnswer(game, seat) {
    const pr = game.prompts[0];
    const p = game.players[seat];
    if (pr.kind === 'or') return { type: 'choose', option: 0 };
    if (pr.kind === 'discard') return { type: 'choose', cards: p.hand.slice(0, pr.count) };
    if (pr.kind === 'scrapHand') return { type: 'choose', cards: p.hand.slice(0, 1) };
    if (pr.kind === 'copyShip') return { type: 'choose', cards: [p.inPlay.find(x => x !== pr.source && CARDS[game.keyOf(x)].type === 'ship')] };
    return { type: 'choose', cards: [] };
}
