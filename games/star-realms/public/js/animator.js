/**
 * カードの動き（js/motion/motion.js を使う）
 * 描き直す前に measure() でカードの位置を測り、描いたあとで animate() が、前の置き場所から今の置き場所へ動かす
 * - 出す・基地を置く：手札（相手は手札の数）から、自分の場へ飛ぶ
 * - 獲得：交易の列から、獲得した人の捨て札へ飛ぶ
 * - 手番の終わり：場の艦と手札が捨て札へ飛び、新しい手札は山札から順に飛んでくる。列の空きは弾んで埋まる
 * - 攻撃で壊れた基地：相手の捨て札へ。権威・交易・戦闘の数は変わったら弾ませる
 * 動きはすべて部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';

const MOVE_MS = 380;       // 出す・獲得・捨てる
const DRAW_MS = 360;       // 山札から手札へ
const STAGGER_MS = 50;
const MAX_FLIGHTS = 14;    // 一度に飛ばす枚数の上限（手番の終わりに多すぎないように）

const $ = selector => document.querySelector(selector);

// カードの置き場所と、そこで測る要素
const AREAS = [
    ['hand', '#hand'],
    ['mine', '#my-zone'],
    ['opp', '#opp-zone'],
    ['row', '#trade-row']
];

// 山札・捨て札・手札の数の欄（飛ぶ先・飛んでくる元）
const statsOf = (view, seat) => $(seat === view.you ? '#my-stats' : '#opp-stats');
const pileEl = (view, seat, kind) => {
    const stats = statsOf(view, seat);
    return kind === 'discard' ? stats?.querySelector('[data-pile]') : stats?.querySelector('.pile[title="山札"]');
};

// 描き直す前に測る（動かさない設定なら測らない）。複製できるよう、カードそのものも覚える
export function measure() {
    if (!Motion.enabled()) return null;
    const cards = new Map();
    for (const [area, selector] of AREAS) {
        document.querySelectorAll(`${selector} .card[data-id]`).forEach(el => {
            const rect = Motion.rectOf(el);
            if (rect && el.dataset.id !== 'explorer') cards.set(el.dataset.id, { area, rect, el: el.cloneNode(true) });
        });
    }
    return {
        cards,
        handPile: Motion.rectOf($('#opp-stats .pile')),
        authority: [...document.querySelectorAll('.stats .authority')].map(el => el.textContent),
        pool: [...document.querySelectorAll('.stats .pool b')].map(el => el.textContent)
    };
}

// 描いたあとで動かす。previous：前のビュー
export function animate(before, previous, view) {
    if (!Motion.enabled() || !before || !previous) return;
    const seen = new Set();
    let flights = 0;
    const fly = (from, to, options) => {
        if (flights >= MAX_FLIGHTS) return;
        flights++;
        Motion.fly(from, to, { duration: MOVE_MS, ...options });
    };

    // 今ある札：新しく現れたか、置き場所が変わったものを動かす
    let draw = 0;
    for (const [area, selector] of AREAS) {
        document.querySelectorAll(`${selector} .card[data-id]`).forEach(el => {
            const id = el.dataset.id;
            if (id === 'explorer') return;
            seen.add(id);
            const old = before.cards.get(id);
            const size = Motion.rectOf(el);
            if (!size) return;
            if (old?.area === area) return;
            if (old) {
                // 手札から場へ、列から場へ
                fly(old.rect, el, { content: el, hide: el, size });
            } else if (area === 'hand') {
                // 山札から引く
                fly(pileEl(view, view.you, 'deck'), el, { content: el, hide: el, size, duration: DRAW_MS, delay: 180 + draw++ * STAGGER_MS });
            } else if (area === 'row') {
                Motion.popIn(el, { delay: MOVE_MS * 0.6 });
            } else {
                // 相手が出した：手札の欄から
                fly(area === 'opp' ? before.handPile : null, el, { content: el, hide: el, size });
            }
        });
    }

    // 消えた札：獲得は買った人の捨て札へ、壊れた基地・手番の終わりの札は持ち主の捨て札へ（廃棄は動かさない）
    const scrapped = new Set(view.events.filter(e => e.type === 'scrap' || e.type === 'scrapCards')
        .flatMap(e => (e.cards ?? [e.card]).map(String)));
    const fresh = new Set(view.events.slice(-12).map(e => e.seq));
    const bought = new Map(view.events.filter(e => e.type === 'buy' && fresh.has(e.seq)).map(e => [String(e.card), e.seat]));
    let leave = 0;
    for (const [id, old] of before.cards) {
        if (seen.has(id) || scrapped.has(id)) continue;
        const owner = bought.get(id) ?? (old.area === 'opp' ? 1 - view.you : view.you);
        const to = pileEl(view, owner, 'discard');
        if (to) fly(old.rect, to, { content: old.el, delay: leave++ * 30 });
    }

    // 権威・交易・戦闘が変わったら弾ませる
    document.querySelectorAll('.stats .authority').forEach((el, i) => {
        if (before.authority[i] !== undefined && before.authority[i] !== el.textContent) Motion.pulse(el, { delay: MOVE_MS * 0.6 });
    });
    document.querySelectorAll('.stats .pool b').forEach((el, i) => {
        if (before.pool[i] !== undefined && before.pool[i] !== el.textContent) Motion.pulse(el, { duration: 240 });
    });
}
