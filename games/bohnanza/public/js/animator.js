/**
 * カードの動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が、新しいできごと（view.events）に合わせて動かす
 * - 植える：手札（もらった豆）から畑へ。ほかの人は名前の欄から、その人の畑の印へ
 * - 売る：畑が金の欄へ飛び、金が弾む
 * - 表をめくる：山から表のカードへ。手札に引くときは山から手札へ
 * - 取引：もらった豆が「植える」の欄に弾んで現れる
 * 動きはすべて部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';

const PLANT_MS = 380;   // 植える
const SELL_MS = 420;    // 畑を金へ
const DRAW_MS = 400;    // 山から表・手札へ
const DRAW_STAGGER_MS = 90;

const $ = selector => document.querySelector(selector);

// 描き直す前に測る（動かさない設定なら測らない）
export function measure() {
    if (!Motion.enabled()) return null;
    const rects = selector => [...document.querySelectorAll(selector)].map(el => Motion.rectOf(el));
    const bySeat = new Map();
    document.querySelectorAll('#players .pl[data-seat]').forEach(el => bySeat.set(Number(el.dataset.seat), Motion.rectOf(el)));
    return {
        hand: rects('#hand .hcard'),
        toPlant: rects('#toplant .bean'),
        fields: rects('#fields .field[data-field]'),
        seats: bySeat,
        deck: Motion.rectOf($('#table .deck'))
    };
}

// 描いたあとで動かす。previous：前のビュー、fresh：まだ動かしていないできごと
export function animate(before, previous, view, fresh) {
    if (!Motion.enabled() || !before || !previous) return;
    const me = view.you;
    const mine = previous.players[me];
    let drawn = 0;
    for (const event of fresh) {
        if (event.type === 'plant') plant(before, previous, view, event, mine);
        else if (event.type === 'sell') sell(before, view, event);
        else if (event.type === 'buyField') {
            if (event.seat === me) Motion.pulse($('#fields .mycoins'));
            else Motion.pulse(seatEl(event.seat)?.querySelector('.pl-fields'));
        } else if (event.type === 'faceUp') drawn++;
    }
    if (drawn) dealFaceUp(before, previous, view);
    drawToHand(before, previous, view);
    receiveTrade(previous, view);
}

const seatEl = seat => $(`#players .pl[data-seat="${seat}"]`);

function plant(before, previous, view, event, mine) {
    if (event.seat === view.you) {
        const to = $(`#fields .field[data-field="${event.field}"]`);
        let from = null;
        if (previous.phase === 'plant' && mine.hand.length) from = before.hand[0];
        else from = before.toPlant[Math.max(0, mine.toPlant.indexOf(event.bean))];
        if (to) {
            const rect = Motion.rectOf(to);
            Motion.fly(from ?? before.fields[event.field], to.querySelector('.field-art') ?? to, {
                content: to.querySelector('.field-art') ?? to, hide: to.querySelector('.field-art'), duration: PLANT_MS,
                size: rect ? { width: rect.width * 0.6, height: rect.height * 0.6 } : null
            });
            Motion.pulse(to.querySelector('.fcount'), { delay: PLANT_MS });
        }
        return;
    }
    const row = seatEl(event.seat);
    const chip = row?.querySelectorAll('.pl-fields .fchip')[event.field];
    if (chip) {
        Motion.fly(before.seats.get(event.seat), chip, { content: chip, hide: chip, duration: PLANT_MS });
        Motion.pulse(chip, { delay: PLANT_MS });
    }
}

function sell(before, view, event) {
    if (event.seat === view.you) {
        const coins = $('#fields .mycoins');
        // 売って空いた畑から金へ
        const emptied = [...document.querySelectorAll('#fields .field[data-field]')].findIndex((el, i) => before.fields[i] && el.querySelector('.empty-field'));
        const rect = before.fields[emptied];
        if (rect && coins) Motion.fly(rect, coins, { content: '<span class="fcount">' + event.n + '</span>', duration: SELL_MS, size: { width: 28, height: 28 }, style: { color: '#e9b949', fontWeight: '800', textAlign: 'center' } });
        Motion.pulse(coins, { delay: SELL_MS * 0.7 });
    } else {
        Motion.pulse(seatEl(event.seat)?.querySelector('.pl-fields'));
        Motion.pulse(seatEl(event.seat), { scale: 1.04 });
    }
}

// 表のカードが山からめくれる
function dealFaceUp(before, previous, view) {
    const faces = [...document.querySelectorAll('#table .faceup .face')];
    faces.forEach((el, i) => {
        if (!before.deck) return Motion.popIn(el, { delay: i * DRAW_STAGGER_MS });
        const rect = Motion.rectOf(el);
        Motion.fly(before.deck, el, { content: el, hide: el, duration: DRAW_MS, delay: i * DRAW_STAGGER_MS, size: rect });
    });
}

// 手札が増えたら（手番の終わりの3枚）、山から引いた分を飛ばす
function drawToHand(before, previous, view) {
    const old = previous.players[view.you].hand.length;
    const now = view.players[view.you].hand.length;
    const cards = [...document.querySelectorAll('#hand .hcard')];
    if (now <= old || !before.deck) return;
    cards.slice(old).forEach((el, i) => Motion.fly(before.deck, el, { content: el, hide: el, duration: DRAW_MS, delay: i * DRAW_STAGGER_MS, size: Motion.rectOf(el) }));
}

// 取引でもらった豆
function receiveTrade(previous, view) {
    const old = previous.players[view.you].toPlant.length;
    const now = view.players[view.you].toPlant.length;
    if (now <= old) return;
    [...document.querySelectorAll('#toplant .bean')].slice(old).forEach((el, i) => Motion.popIn(el, { delay: i * 60 }));
}

// 新しい対戦の最初の手札
export function dealHand() {
    if (!Motion.enabled()) return;
    document.querySelectorAll('#hand .hcard').forEach((el, i) => Motion.popIn(el, { duration: 260, delay: i * 50 }));
}
