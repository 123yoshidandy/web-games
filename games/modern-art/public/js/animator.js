/**
 * カードの動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が、新しいできごと（view.events）に合わせて動かす
 * - 出す：手札（ほかの人は名前の欄）から競りの場へ飛ぶ
 * - 競りが決まる：場のカードが、買った人の欄へ飛び、払った人・もらった人の金が弾む
 * - 配る：回の初めの手札は、順に弾んで現れる。手札を出したあとは詰める
 * 動きはすべて部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';
import { CARDS } from './cards.js';

const PLAY_MS = 380;      // 出したカードが場へ飛ぶ
const PLAY_STAGGER_MS = 120;
const TAKE_MS = 420;      // 買った人へ飛ぶ
const HAND_MS = 220;      // 手札の隙間を詰める

const $ = selector => document.querySelector(selector);
const playerEl = seat => document.querySelectorAll('#players .pl')[seat];

// 描き直す前に測る（動かさない設定なら測らない）
export function measure() {
    if (!Motion.enabled()) return null;
    return {
        hand: Motion.captureRects($('#hand'), '.card[data-card]', 'card'),
        lot: [...document.querySelectorAll('#stage .lot:not(.past) .card[data-card]')].map(el => ({ card: el.dataset.card, rect: Motion.rectOf(el) })),
        players: [...document.querySelectorAll('#players .pl')].map(el => Motion.rectOf(el))
    };
}

// 描いたあとで動かす。fresh：まだ動かしていないできごと
export function animate(before, view, fresh) {
    if (!Motion.enabled() || !before) return;
    let index = 0;
    for (const event of fresh) {
        if (event.type === 'play') play(before, view, event, index++);
        else if (event.type === 'sold') sold(before, view, event);
        else if (event.type === 'round') Motion.pulse($('#status .round'));
    }
    Motion.flipFrom(before.hand, $('#hand'), '.card[data-card]', 'card', { duration: HAND_MS, enter: 'pop' });
}

function play(before, view, event, index) {
    const to = $(`#stage .lot .card[data-card="${event.card}"]`);
    if (!to) return;
    const mine = before.hand.get(String(event.card));
    const from = event.seat === view.you ? mine : before.players[event.seat];
    if (!from) return;
    Motion.fly(from, to, { content: to, hide: to, duration: PLAY_MS, delay: index * PLAY_STAGGER_MS, size: Motion.rectOf(to) });
}

// 競りが決まった：場のカードが、買った人の欄へ飛ぶ。払った金・もらった金と、画家の枚数を弾ませる
function sold(before, view, event) {
    const target = playerEl(event.taker)?.querySelector('.pl-won') ?? playerEl(event.taker);
    const past = [...document.querySelectorAll('#stage .lot.past .card[data-card]')];
    before.lot.forEach(({ card, rect }, i) => {
        const to = past.find(el => el.dataset.card === card);
        if (!rect || !target) return;
        Motion.fly(rect, target, { content: to ?? undefined, hide: to, duration: TAKE_MS, delay: i * 60, size: { width: rect.width, height: rect.height } });
    });
    const money = seat => Motion.pulse(playerEl(seat)?.querySelector('.pl-money'), { delay: TAKE_MS });
    if (event.price > 0) {
        money(event.taker);
        if (!event.toBank && event.seller >= 0) money(event.seller);
    }
    Motion.pulse(target, { delay: TAKE_MS, scale: 1.06 });
    const artists = new Set((event.cards ?? []).map(card => CARDS[card].artist));
    artists.forEach(a => Motion.pulse(document.querySelectorAll('#market .artist')[a]?.querySelector('.pips'), { delay: TAKE_MS }));
}
