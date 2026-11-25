/**
 * 何が起きたかを動きで見せる
 * 描く前に目印の要素の位置を測り（captureAnchors）、描いたあとで、出来事ごとに複製を元の位置から行き先へ飛ばす（playEvents）
 * 連鎖で働いたギズモは、帯（#ticker）に順に流し、自分の機械の札を順に光らせる
 * 動きを減らす設定のときは飛ばさない（帯には出す）
 */

import { CARDS } from './cards.js';
import { effectText } from './card-text.js';
import { sphere, cardHtml, cardBackHtml, tileHtml, icon } from './art.js';

const DURATION_MS = 520;
const STEP_MS = 110;          // 飛ばすものの間隔
const CHAIN_STEP_MS = 480;    // 連鎖で働いたギズモを見せる間隔
const TICK_LIFE_MS = 3600;    // 帯に残す時間
const MAX_TICKS = 4;
const MAX_EVENTS = 40;        // これより多く溜まっていたら（裏のタブから戻ったときなど）、動かさない

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let tickerTimers = [];

export function resetTicker() {
    tickerTimers.forEach(clearTimeout);
    tickerTimers = [];
    const ticker = document.querySelector('#ticker');
    if (ticker) ticker.innerHTML = '';
}

// 目印の要素の位置（画面の座標）を集める
export function captureAnchors() {
    const rects = {};
    const put = (key, el) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) rects[key] = rect;
    };
    const all = (selector, fn) => document.querySelectorAll(`#screen-game ${selector}`).forEach(fn);
    all('[data-row-slot]', el => put(`row:${el.dataset.rowSlot}`, el.querySelector('.sph') ?? el));
    all('[data-dispenser]', el => put('dispenser', el));
    all('[data-slot]', el => put(`slot:${el.dataset.slot}`, el));
    all('[data-deck]', el => put(`deck:${el.dataset.deck}`, el));
    all('.card[data-card]', el => put(`card:${el.dataset.card}`, el));
    all('[data-player]', el => put(`player:${el.dataset.player}`, el));
    all('[data-me-color]', el => put(`me:${el.dataset.meColor}`, el.querySelector('.sph') ?? el));
    all('[data-me-archive]', el => put('me:archive', el));
    all('[data-me-vp]', el => put('me:vp', el));
    all('#me [data-tile]', el => put(`tile:${el.dataset.tile}`, el));
    all('#me [data-col]', el => put(`col:${el.dataset.col}`, el));
    return rects;
}

function fly(html, from, to, { delay = 0, cls = '' } = {}) {
    if (!from || !to) return;
    const el = document.createElement('div');
    el.className = `flyer ${cls}`;
    el.innerHTML = html;
    Object.assign(el.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.3, Math.min(1.2, to.width / from.width, to.height / from.height));
    // 遠いほど高い弧を描く
    const lift = -Math.min(80, 14 + Math.hypot(dx, dy) * 0.16);
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.85 }
    ], { duration: DURATION_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const remove = () => el.remove();
    animation.finished.then(remove, remove);
    // 裏のタブなどで終わりが来なくても、必ず消す
    setTimeout(remove, DURATION_MS + delay + 400);
}

// 玉は、行き先が大きな領域でも、玉1個の大きさで飛ばす
const SPHERE_PX = 24;
const ball = (rect) => rect && ({
    left: rect.left + (rect.width - Math.min(rect.width, SPHERE_PX)) / 2,
    top: rect.top + (rect.height - Math.min(rect.height, SPHERE_PX)) / 2,
    width: Math.min(rect.width, SPHERE_PX),
    height: Math.min(rect.height, SPHERE_PX)
});

function pulse(selector, delay = 0, cls = 'pulse') {
    const el = document.querySelector(selector);
    if (!el) return;
    setTimeout(() => {
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 900);
    }, delay);
}

