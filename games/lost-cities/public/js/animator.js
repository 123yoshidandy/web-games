/**
 * 何が起きたかを動きで見せる
 * 描く前に、カード（data-card）と目印の要素の位置を測り（captureAnchors）、描いたあとで複製を元の位置から行き先へ飛ばす（playEvents）
 * 動きを減らす設定のときは動かさない
 */

import { cardHtml, cardBackHtml } from './art.js';

const DURATION_MS = 480;
const MAX_EVENTS = 6; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

export function captureAnchors() {
    const cards = {};
    document.querySelectorAll('#screen-game [data-card]').forEach(el => { cards[el.dataset.card] = rectOf(el); });
    return { cards, rival: rectOf(document.querySelector('#rival-hand')), deck: rectOf(document.querySelector('#deck')) };
}

function fly(html, from, to, { delay = 0, hide = null, size = null } = {}) {
    if (!from || !to) return;
    const width = size?.width ?? from.width;
    const height = size?.height ?? from.height;
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = html;
    Object.assign(el.style, {
        left: `${from.left + (from.width - width) / 2}px`, top: `${from.top + (from.height - height) / 2}px`,
        width: `${width}px`, height: `${height}px`
    });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.3, Math.min(1.2, to.width / width, to.height / height));
    const lift = -Math.min(50, 8 + Math.hypot(dx, dy) * 0.1);
    if (hide) hide.style.visibility = 'hidden';
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(1 + scale) / 2})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }
    ], { duration: DURATION_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const done = () => {
        el.remove();
        if (hide) hide.style.visibility = '';
    };
    animation.finished.then(done, done);
    setTimeout(done, DURATION_MS + delay + 400);
}

export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    const after = captureAnchors();
    const cardSize = Object.values(before.cards).find(r => r && r.width > 30) ?? null;
    let delay = 0;
    events.forEach(event => {
        const mine = event.seat === you;
        if (event.type === 'play') {
            const from = mine ? before.cards[event.card] : before.rival;
            const target = document.querySelector(`#screen-game [data-card="${event.card}"]`);
            fly(cardHtml(event.card), from, rectOf(target), { delay, hide: target, size: mine ? null : cardSize });
        } else if (event.type === 'draw') {
            const from = event.from === 'deck' ? before.deck : before.cards[event.card];
            const target = mine ? document.querySelector(`#hand [data-card="${event.card}"]`) : null;
            const to = mine ? rectOf(target) : after.rival;
            const html = event.card === null ? cardBackHtml() : cardHtml(event.card);
            fly(html, from, to, { delay, hide: target, size: cardSize });
        }
        delay += 140;
    });
}
