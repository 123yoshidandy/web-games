/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで複製を元の位置から行き先へ飛ばす（playEvents）
 * - 取る：商人カードが並びから取った人へ。置いた香辛料が、取った人から左のカードへ
 * - 買う：得点カードが並びから買った人へ
 * 動きを減らす設定のときは動かさない
 */

import { merchantHtml, pointHtml, cubeHtml } from './art.js';

const DURATION_MS = 480;
const MAX_EVENTS = 6; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

export function captureAnchors() {
    const collect = (selector, key) => {
        const map = {};
        document.querySelectorAll(selector).forEach(el => { map[el.dataset[key]] = rectOf(el); });
        return map;
    };
    return {
        market: collect('#market [data-market]', 'market'),
        points: collect('#point-row [data-point]', 'point'),
        players: collect('#players [data-player]', 'player'),
        mine: rectOf(document.querySelector('#mine')),
        hand: rectOf(document.querySelector('#hand'))
    };
}

function fly(html, from, to, { delay = 0, size = null, cls = '' } = {}) {
    if (!from || !to) return;
    const width = size?.width ?? from.width;
    const height = size?.height ?? from.height;
    const el = document.createElement('div');
    el.className = `flyer ${cls}`;
    el.innerHTML = html;
    Object.assign(el.style, {
        left: `${from.left + (from.width - width) / 2}px`, top: `${from.top + (from.height - height) / 2}px`,
        width: `${width}px`, height: `${height}px`
    });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.35, Math.min(1, to.height / height));
    const lift = -Math.min(40, 8 + Math.hypot(dx, dy) * 0.1);
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.6 }
    ], { duration: DURATION_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const done = () => el.remove();
    animation.finished.then(done, done);
    setTimeout(done, DURATION_MS + delay + 400);
}

// before：描く前の位置、you：画面の持ち主の席
export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    const after = captureAnchors();
    const playerRect = (seat, anchors) => (seat === you ? anchors.mine : anchors.players[seat]);
    let delay = 0;
    events.forEach(event => {
        if (event.type === 'acquire') {
            const from = playerRect(event.seat, before);
            // 置いた香辛料：取った人から、左のカードへ1個ずつ
            event.pay.forEach((color, i) => {
                const slot = after.market[i];
                if (from && slot) fly(cubeHtml(color), from, slot, { delay: delay + i * 60, size: { width: 14, height: 14 }, cls: 'cube-flyer' });
            });
            const to = event.seat === you ? after.hand : after.players[event.seat];
            fly(merchantHtml(event.card), before.market[event.index], to, { delay: delay + event.pay.length * 60 });
        } else if (event.type === 'claim') {
            fly(pointHtml(event.card), before.points[event.index], playerRect(event.seat, after), { delay });
        }
        delay += 140;
    });
}