// 帯に1行足す（古いものから消える）
function tick(html, delay) {
    const timer = setTimeout(() => {
        const ticker = document.querySelector('#ticker');
        if (!ticker) return;
        const item = document.createElement('span');
        item.className = 'tick';
        item.innerHTML = html;
        ticker.appendChild(item);
        while (ticker.children.length > MAX_TICKS) ticker.firstElementChild.remove();
        const life = setTimeout(() => item.remove(), TICK_LIFE_MS);
        tickerTimers.push(life);
    }, delay);
    tickerTimers.push(timer);
}

const EFFECT_LABEL = { convert: '変換' };

// 出来事を順に動かす。before：描く前の位置、you：画面の持ち主の席、names：席ごとの名前
export function playEvents(events, before, { you, names }) {
    if (events.length === 0 || events.length > MAX_EVENTS) return;
    const still = reducedMotion();
    const after = captureAnchors();
    const spot = (rects, seat, color) => (seat === you ? rects[`me:${color}`] : null) ?? rects[`player:${seat}`];
    let delay = 0;
    const move = (html, from, to, cls) => {
        if (!still) fly(html, from, to, { delay, cls });
        delay += STEP_MS;
    };

    events.forEach(event => {
        const seat = event.seat;
        switch (event.type) {
        case 'pick':
            move(sphere(event.color), ball(before[`row:${event.slot}`]), ball(spot(after, seat, event.color)), 'flyer-sphere');
            break;
        case 'draw':
            event.colors.forEach(color => move(sphere(color), ball(before.dispenser), ball(spot(after, seat, color)), 'flyer-sphere'));
            break;
        case 'build': {
            const card = CARDS[event.card];
            Object.entries(event.spend).forEach(([color, n]) => {
                for (let i = 0; i < n; i++) move(sphere(color), ball(spot(before, seat, color)), ball(after.dispenser), 'flyer-sphere');
            });
            const from = event.from.research ? before[`deck:${event.from.research}`] : before[`card:${event.card}`];
            const to = seat === you ? (after[`tile:${event.card}`] ?? after[`col:${card.type}`]) : after[`player:${seat}`];
            move(cardHtml(event.card), from, to, 'flyer-card');
            if (seat === you) pulse(`#me [data-tile="${event.card}"]`, delay + DURATION_MS - 100, 'landed');
            break;
        }
        case 'file': {
            const from = event.from.research ? before[`deck:${event.from.research}`] : before[`card:${event.card}`];
            const to = seat === you ? (after[`card:${event.card}`] ?? after['me:archive']) : after[`player:${seat}`];
            move(cardHtml(event.card), from, to, 'flyer-card');
            break;
        }
        case 'research':
            pulse(`#screen-game [data-deck="${event.level}"]`, delay);
            if (seat !== you) move(cardBackHtml(event.level), before[`deck:${event.level}`], after[`player:${seat}`], 'flyer-card');
            break;
        case 'refill':
            pulse(`#screen-game [data-slot="${event.level}-${event.slot}"] .card`, delay + 200);
            break;
        case 'vp':
            pulse(seat === you ? '#screen-game [data-me-vp]' : `#screen-game [data-player="${seat}"]`, delay + 200);
            break;
        case 'activate': {
            // 連鎖：働いたギズモを、順に帯に流し、自分の札を光らせる
            delay += CHAIN_STEP_MS / 2;
            const card = CARDS[event.gizmo];
            const who = seat === you ? '' : `<b class="who">${escapeHtml(names[seat])}</b>`;
            const label = EFFECT_LABEL[event.effect] ?? effectText(card);
            tick(`${who}${tileHtml(event.gizmo, { cls: 'flat' })}<span>${label}</span>`, delay);
            if (seat === you) pulse(`#me [data-tile="${event.gizmo}"]`, delay, 'fire');
            else pulse(`#screen-game [data-player="${seat}"]`, delay, 'fire');
            delay += CHAIN_STEP_MS / 2;
            break;
        }
        case 'finalRound':
            tick(`${icon('vp')}<span>最後の巡です</span>`, delay);
            break;
        default:
            break;
        }
    });
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
