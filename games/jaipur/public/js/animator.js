/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで、出来事ごとに複製を元の位置から行き先へ飛ばす（playEvents）
 * 動きを減らす設定のときは動かさない
 */

import { cardHtml, cardBackHtml, tokenHtml } from './art.js';

const DURATION_MS = 520;
const STAGGER_MS = 80;
const MAX_EVENTS = 6; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

// 目印の要素の位置を集める
export function captureAnchors() {
    const $$ = (selector) => [...document.querySelectorAll(`#screen-game ${selector}`)];
    return {
        market: $$('#market .card').map(rectOf),
        hand: $$('#hand .card').map(el => ({ type: el.dataset.type, rect: rectOf(el) })),
        herd: rectOf(document.querySelector('#herd')),
        rival: rectOf(document.querySelector('#rival-hand')),
        rivalHerd: rectOf(document.querySelector('#rival-herd')),
        rivalScore: rectOf(document.querySelector('#rival-score')),
        myScore: rectOf(document.querySelector('#my-score')),
        deck: rectOf(document.querySelector('#deck')),
        stacks: Object.fromEntries($$('[data-stack]').map(el => [el.dataset.stack, rectOf(el)]))
    };
}

function fly(html, from, to, { delay = 0, size = null } = {}) {
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
    const scale = Math.max(0.35, Math.min(1.2, to.width / width, to.height / height));
    const lift = -Math.min(60, 10 + Math.hypot(dx, dy) * 0.12);
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(1 + scale) / 2})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }
    ], { duration: DURATION_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const remove = () => el.remove();
    animation.finished.then(remove, remove);
    setTimeout(remove, DURATION_MS + delay + 400);
}

// 手札の中で、その種類のカードの位置（描いたあと）
const handSpot = (after, type) => [...after.hand].reverse().find(h => h.type === type)?.rect ?? after.hand.at(-1)?.rect;

export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    const after = captureAnchors();
    const cardSize = after.market[0] ?? before.market[0];
    let delay = 0;
    events.forEach(event => {
        const mine = event.seat === you;
        const handTo = (type) => (mine ? handSpot(after, type) : after.rival);
        const refill = (list, start) => list?.forEach((r, i) => fly(cardHtml(r.card), before.deck, after.market[r.index], { delay: start + i * STAGGER_MS, size: cardSize }));
        switch (event.type) {
        case 'take':
            fly(cardHtml(event.card), before.market[event.index], handTo(event.card), { delay });
            refill(event.refill, delay + 260);
            break;
        case 'camels':
            event.indices.forEach((index, i) => fly(cardHtml('camel'), before.market[index], mine ? after.herd : after.rivalHerd, { delay: delay + i * STAGGER_MS }));
            refill(event.refill, delay + 300);
            break;
        case 'exchange': {
            event.take.forEach(({ index, card }, i) => fly(cardHtml(card), before.market[index], handTo(card), { delay: delay + i * STAGGER_MS }));
            event.give.forEach(({ index, card }, i) => {
                const from = card === 'camel' ? (mine ? before.herd : before.rivalHerd)
                    : mine ? before.hand.find(h => h.type === card)?.rect : before.rival;
                // 返したカードは市場で公開されるので、相手の分も表で飛ばす
                fly(cardHtml(card), from, after.market[index], { delay: delay + 200 + i * STAGGER_MS, size: cardSize });
            });
            break;
        }
        case 'sell': {
            // 売ったカードは消え、トークンが山から売った人へ飛ぶ
            const cards = mine ? before.hand.filter(h => h.type === event.good).slice(0, event.count) : [];
            cards.forEach(({ rect }, i) => fly(cardHtml(event.good), rect, before.stacks[event.good], { delay: delay + i * 50 }));
            const to = mine ? after.myScore : after.rivalScore;
            event.tokens.forEach((value, i) => fly(tokenHtml(event.good, value), before.stacks[event.good], to, { delay: delay + 250 + i * STAGGER_MS, size: { width: 26, height: 26 } }));
            if (event.bonus) fly(tokenHtml(`bonus b${event.bonus.size}`, event.bonus.value), before.stacks[`b${event.bonus.size}`], to, { delay: delay + 300 + event.tokens.length * STAGGER_MS, size: { width: 26, height: 26 } });
            if (!mine && event.count > 0) fly(cardBackHtml(), before.rival, before.stacks[event.good], { delay });
            break;
        }
        default:
            break;
        }
        delay += 120;
    });
}
