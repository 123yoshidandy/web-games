/**
 * 出来事の動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が新しい出来事を動かす
 * - コイン：増えた人のコインへ、減った人（銀行は場の中央）から飛ばす。払ったコインは場へ飛ぶ
 * - 影響力を失う：失った札を裏返して見せる
 * - 行動の名乗り：場の行動をはねて出す。交換の札は順に出す
 * 動きは部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';
import { coinHtml } from './art.js';
import { ACTIONS } from './roles.js';

const COIN_MS = 420;

const $ = selector => document.querySelector(selector);
const coinEl = seat => $(`[data-coins="${seat}"]`);

// 描き直す前に測る（動かさない設定なら測らない）
export function measure(view) {
    if (!Motion.enabled() || !view) return null;
    const coins = new Map();
    view.players.forEach(p => {
        const rect = Motion.rectOf(coinEl(p.id)?.firstElementChild ?? coinEl(p.id));
        if (rect) coins.set(p.id, rect);
    });
    return { coins, stage: Motion.rectOf($('#stage')) };
}

// 描いたあとで動かす（fresh：今回の新しい出来事）
export function animate(before, view, fresh) {
    if (!Motion.enabled() || !before) return;
    let index = 0;
    const bank = () => {
        const s = before.stage;
        return s ? { left: s.left + s.width / 2 - 12, top: s.top + s.height / 2 - 12, width: 24, height: 24 } : null;
    };
    const pulsed = new Set();
    const flyCoin = (from, toSeat, amount) => {
        const to = coinEl(toSeat)?.firstElementChild;
        if (!from || !to) return;
        Motion.fly(from, to, { content: coinHtml(amount), size: { width: 26, height: 26 }, duration: COIN_MS, delay: index++ * 90, style: { fontSize: '12px' } });
        if (!pulsed.has(toSeat)) {
            pulsed.add(toSeat);
            Motion.pulse(to, { duration: 300, delay: COIN_MS });
        }
    };
    for (const e of fresh) {
        if (e.type === 'coins' && e.amount > 0) {
            flyCoin(e.from === null ? bank() : before.coins.get(e.from), e.to, e.amount);
        } else if (e.type === 'action' && ACTIONS[e.action].cost) {
            // 払ったコインは場へ飛ぶ
            const target = $('#stage .st-action');
            const from = before.coins.get(e.seat);
            if (from && target) Motion.fly(from, target, { content: coinHtml(ACTIONS[e.action].cost), size: { width: 26, height: 26 }, duration: COIN_MS, delay: index++ * 90, style: { fontSize: '12px' } });
        } else if (e.type === 'lose') {
            const mine = e.seat === view.you;
            const cards = document.querySelectorAll(mine ? '#me .card.lost' : `#opponents [data-player="${e.seat}"] .card.lost`);
            Motion.flipCard(cards[cards.length - 1], { duration: 420, delay: index++ * 90 });
        }
    }
    if (fresh.some(e => e.type === 'action' || e.type === 'block')) Motion.popIn($('#stage .st-action'), { duration: 260 });
}

// 交換の札（開いたとき）を順に出す
export function dealExchange() {
    document.querySelectorAll('#exchange-cards .card').forEach((el, i) => Motion.popIn(el, { duration: 280, delay: i * 70 }));
}
