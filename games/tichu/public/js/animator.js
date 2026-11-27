/**
 * 札の動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が新しい出来事を動かす
 * - 出した札：手札（ほかの人は席）から場の中央へ飛ぶ
 * - 場を取る：中央の札が、取った（竜は渡された）人の席へ飛ぶ
 * - 配る・もらった札：手札を順に出す。宣言は弾ませる
 * 動きは部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';

const PLAY_MS = 360;
const COLLECT_MS = 420;

const $ = selector => document.querySelector(selector);
const seatEl = seat => $(`#seat-${seat}`);

// カードの大きさは --cw（px）で決まるので、位置と一緒に覚える
function info(el) {
    const rect = Motion.rectOf(el);
    return rect ? { rect, el: el.cloneNode(true) } : null;
}

// 描き直す前に測る（動かさない設定なら測らない）
export function measure(view) {
    if (!Motion.enabled() || !view) return null;
    const hand = new Map();
    document.querySelectorAll('#hand .hand-card').forEach(el => {
        const found = info(el.querySelector('.card'));
        if (found) hand.set(Number(el.dataset.card), found);
    });
    const seats = new Map();
    [0, 1, 2, 3].forEach(s => {
        const rect = Motion.rectOf(seatEl(s));
        if (rect) seats.set(s, rect);
    });
    const center = [...document.querySelectorAll('#center .trick-cards .card')].map(info).filter(Boolean);
    return { hand, seats, center };
}

// 描いたあとで動かす（fresh：今回の新しい出来事）
export function animate(before, prev, view, fresh) {
    if (!Motion.enabled()) return;
    if (!prev) {
        dealHand();
        return;
    }
    if (!before) return;
    for (const e of fresh) {
        if (e.type === 'deal') dealHand();
        else if (e.type === 'exchange') {
            document.querySelectorAll('#hand .hand-card.received .card').forEach((el, i) => Motion.popIn(el, { duration: 300, delay: i * 80 }));
        } else if (e.type === 'play') {
            flyPlay(before, view, e);
        } else if (e.type === 'trick') {
            // 取った人（竜は渡された人）の席へ、中央の札が飛ぶ
            const to = seatEl(e.to ?? e.seat);
            before.center.forEach((c, i) => {
                if (to) Motion.fly(c.rect, to, { content: c.el, duration: COLLECT_MS, delay: 100 + i * 40, lift: false });
            });
        } else if (e.type === 'call') {
            Motion.popIn(seatEl(e.seat)?.querySelector('.call'), { duration: 300 });
        }
    }
    if (fresh.some(e => e.type === 'roundEnd')) document.querySelectorAll('#scoreboard b').forEach(el => Motion.pulse(el, { duration: 400 }));
}

function dealHand() {
    document.querySelectorAll('#hand .hand-card .card').forEach((el, i) => Motion.popIn(el, { duration: 260, delay: i * 35 }));
}

// 場に見えている中央の札へ、出した札を飛ばす（同じ更新に何手も入ったときは、最後の手だけが中央に残る）
function flyPlay(before, view, e) {
    const top = view.table.at(-1);
    if (!top || top.seat !== e.seat) return;
    const targets = [...document.querySelectorAll('#center .trick-cards .card')];
    targets.forEach((to, i) => {
        const card = top.combo.cards[i];
        const mine = before.hand.get(card);
        const delay = i * 50;
        if (mine) {
            Motion.fly(mine.rect, to, { content: mine.el, hide: to, duration: PLAY_MS, delay });
        } else {
            const seat = before.seats.get(e.seat);
            const rect = Motion.rectOf(to);
            if (seat && rect) Motion.fly(seat, to, { content: to, hide: to, size: { width: rect.width, height: rect.height }, duration: PLAY_MS, delay });
        }
    });
}
