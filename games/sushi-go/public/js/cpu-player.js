/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（自分の手札、全員の場とプリン）だけを見て決める。ほかの人の手札や選んだ札はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：札ごとに「取ったら点がどれだけ増えそうか」を見積もり、一番よい札を取る
 *   天ぷら・刺身はそろう見込み（残りの番の数と、手札の同じ札）、餃子は増える点、にぎりはわさびの有無、
 *   わさびはあとでにぎりを載せられる見込み、巻き寿司はほかの人との差で順位が上がるか、プリンは最後の順位、
 *   箸は残りの番が多いほど高く見る。2枚目も十分に高ければ、箸で2枚取る
 * やさしい：札ごとの決まった値に大きな迷いを足して選ぶ。箸はほとんど使わない
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { CARDS } from './cards.js';
import { makiScores, makiIcons, puddingScores, countOf } from './scoring.js';

export const CPU_LEVELS = ['easy', 'normal'];
const DUMPLING = [0, 1, 3, 6, 10, 15];
const EASY_VALUE = { tempura: 2.5, sashimi: 3.3, dumpling: 2, maki1: 1.5, maki2: 3, maki3: 4.5, egg: 1, salmon: 2, squid: 3, wasabi: 2, pudding: 2, chopsticks: 1 };

const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 場に1枚足したあとの場（わさびとにぎりの扱いも合わせる）
function addCard(tableau, card) {
    const next = tableau.map(c => ({ ...c }));
    if (CARDS[card].nigiri) {
        const w = next.find(c => c.type === 'wasabi' && !c.nigiri);
        if (w) {
            w.nigiri = card;
            return next;
        }
    }
    next.push(card === 'wasabi' ? { type: 'wasabi', nigiri: null } : { type: card });
    return next;
}

// 札 card を取ったら、点がどれだけ増えそうか（ふつう）
// future：この札のあとに取れる枚数。hand：この札を除いた手札
export function cardValue(view, tableau, card, future, hand) {
    const me = view.players[view.you];
    const others = view.players.filter(p => p.id !== view.you);
    const same = hand.filter(c => c === card).length;
    switch (card) {
        case 'tempura': {
            const c = countOf(tableau, 'tempura');
            return c % 2 === 1 ? 5 : 5 * clamp(future * 0.12 + same * 0.15, 0, 0.75);
        }
        case 'sashimi': {
            const r = countOf(tableau, 'sashimi') % 3;
            if (r === 2) return 10;
            if (r === 1) return 10 * clamp(future * 0.08 + same * 0.12, 0, 0.6);
            return 10 * clamp((future - 1) * 0.05 + same * 0.08, 0, 0.4);
        }
        case 'dumpling': {
            const c = Math.min(5, countOf(tableau, 'dumpling'));
            const now = DUMPLING[Math.min(5, c + 1)] - DUMPLING[c];
            return now + (c < 4 ? clamp(future * 0.15, 0, 1.5) : 0);
        }
        case 'egg': case 'salmon': case 'squid': {
            const wasabi = tableau.some(c => c.type === 'wasabi' && !c.nigiri);
            return CARDS[card].nigiri * (wasabi ? 3 : 1);
        }
        case 'wasabi': {
            if (tableau.some(c => c.type === 'wasabi' && !c.nigiri)) return 0.5;
            const nigiriLater = hand.filter(c => CARDS[c].nigiri).length;
            return future >= 2 ? 3 + nigiriLater * 0.4 : (future === 1 ? 1.2 : 0);
        }
        case 'maki1': case 'maki2': case 'maki3': {
            // ラウンドの終わりの数を見積もって比べる（ほかの人もこれから巻き寿司を取る）。順位は確実でないので割り引く
            const icons = [makiIcons(tableau) + future * 0.3, ...others.map(o => makiIcons(o.tableau) + future * 0.4)];
            const before = makiScores(icons)[0];
            icons[0] += CARDS[card].maki;
            const after = makiScores(icons)[0];
            return (after - before) * 0.6 + CARDS[card].maki * 0.4;
        }
        case 'pudding': {
            const counts = [me.puddings + countOf(tableau, 'pudding'), ...others.map(o => o.puddings + countOf(o.tableau, 'pudding'))];
            const before = puddingScores(counts)[0];
            counts[0] += 1;
            const after = puddingScores(counts)[0];
            const late = view.round / 3;
            return 1.2 + (after - before) * (0.4 + 0.5 * late);
        }
        case 'chopsticks':
            return future >= 4 ? 2.2 : (future >= 2 ? 1 : 0);
        default:
            return 0;
    }
}

// ---- 手を選ぶ ----

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    const me = view.players[seat];
    if (view.phase !== 'pick' || me.picked) return null;
    const rand = cpuRandom(game, seat);
    const hand = me.hand;
    const kinds = [...new Set(hand)];
    if (level === 'easy') {
        const scored = kinds.map(c => ({ c, v: EASY_VALUE[c] + rand() * 3 })).sort((a, b) => b.v - a.v);
        const command = { type: 'pick', card: scored[0].c };
        if (view.canUseChopsticks && scored.length > 1 && rand() < 0.2) command.second = scored[1].c;
        return command;
    }
    const future = hand.length - 1;
    const without = (list, card) => {
        const rest = [...list];
        rest.splice(rest.indexOf(card), 1);
        return rest;
    };
    const scored = kinds.map(c => ({ c, v: cardValue(view, me.tableau, c, future, without(hand, c)) + rand() * 0.3 }))
        .sort((a, b) => b.v - a.v);
    const first = scored[0].c;
    const command = { type: 'pick', card: first };
    if (view.canUseChopsticks) {
        // 1枚目を置いたあとの場で、2枚目を選び直す。箸を手放す分（あとで使える見込み）より得なら使う
        const tableau = addCard(me.tableau, first);
        const rest = without(hand, first);
        const second = [...new Set(rest)].map(c => ({ c, v: cardValue(view, tableau, c, future - 1, without(rest, c)) }))
            .sort((a, b) => b.v - a.v)[0];
        const keepValue = future >= 3 ? 2 : 0.5;
        if (second && second.v >= 2.5 && second.v > keepValue) command.second = second.c;
    }
    return command;
}

// ---- ヒント ----

// 人の席のおすすめの手。CPU（ふつう）と同じ判断を、その席のビューだけで出す。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return chooseCommand(game, seat, 'normal');
}

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 選ぶのを待っている CPU に1枚選ばせる。思わぬ形なら、手札の最初の札で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const command = chooseCommand(game, seat, level);
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = { type: 'pick', card: game.players[seat].hand[0] };
    return game.applyCommand(seat, fallback) ? fallback : null;
}
