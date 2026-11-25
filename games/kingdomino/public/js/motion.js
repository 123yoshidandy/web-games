/**
 * 何が起きたかを動きで見せる
 *   選ぶ：王様の駒が、元の場所から選んだドミノへ動く
 *   置く：ドミノの2マスが、並びから王国の置いた場所へ飛ぶ（相手なら、相手の小さな王国へ）
 * 描画の前に元の位置を測り、描画のあとで行き先を測って動かす
 */

import { dominoCells } from './game.js';

const DURATION = 450;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rectOf = el => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
};

// 描画の前：王様の駒の位置と、置くドミノのマスの位置
export function measureBefore(move) {
    if (!move || reduced()) return null;
    const kings = {};
    document.querySelectorAll('#lines .king').forEach(el => { kings[el.dataset.king] = rectOf(el); });
    let halves = null;
    if (move.type === 'place') {
        const card = document.querySelector(`#lines .card[data-line="current"][data-index="${move.index}"]`);
        if (card) halves = [...card.querySelectorAll('.domino .tile')].map(rectOf);
    }
    return { kings, halves };
}

export function playAfter(move, before, viewer) {
    if (!move || !before) return;
    if (move.type === 'pick') {
        const el = document.querySelector(`#lines .king[data-king="${move.king}"]`);
        const from = before.kings[move.king];
        if (el && from) {
            const to = rectOf(el);
            el.animate([
                { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` },
                { transform: `translate(${(from.x - to.x) / 2}px, ${(from.y - to.y) / 2 - 18}px) scale(1.2)`, offset: 0.5 },
                { transform: 'translate(0, 0)' }
            ], { duration: DURATION, easing: 'cubic-bezier(.4,.1,.3,1)' });
        } else if (el) {
            el.animate([{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
        }
        return;
    }
    if (move.type === 'place' && before.halves) {
        const root = move.seat === viewer ? '#kingdom' : `#opponents .opp[data-seat="${move.seat}"]`;
        const cells = dominoCells(move.x, move.y, move.dir);
        // 並びの絵は左が1つ目のマス
        cells.forEach(([x, y], i) => {
            const target = document.querySelector(`${root} .cell[data-x="${x}"][data-y="${y}"]`);
            const from = before.halves[i];
            if (target && from) fly(target, from, i * 40);
        });
    }
}

// 行き先の要素を、元の位置から動かして見せる（複製を飛ばし、着くまで行き先は隠す）
function fly(target, from, delay) {
    const to = rectOf(target);
    const clone = target.cloneNode(true);
    clone.classList.add('flying');
    Object.assign(clone.style, { left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${to.h}px` });
    document.body.appendChild(clone);
    target.style.visibility = 'hidden';
    const sx = from.w / to.w;
    const dx = from.x + from.w / 2 - (to.x + to.w / 2);
    const dy = from.y + from.h / 2 - (to.y + to.h / 2);
    const animation = clone.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx})` },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 30}px) scale(${(sx + 1) / 2 + 0.1})`, offset: 0.5 },
        { transform: 'translate(0, 0) scale(1)' }
    ], { duration: DURATION, delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'backwards' });
    const done = () => {
        clone.remove();
        target.style.visibility = '';
    };
    animation.onfinish = done;
    animation.oncancel = done;
    setTimeout(done, DURATION + delay + 400);
}
