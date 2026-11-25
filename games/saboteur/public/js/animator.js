/**
 * 何が起きたかを動きで見せる
 * 描く前に、手札のカードと人の札の位置を測り（captureAnchors）、描いたあとで複製を元の位置から行き先へ飛ばす（playEvents）
 * 動きを減らす設定のときは動かさない
 */

import { CARDS } from './cards.js';
import { pathSvg, handCardHtml } from './art.js';

const DURATION_MS = 480;
const MAX_EVENTS = 8; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

export function captureAnchors() {
    const hand = {};
    document.querySelectorAll('#hand [data-card]').forEach(el => { hand[el.dataset.card] = rectOf(el); });
    const players = {};
    document.querySelectorAll('#screen-game [data-player]').forEach(el => { players[el.dataset.player] = rectOf(el); });
    return { hand, players };
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
    const scale = Math.max(0.3, Math.min(1.5, to.width / width, to.height / height));
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
    let delay = 0;
    events.forEach(event => {
        const from = event.seat === you ? before.hand[event.card] : before.players[event.seat];
        if (event.type === 'path') {
            const target = document.querySelector(`#world .cell[data-x="${event.x}"][data-y="${event.y}"]`);
            fly(`<div class="fly-path">${pathSvg(event.card, event.rotated)}</div>`, from, rectOf(target), { delay, hide: target, size: rectOf(target) });
        } else if (event.type === 'break' || event.type === 'repair') {
            const to = rectOf(document.querySelector(`#screen-game [data-player="${event.target}"]`));
            fly(handCardHtml(event.card), from, to, { delay, size: { width: 34, height: 48 } });
        } else if (event.type === 'map' || event.type === 'rockfall' || event.type === 'discard') {
            // 地図・落盤・捨てたカードは、出した人の札から少し浮かせて消す
            if (event.type !== 'discard' && CARDS[event.card]) fly(handCardHtml(event.card), from, from, { delay, size: { width: 34, height: 48 } });
        }
        delay += 120;
    });
}
