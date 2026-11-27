/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで複製を元の位置から行き先へ飛ばす（playEvents）
 * 動きの速さが「なし」のとき（動きを減らす設定のときも）は動かさない
 */

import { cardHtml } from './art.js';
import * as Motion from './motion/motion.js';

const DURATION_MS = 460;
const MAX_EVENTS = 6; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => !Motion.enabled();
const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

export function captureAnchors() {
    const slots = {};
    document.querySelectorAll('#rows [data-slot]').forEach(el => { slots[el.dataset.slot] = rectOf(el); });
    const players = {};
    document.querySelectorAll('#screen-game [data-player]').forEach(el => { players[el.dataset.player] = rectOf(el); });
    return { slots, players, deck: rectOf(document.querySelector('#deck')), pending: rectOf(document.querySelector('#pending .tile')) };
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
    ], { duration: Motion.ms(DURATION_MS), delay: Motion.ms(delay), easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const done = () => {
        el.remove();
        if (hide) hide.style.visibility = '';
    };
    Motion.track(animation, Motion.ms(DURATION_MS + delay));
    animation.finished.then(done, done);
    setTimeout(done, DURATION_MS + delay + 400);
}

// before：描く前の位置、you：画面の持ち主の席
export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    const after = captureAnchors();
    const tileSize = Object.values(before.slots).find(Boolean) ?? Object.values(after.slots).find(Boolean);
    let delay = 0;
    events.forEach(event => {
        if (event.type === 'draw') {
            const target = document.querySelector('#pending .tile');
            fly(cardHtml(event.card), before.deck, rectOf(target), { delay, hide: target, size: tileSize });
        } else if (event.type === 'place') {
            // 置いたカードは、その列の最後の札
            const target = [...document.querySelectorAll(`#rows [data-row="${event.row}"] .tile`)].at(-1);
            fly(cardHtml(event.card), before.pending ?? before.deck, rectOf(target), { delay, hide: target });
        } else if (event.type === 'take') {
            const to = event.seat === you ? after.players.me : after.players[event.seat];
            event.cards.forEach((card, i) => fly(cardHtml(card), before.slots[`${event.row}-${i}`], to, { delay: delay + i * 70, size: tileSize }));
        }
        delay += 120;
    });
}
