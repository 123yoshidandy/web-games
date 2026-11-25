/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで、出来事ごとに複製を元の位置から行き先へ飛ばす（playEvents）
 * 動きを減らす設定のときは動かさない
 */

import { CARDS, TOKEN_COLORS } from './game.js';
import { tokenChip, cardHtml, cardBackHtml, royalHtml, scrollIcon } from './art.js';

const DURATION_MS = 560;
const STAGGER_MS = 70;
const CHIP_MAX_PX = 34;
const MAX_EVENTS = 14; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 目印の要素の位置（画面の座標）を集める
export function captureAnchors() {
    const rects = {};
    const put = (key, el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) rects[key] = rect;
    };
    const all = (selector, fn) => document.querySelectorAll(`#screen-game ${selector}`).forEach(fn);
    all('[data-cell]', el => put(`cell:${el.dataset.cell}`, el));
    all('[data-slot]', el => put(`slot:${el.dataset.slot}`, el));
    all('[data-deck]', el => put(`deck:${el.dataset.deck}`, el));
    all('.card[data-card]', el => put(`card:${el.dataset.card}`, el));
    all('.royals [data-royal]', el => put(`royal:${el.dataset.royal}`, el));
    all('[data-player]', el => put(`player:${el.dataset.player}`, el));
    all('[data-me-color]', el => put(`me:${el.dataset.meColor}`, el.querySelector('.chip') ?? el));
    all('[data-reserved]', el => put('me:reserved', el));
    all('[data-bag] .bag-icon', el => put('bag', el));
    all('[data-pool]', el => put('pool', el));
    all('.me-head .stat-priv', el => put('me:privilege', el));
    return rects;
}

// トークンは、元と行き先が行のような大きな領域でも、トークン1個の大きさの正方形で飛ばす
function chipRect(rect) {
    const size = Math.min(rect.width, rect.height, CHIP_MAX_PX);
    return { left: rect.left + (rect.width - size) / 2, top: rect.top + (rect.height - size) / 2, width: size, height: size };
}

function fly(html, from, to, { delay = 0, cls = '' } = {}) {
    if (!from || !to) return;
    if (cls === 'flyer-chip') {
        from = chipRect(from);
        to = chipRect(to);
    }
    const el = document.createElement('div');
    el.className = `flyer ${cls}`;
    el.innerHTML = html;
    Object.assign(el.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.35, Math.min(1, to.width / from.width, to.height / from.height));
    // 遠いほど高い弧を描く
    const lift = -Math.min(90, 16 + Math.hypot(dx, dy) * 0.18);
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.9 }
    ], { duration: DURATION_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const remove = () => el.remove();
    animation.finished.then(remove, remove);
    // 裏のタブなどで終わりが来なくても、必ず消す
    setTimeout(remove, DURATION_MS + delay + 400);
}

function pulse(selector, delay = 260) {
    const el = document.querySelector(selector);
    el?.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.04)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 420, delay, easing: 'ease-out', fill: 'backwards' });
}

// 出来事を順に動かす。before：描く前の位置、you：画面の持ち主の席
export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    const after = captureAnchors();
    // 持ち主のトークンは色ごとの欄へ、相手は相手の欄へ
    const gemSpot = (rects, seat, color) => (seat === you ? rects[`me:${color}`] : null) ?? rects[`player:${seat}`];
    const privilegeSpot = (rects, seat) => (seat === you ? rects['me:privilege'] : null) ?? rects[`player:${seat}`];
    let delay = 0;
    const chipsToBag = (tokens, seat, step = 40) => {
        TOKEN_COLORS.forEach(color => {
            for (let i = 0; i < (tokens?.[color] ?? 0); i++) {
                fly(tokenChip(color), gemSpot(before, seat, color), after.bag, { delay, cls: 'flyer-chip' });
                delay += step;
            }
        });
    };

    events.forEach(event => {
        const seat = event.seat;
        switch (event.type) {
        case 'take':
            event.cells.forEach((cell, i) => {
                fly(tokenChip(event.colors[i]), before[`cell:${cell}`], gemSpot(after, seat, event.colors[i]), { delay, cls: 'flyer-chip' });
                delay += STAGGER_MS;
            });
            break;
        case 'privilege':
            fly(scrollIcon(), privilegeSpot(before, seat), after.pool, { delay, cls: 'flyer-chip' });
            fly(tokenChip(event.color), before[`cell:${event.cell}`], gemSpot(after, seat, event.color), { delay: delay + 80, cls: 'flyer-chip' });
            delay += 160;
            break;
        case 'ability-token':
            fly(tokenChip(event.color), before[`cell:${event.cell}`], gemSpot(after, seat, event.color), { delay, cls: 'flyer-chip' });
            delay += STAGGER_MS;
            break;
        case 'gain-privilege': {
            const from = event.from === 'pool' ? before.pool : privilegeSpot(before, 1 - seat);
            fly(scrollIcon(), from, privilegeSpot(after, seat), { delay, cls: 'flyer-chip' });
            delay += 120;
            break;
        }
        case 'replenish':
            event.placed.forEach(({ cell, color }) => {
                fly(tokenChip(color), before.bag, after[`cell:${cell}`], { delay, cls: 'flyer-chip' });
                delay += 35;
            });
            break;
        case 'steal':
            fly(tokenChip(event.color), gemSpot(before, event.from, event.color), gemSpot(after, seat, event.color), { delay, cls: 'flyer-chip' });
            delay += 120;
            break;
        case 'discard':
            chipsToBag(event.tokens, seat, STAGGER_MS);
            break;
        case 'buy': {
            const card = CARDS[event.card];
            const from = before[`card:${event.card}`];
            chipsToBag(event.payment, seat);
            const color = card.color === 'wild' || !card.color ? 'gold' : card.color;
            fly(cardHtml(event.card), from, gemSpot(after, seat, color), { delay, cls: 'flyer-card' });
            delay += 160;
            break;
        }
        case 'reserve': {
            const from = event.from.deck ? before[`deck:${event.from.deck}`] : before[`card:${event.card}`];
            const to = seat === you ? (after[`card:${event.card}`] ?? after['me:reserved']) : after[`player:${seat}`];
            const html = event.card === null || (event.hidden && seat !== you) ? cardBackHtml(event.level) : cardHtml(event.card);
            fly(html, from, to, { delay, cls: 'flyer-card' });
            fly(tokenChip('gold'), before[`cell:${event.gold}`], gemSpot(after, seat, 'gold'), { delay: delay + 120, cls: 'flyer-chip' });
            delay += 200;
            break;
        }
        case 'royal':
            fly(royalHtml(event.royal), before[`royal:${event.royal}`], after[`player:${seat}`], { delay, cls: 'flyer-royal' });
            delay += 200;
            break;
        case 'refill':
            pulse(`#screen-game [data-slot="${event.level}-${event.slot}"] .card`);
            break;
        default:
            break;
        }
    });
}
