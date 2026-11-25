/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで、出来事ごとに複製を元の位置から行き先へ飛ばす（playEvents）
 * 動きを減らす設定のときは動かさない
 */

import { CARDS, TOKEN_COLORS } from './game.js';
import { tokenChip, cardHtml, cardBackHtml, nobleHtml } from './art.js';

const DURATION_MS = 560;
const STAGGER_MS = 70;
const CHIP_MAX_PX = 34;
const MAX_EVENTS = 12; // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 目印の要素の位置（画面の座標）を集める
export function captureAnchors() {
    const rects = {};
    const put = (key, el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) rects[key] = rect;
    };
    document.querySelectorAll('#screen-game [data-bank]').forEach(el => put(`bank:${el.dataset.bank}`, el.querySelector('.chip') ?? el));
    document.querySelectorAll('#screen-game [data-slot]').forEach(el => put(`slot:${el.dataset.slot}`, el));
    document.querySelectorAll('#screen-game [data-deck]').forEach(el => put(`deck:${el.dataset.deck}`, el));
    document.querySelectorAll('#screen-game .card[data-card]').forEach(el => put(`card:${el.dataset.card}`, el));
    document.querySelectorAll('#screen-game .nobles [data-noble]').forEach(el => put(`noble:${el.dataset.noble}`, el));
    document.querySelectorAll('#screen-game [data-player]').forEach(el => put(`player:${el.dataset.player}`, el));
    document.querySelectorAll('#screen-game [data-me-color]').forEach(el => put(`me:${el.dataset.meColor}`, el.querySelector('.chip') ?? el));
    document.querySelectorAll('#screen-game .me-reserved').forEach(el => put('me:reserved', el));
    return rects;
}

// 宝石は、元と行き先が行のような大きな領域でも、宝石1個の大きさの正方形で飛ばす
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

function pulse(selector) {
    const el = document.querySelector(selector);
    el?.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.04)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 420, delay: 260, easing: 'ease-out', fill: 'backwards' });
}

// 出来事を順に動かす。before：描く前の位置、you：画面の持ち主の席
export function playEvents(events, before, { you }) {
    if (events.length === 0 || events.length > MAX_EVENTS || reducedMotion()) return;
    const after = captureAnchors();
    // 持ち主の宝石は色ごとの欄へ、ほかの人は行へ
    const gemSpot = (rects, seat, color) => (seat === you ? rects[`me:${color}`] : null) ?? rects[`player:${seat}`];
    let delay = 0;
    const chips = (tokens, from, to, step = STAGGER_MS) => {
        TOKEN_COLORS.forEach(color => {
            for (let i = 0; i < (tokens?.[color] ?? 0); i++) {
                fly(tokenChip(color), from(color), to(color), { delay, cls: 'flyer-chip' });
                delay += step;
            }
        });
    };

    events.forEach(event => {
        const seat = event.seat;
        switch (event.type) {
        case 'take':
            chips(event.tokens, c => before[`bank:${c}`], c => gemSpot(after, seat, c));
            break;
        case 'discard':
            chips(event.tokens, c => gemSpot(before, seat, c), c => after[`bank:${c}`]);
            break;
        case 'buy': {
            const card = CARDS[event.card];
            const from = before[`card:${event.card}`];
            chips(event.payment, c => gemSpot(before, seat, c), c => after[`bank:${c}`], 40);
            fly(cardHtml(event.card), from, gemSpot(after, seat, card.bonus), { delay, cls: 'flyer-card' });
            delay += 160;
            break;
        }
        case 'reserve': {
            const from = event.from.deck ? before[`deck:${event.from.deck}`] : before[`card:${event.card}`];
            const to = seat === you ? (after[`card:${event.card}`] ?? after['me:reserved']) : after[`player:${seat}`];
            const html = event.card === null || (event.hidden && seat !== you) ? cardBackHtml(event.level) : cardHtml(event.card);
            fly(html, from, to, { delay, cls: 'flyer-card' });
            if (event.gold) fly(tokenChip('gold'), before['bank:gold'], gemSpot(after, seat, 'gold'), { delay: delay + 120, cls: 'flyer-chip' });
            delay += 200;
            break;
        }
        case 'refill':
            pulse(`#screen-game [data-slot="${event.level}-${event.slot}"] .card`);
            break;
        case 'noble':
            fly(nobleHtml(event.noble), before[`noble:${event.noble}`], after[`player:${seat}`], { delay, cls: 'flyer-noble' });
            delay += 200;
            break;
        default:
            break;
        }
    });
}
