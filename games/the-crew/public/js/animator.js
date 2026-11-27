/**
 * カードの動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が前の位置から動かす
 * - 出したカード：手札（CPU は席）からトリックの場所へ飛ぶ
 * - トリックが揃ったら：少し見せてから、まとめて取った人の席へ飛ぶ（場には薄く残す）
 * - 課題：選んだ（配られた・渡された）課題が、受け持つ人の席へ飛ぶ
 * - 配る：新しいミッションの手札を順に出す。通信したカードは、はねて出す
 * 動きはすべて部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';

const PLAY_MS = 380;          // 出したカードが場へ飛ぶ
const PLAY_STAGGER_MS = 120;  // 一度に何枚も出たとき（オンライン対戦）のずれ
const SHOW_TRICK_MS = 650;    // 揃ったトリックを見せる間
const COLLECT_MS = 420;       // 取った人へ集まる
const TASK_MS = 420;          // 課題が受け持つ人へ飛ぶ
const HAND_MS = 220;          // 手札の隙間を詰める

const $ = selector => document.querySelector(selector);

// 前のトリックを見分ける印（同じミッションの中では重ならない）
export const trickKey = trick => (trick ? trick.plays.map(p => p.card).join(',') : '');

// カードの大きさは文字の大きさ（em）で決まるので、位置と一緒に文字の大きさも覚える
function info(el) {
    const rect = Motion.rectOf(el);
    return rect ? { rect, font: getComputedStyle(el).fontSize } : null;
}

function infoMap(root, selector, key) {
    const map = new Map();
    root?.querySelectorAll(selector).forEach(el => {
        const found = info(el);
        if (found) map.set(el.dataset[key], found);
    });
    return map;
}

// 複製を飛ばす。複製は body の下に置かれるので、元の文字の大きさを付ける（カードの中身が崩れない）
const flyCard = (from, to, options, font) => Motion.fly(from, to, font ? { ...options, style: { fontSize: font } } : options);

function seatEl(view, seat) {
    return seat === view.viewer ? $('#me .me-head') : $(`#others .seat[data-seat="${seat}"]`);
}

// 描き直す前に測る（動かさない設定なら測らない）
export function measure(view) {
    if (!Motion.enabled() || !view) return null;
    const cards = new Map([...infoMap($('#others'), '.jarvis-cards .card[data-card]', 'card'), ...infoMap($('#me'), '.hand .card[data-card]', 'card')]);
    const seats = new Map();
    view.players.forEach(p => {
        const rect = Motion.rectOf(seatEl(view, p.seat));
        if (rect) seats.set(p.seat, rect);
    });
    return {
        cards,
        seats,
        hand: Motion.captureRects($('#me .hand'), '.card[data-card]', 'card'),
        tableTasks: infoMap($('#table'), '.task[data-task]', 'task'),
        seatTasks: new Map([...infoMap($('#others'), '.task[data-task]', 'task'), ...infoMap($('#me'), '.task[data-task]', 'task')])
    };
}

// 描いたあとで動かす。state.collected に、取った人へ集めたトリックの印を入れる（場で薄く描く）
export function animate(before, previous, view, state) {
    if (!Motion.enabled()) return;
    if (!previous) {
        // 新しいミッション：手札を順に配る
        if (view.commandCount === 0) dealHand();
        return;
    }
    if (!before || previous.commandCount === view.commandCount) return;
    Motion.flipFrom(before.hand, $('#me .hand'), '.card[data-card]', 'card', { duration: HAND_MS, enter: null });
    animateTasks(before, previous, view);
    animateComms(previous, view);
    animateTrick(before, previous, view, state);
}

function dealHand() {
    document.querySelectorAll('#me .hand .card').forEach((el, i) => Motion.popIn(el, { duration: 260, delay: i * 35 }));
}

function animateTasks(before, previous, view) {
    let index = 0;
    view.tasks.forEach(task => {
        const old = previous.tasks[task.index];
        if (task.owner === null || !old || old.owner === task.owner) return;
        const from = old.owner === null ? before.tableTasks.get(String(task.index)) : before.seatTasks.get(String(task.index));
        const to = seatEl(view, task.owner)?.querySelector(`.task[data-task="${task.index}"]`);
        if (!from || !to) return;
        flyCard(from.rect, to, { content: to, hide: to, duration: TASK_MS, delay: index++ * 60 }, from.font);
    });
}

function animateComms(previous, view) {
    view.comms.forEach((comm, seat) => {
        if (!comm || previous.comms[seat]) return;
        Motion.popIn(seatEl(view, seat)?.querySelector('.seat-comm .comm'), { duration: 300 });
    });
}

function animateTrick(before, previous, view, state) {
    const finished = view.lastTrick && view.lastTrick.number !== previous.lastTrick?.number;
    // 場に見えているトリック（揃った直後は前のトリック）。ゲームが終わったときは、最後のトリックがそのまま場に残る
    const shown = view.trick.plays.length === 0 && view.lastTrick ? view.lastTrick : view.trick;
    if (shown === view.lastTrick && !finished) return;
    const old = new Set(previous.trick.plays.map(p => p.card));
    const added = shown.plays.filter(p => !old.has(p.card));
    const flights = added.map((play, i) => {
        const to = $(`#table .trick-slot .card[data-card="${play.card}"]`);
        const toRect = Motion.rectOf(to);
        if (!to || !toRect) return Promise.resolve();
        const fromCard = before.cards.get(play.card);
        // CPU の席から出すときは、場のカードより少し小さく出す
        const from = fromCard?.rect ?? before.seats.get(play.seat);
        const size = fromCard ? null : { width: toRect.width * 0.7, height: toRect.height * 0.7 };
        const font = fromCard?.font ?? `${parseFloat(getComputedStyle(to).fontSize) * 0.7}px`;
        return flyCard(from, to, { content: to, hide: to, size, duration: PLAY_MS, delay: i * PLAY_STAGGER_MS }, font);
    });
    if (!finished || shown !== view.lastTrick) return;
    collectTrick(view, flights, added.length, state);
}

// 揃ったトリックを少し見せてから、取った人の「取」の数へまとめて飛ばす
function collectTrick(view, flights, count, state) {
    const key = trickKey(view.lastTrick);
    const winner = view.lastTrick.winner;
    const wait = base => new Promise(resolve => setTimeout(resolve, Motion.ms(base)));
    const run = (async () => {
        await Promise.all(flights);
        await wait(SHOW_TRICK_MS);
        // 待つ間に別のミッションへ移ったり、次のトリックが始まったりしたら集めない
        const cards = [...document.querySelectorAll('#table .trick.past .trick-slot .card[data-card]')];
        if (!Motion.enabled() || state.key !== key || !cards.length) return;
        const target = seatEl(view, winner)?.querySelector('.seat-name .stats') ?? seatEl(view, winner);
        state.collected = key;
        await Promise.all(cards.map((el, i) => {
            el.classList.add('collected');
            return flyCard(el, target, { content: el, hide: el, duration: COLLECT_MS, delay: i * 40 }, getComputedStyle(el).fontSize);
        }));
        Motion.pulse(seatEl(view, winner)?.querySelector('.seat-name .stats'), { duration: 280 });
    })();
    state.key = key;
    // 待つ間も含めて、まとめて数える（CPU の次のリードは、集め終わってから）
    const longest = Motion.ms(PLAY_MS + count * PLAY_STAGGER_MS + SHOW_TRICK_MS + COLLECT_MS + 40 * 5);
    Motion.track(run, longest);
}
