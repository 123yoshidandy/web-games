/**
 * 牌の動き（js/motion/motion.js を使う）
 * 描き直す前に measure() で位置を測り、描いたあとで animate() が、新しいできごと（view.events）に合わせて動かす
 * - 打牌：手札（相手は名前の欄）から、その人の河の最後の牌へ飛ぶ。手札は詰める
 * - ツモ：自分のツモ牌が、牌山の欄から飛んでくる
 * - 鳴き：できた面子が弾んで現れる。点が変わったら弾ませる
 * - 配牌：局の初めに、手牌が順に現れる
 * 動きはすべて部品が数えるので、CPU（Motion.afterIdle）は動き終わってから打つ
 */

import * as Motion from './motion/motion.js';

const DISCARD_MS = 360;   // 打牌が河へ飛ぶ
const DRAW_MS = 320;      // ツモ牌が手へ飛ぶ
const HAND_MS = 200;      // 手牌の隙間を詰める

const $ = id => document.getElementById(id);
const panelEl = rel => (rel === 0 ? $('mine') : document.querySelector(`.panel[data-rel="${rel}"]`));
const relOf = (view, seat) => (seat - view.you + 4) % 4;

// 描き直す前に測る（動かさない設定なら測らない）
export function measure() {
    if (!Motion.enabled()) return null;
    return {
        hand: Motion.captureRects($('hand'), '.hand-tile', 'id'),
        panels: [0, 1, 2, 3].map(rel => Motion.rectOf(panelEl(rel))),
        wall: Motion.rectOf($('wall-count')),
        melds: [0, 1, 2, 3].map(rel => meldsOf(rel).length),
        scores: [0, 1, 2, 3].map(rel => scoreEl(rel)?.textContent)
    };
}

const meldsOf = rel => [...(rel === 0 ? $('hand') : panelEl(rel)).querySelectorAll('.meld')];
const scoreEl = rel => panelEl(rel)?.querySelector('.score');

// 描いたあとで動かす。fresh：まだ動かしていないできごと
export function animate(before, view, fresh) {
    if (!Motion.enabled() || !before) return;
    let index = 0;
    for (const event of fresh) {
        if (event.type === 'discard') discard(before, view, event, index++);
        else if (event.type === 'draw' && event.seat === view.you) draw(before);
        else if (event.type === 'start') dealHand();
    }
    Motion.flipFrom(before.hand, $('hand'), '.hand-tile', 'id', { duration: HAND_MS, enter: null });
    [0, 1, 2, 3].forEach(rel => {
        const melds = meldsOf(rel);
        if (melds.length > before.melds[rel]) Motion.popIn(melds.at(-1), { delay: DISCARD_MS * 0.5 });
        const score = scoreEl(rel);
        if (score && before.scores[rel] !== undefined && before.scores[rel] !== score.textContent) Motion.pulse(score, { delay: 150 });
    });
}

function discard(before, view, event, index) {
    const rel = relOf(view, event.seat);
    const tiles = document.querySelectorAll(`.pond[data-rel="${rel}"] .tile`);
    const to = tiles[tiles.length - 1];
    if (!to) return;
    const from = rel === 0 ? (before.hand.get(String(event.tile)) ?? before.panels[0]) : before.panels[rel];
    Motion.fly(from, to, { content: to, hide: to, duration: DISCARD_MS, delay: index * 60, size: Motion.rectOf(to) });
}

// ツモ牌は、牌山の欄から手へ
function draw(before) {
    const tile = document.querySelector('#hand .hand-tile.drawn');
    if (!tile || !before.wall) return;
    Motion.fly(before.wall, tile, { content: tile, hide: tile, duration: DRAW_MS, size: Motion.rectOf(tile) });
}

// 配牌：手牌が順に現れる
export function dealHand() {
    if (!Motion.enabled()) return;
    document.querySelectorAll('#hand .hand-tile').forEach((el, i) => Motion.popIn(el, { duration: 240, delay: i * 30 }));
}
