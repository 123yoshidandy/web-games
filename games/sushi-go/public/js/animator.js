/**
 * 札の動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が新しい出来事を動かす
 * - 表にした札：手札（ほかの人は名前の欄）から、その人の前の場へ飛ぶ
 * - 配る・渡された手札：手札を順に出す。ラウンドの終わりは得点を弾ませる
 * 動きは部品が数えるので、CPU（Motion.afterIdle）は動き終わってから選ぶ
 */

import * as Motion from './motion/motion.js';
import { CARD_ORDER } from './cards.js';

const REVEAL_MS = 400;

const $ = selector => document.querySelector(selector);

const effective = entry => entry.nigiri ?? entry.type;
// 場の並び（ui.js の sortTableau と同じ）：種類の順。わさびに載ったにぎりは、にぎりの位置
const sorted = tableau => [...tableau].sort((a, b) => CARD_ORDER.indexOf(effective(a)) - CARD_ORDER.indexOf(effective(b)));

// 席ごとの場の入れ物（自分は #me、ほかの人は並び順）
function tableauOf(view, seat) {
    if (seat === view.you) return $('#me .tableau');
    const others = view.players.filter(p => p.id !== view.you);
    return document.querySelectorAll('#opponents .opponent')[others.findIndex(p => p.id === seat)]?.querySelector('.tableau') ?? null;
}

function headOf(view, seat) {
    if (seat === view.you) return $('#me');
    const others = view.players.filter(p => p.id !== view.you);
    return document.querySelectorAll('#opponents .opponent')[others.findIndex(p => p.id === seat)]?.querySelector('.op-head') ?? null;
}

// 描き直す前に測る（動かさない設定なら測らない）
export function measure(view) {
    if (!Motion.enabled() || !view) return null;
    const hand = [...document.querySelectorAll('#hand .card')].map(el => ({ type: el.dataset.card, rect: Motion.rectOf(el), el: el.cloneNode(true) })).filter(h => h.rect);
    const heads = new Map();
    view.players.forEach(p => {
        const rect = Motion.rectOf(headOf(view, p.id));
        if (rect) heads.set(p.id, rect);
    });
    return { hand, heads, scores: view.players.map(p => p.score) };
}

// 描いたあとで動かす（fresh：今回の新しい出来事）
export function animate(before, prev, view, fresh) {
    if (!Motion.enabled()) return;
    if (!prev || fresh.some(e => e.type === 'round')) dealHand();
    if (!before) return;
    for (const e of fresh) {
        if (e.type === 'reveal') {
            flyReveal(before, view, e);
            dealHand(Motion.ms(REVEAL_MS));
        } else if (e.type === 'roundEnd') {
            document.querySelectorAll('.stat.score').forEach(el => Motion.pulse(el, { duration: 400, delay: 200 }));
        }
    }
}

function dealHand(delay = 0) {
    document.querySelectorAll('#hand .card').forEach((el, i) => Motion.popIn(el, { duration: 240, delay: delay + i * 30 }));
}

function flyReveal(before, view, e) {
    const used = [...before.hand];
    e.cards.forEach((picked, seat) => {
        const minis = [...(tableauOf(view, seat)?.querySelectorAll('.mini') ?? [])];
        const entries = sorted(view.players[seat].tableau);
        const taken = new Set();
        picked.forEach((type, k) => {
            // 場に出た位置（同じ種類は後ろから）
            let at = -1;
            entries.forEach((entry, i) => { if (effective(entry) === type && !taken.has(i)) at = i; });
            if (at < 0) return;
            taken.add(at);
            const to = minis[at];
            if (!to) return;
            const delay = k * 90;
            if (seat === view.you) {
                const i = used.findIndex(h => h.type === type);
                if (i < 0) return;
                const [mine] = used.splice(i, 1);
                Motion.fly(mine.rect, to, { content: mine.el, hide: to, duration: REVEAL_MS, delay });
            } else {
                const from = before.heads.get(seat);
                if (from) Motion.fly(from, to, { content: to, hide: to, size: { width: 22, height: 28 }, duration: REVEAL_MS, delay });
            }
        });
    });
}
