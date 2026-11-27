/**
 * カードの動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が動かす
 * - 出したカード：手札（相手は手札の裏）から、その人の捨て札の列へ飛ぶ
 * - 引いたカード：山札から自分の手札へ飛ぶ
 * - 好意の印が増えたら：弾ませる
 * 動きは部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';
import { cardFace } from './card-art.js';

const PLAY_MS = 380;
const DRAW_MS = 340;

const $ = id => document.getElementById(id);
const oppEl = seat => document.querySelector(`#opponents .opp[data-seat="${seat}"]`);
const discardsOf = (view, seat) => (seat === view.seat ? $('me-info').querySelector('.discards') : oppEl(seat)?.querySelector('.discards'));

// 描き直す前に測る（動かさない設定なら測らない）
export function measure(view) {
    if (!Motion.enabled() || !view) return null;
    const hand = [...$('hand').querySelectorAll('.hand-card')].map(el => ({ card: Number(el.dataset.card), rect: Motion.rectOf(el.querySelector('.card') ?? el), el: el.querySelector('.card')?.cloneNode(true) }));
    const opp = new Map();
    view.players.forEach(p => {
        const rect = Motion.rectOf(oppEl(p.id)?.querySelector('.opp-hand'));
        if (rect) opp.set(p.id, rect);
    });
    return { hand, opp, deck: Motion.rectOf($('deck-info').querySelector('.deck .card')), tokens: view.players.map(p => p.tokens) };
}

// 描いたあとで動かす（fresh：今回の新しいイベント）
export function animate(before, view, fresh) {
    if (!before || !Motion.enabled()) return;
    let index = 0;
    for (const e of fresh) {
        if (e.type === 'play') flyPlay(before, view, e, index++);
        else if (e.type === 'draw' && e.seat === view.seat && e.secret) flyDraw(before, view);
    }
    view.players.forEach((p, i) => {
        if (p.tokens > (before.tokens[i] ?? 0)) {
            const el = p.id === view.seat ? $('me-info').querySelector('.hearts') : oppEl(p.id)?.querySelector('.hearts');
            Motion.pulse(el, { duration: 400, delay: 300 });
        }
    });
}

function flyPlay(before, view, e, index) {
    const to = discardsOf(view, e.seat)?.lastElementChild;
    if (!to) return;
    const delay = index * 120;
    if (e.seat === view.seat) {
        const mine = before.hand.find(h => h.card === e.card);
        if (!mine?.rect) return;
        Motion.fly(mine.rect, to, { content: mine.el, hide: to, duration: PLAY_MS, delay, style: { fontSize: '15px' } });
    } else {
        const from = before.opp.get(e.seat);
        if (!from) return;
        Motion.fly(from, to, { content: cardFace(e.card, { size: 'mid' }), hide: to, size: { width: 74, height: 104 }, duration: PLAY_MS, delay });
    }
}

function flyDraw(before, view) {
    const cards = [...$('hand').querySelectorAll('.hand-card')];
    const to = cards.at(-1)?.querySelector('.card');
    if (!before.deck || !to) return;
    const rect = Motion.rectOf(to);
    if (!rect) return;
    Motion.fly(before.deck, to, { content: to.cloneNode(true), hide: to, size: { width: rect.width, height: rect.height }, duration: DRAW_MS, delay: 150, style: { fontSize: '15px' } });
}
