/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで、出来事ごとに複製を元の位置から行き先へ飛ばす（playEvents）
 * 動きを減らす設定のときは動かさない
 */

import { cardHtml, cardBackHtml } from './art.js';

const DURATION_MS = 480;
const STAGGER_MS = 80;
const MAX_EVENTS = 6; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};
const $ = (selector) => document.querySelector(selector);

// 目印の要素の位置を集める
export function captureAnchors() {
    const cards = (selector, key) => [...document.querySelectorAll(selector)].map(el => ({ g: Number(el.dataset[key]), rect: rectOf(el) }));
    return {
        hand: cards('#hand .card', 'card'),
        offer: cards('#offer [data-offer-card]', 'offerCard'),
        deck: rectOf($('#deck')),
        rivalHand: rectOf($('#rival-hand')),
        discards: rectOf($('#my-discards')) ?? rectOf($('#my-tokens .a-discard')),
        token: (who, action) => rectOf($(`#${who === 'me' ? 'my' : 'rival'}-tokens .a-${action}`)),
        chip: (who, g) => rectOf($(`[data-side="${who}"][data-g="${g}"] .chip:not(.ghost):last-of-type`)) ?? rectOf($(`[data-side="${who}"][data-g="${g}"]`))
    };
}

function fly(html, from, to, { delay = 0 } = {}) {
    if (!from || !to) return;
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = html;
    Object.assign(el.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.3, Math.min(1.2, to.width / from.width));
    const lift = -Math.min(50, 10 + Math.hypot(dx, dy) * 0.1);
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(1 + scale) / 2})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.85 }
    ], { duration: DURATION_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const remove = () => el.remove();
    animation.finished.then(remove, remove);
    setTimeout(remove, DURATION_MS + delay + 400);
}

// 一覧の中で、その種類のカードの位置。使った位置は一覧から外す（同じ種類が重なっても、別のカードから飛ばす）
function takeFrom(list, g) {
    const i = list.findIndex(item => item.g === g);
    if (i < 0) return null;
    return list.splice(i, 1)[0].rect;
}

export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    const after = captureAnchors();
    const handSize = before.hand[0]?.rect ?? after.hand[0]?.rect;
    let delay = 0;
    events.forEach(event => {
        const mine = event.seat === you;
        const beforeHand = [...before.hand];
        switch (event.type) {
        case 'draw':
            if (mine) fly(cardHtml(event.card), sized(before.deck, handSize), takeFrom([...after.hand], event.card), { delay });
            else fly(cardBackHtml(), sized(before.deck, handSize), after.rivalHand, { delay });
            break;
        case 'secret':
            if (mine) fly(cardHtml(event.card), takeFrom(beforeHand, event.card), after.chip('me', event.card), { delay });
            else fly(cardBackHtml(), sized(before.rivalHand, handSize), after.token('op', 'secret'), { delay });
            break;
        case 'discard':
            if (mine) event.cards.forEach((g, i) => fly(cardHtml(g), takeFrom(beforeHand, g), after.discards, { delay: delay + i * STAGGER_MS }));
            else [0, 1].forEach(i => fly(cardBackHtml(), sized(before.rivalHand, handSize), after.token('op', 'discard'), { delay: delay + i * STAGGER_MS }));
            break;
        case 'offer': {
            const cards = event.kind === 'gift' ? event.cards : event.groups.flat();
            const targets = [...after.offer];
            cards.forEach((g, i) => {
                const from = mine ? takeFrom(beforeHand, g) : sized(before.rivalHand, handSize);
                fly(cardHtml(g), from, takeFrom(targets, g), { delay: delay + i * STAGGER_MS });
            });
            break;
        }
        case 'pick': {
            // 差し出したカードが、選んだ人と出した人の側へ飛ぶ
            const options = event.kind === 'gift' ? event.offer.cards.map(c => [c]) : event.offer.groups;
            const sources = [...before.offer];
            const chooser = mine ? 'me' : 'op';
            const offerer = mine ? 'op' : 'me';
            let i = 0;
            options.forEach((option, index) => option.forEach(g => {
                fly(cardHtml(g), takeFrom(sources, g), after.chip(index === event.index ? chooser : offerer, g), { delay: delay + i++ * STAGGER_MS });
            }));
            break;
        }
        default:
            break;
        }
        delay += 140;
    });
}

// 小さな目印（山札・相手の手札）から飛ばすときは、カードの大きさにそろえる
function sized(rect, size) {
    if (!rect || !size) return rect;
    return { left: rect.left + rect.width / 2 - size.width / 2, top: rect.top + rect.height / 2 - size.height / 2, width: size.width, height: size.height };
}
