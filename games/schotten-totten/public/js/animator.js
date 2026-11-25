/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで、出したカードの複製を元の位置から石へ飛ばす（playEvents）
 * 取った石は CSS（.stone.just）で光らせる。動きを減らす設定のときは動かさない
 */

import { chipHtml } from './art.js';

const DURATION_MS = 450;
const MAX_EVENTS = 6; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

export function captureAnchors() {
    return {
        hand: [...document.querySelectorAll('#hand .card')].map(el => ({ card: el.dataset.card, rect: rectOf(el) })),
        rival: rectOf(document.querySelector('#rival-hand'))
    };
}

function fly(html, from, to) {
    if (!from || !to) return;
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = html;
    Object.assign(el.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    document.body.appendChild(el);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const animation = el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)`, opacity: 0.9 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 }
    ], { duration: DURATION_MS, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'backwards' });
    const remove = () => el.remove();
    animation.finished.then(remove, remove);
    setTimeout(remove, DURATION_MS + 400);
}

export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    events.forEach(event => {
        if (event.type !== 'play') return;
        const who = event.seat === you ? 'me' : 'op';
        const chips = document.querySelectorAll(`[data-stone-side="${event.stone}"][data-side="${who}"] .chip`);
        const to = rectOf(chips[chips.length - 1]);
        const from = event.seat === you ? before.hand.find(h => h.card === String(event.card))?.rect : before.rival;
        fly(chipHtml(event.entry), from, to);
    });
}
