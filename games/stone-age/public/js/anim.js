/**
 * 描き直しの前後の差を動かす（共通の部品 packages/motion の道具を、このゲームの画面に当てる）
 *
 *   const before = snapshot(root, '[data-key]');     // 描き直す前に、目印ごとの値（既定は文字）と位置を測る
 *   render();
 *   animateDiff(before, root, '[data-key]', {        // 描き直したあと
 *       enter: (el, key) => Motion.popIn(el),        // 新しく出たもの（既定ははねて出す）
 *       change: (el, key, old) => Motion.pulse(el)   // 値が変わったもの（既定は目立たせる）
 *   });
 *
 * before が null（対戦の初め・前の画面がない）なら何もしない。動きが「なし」なら何もしない
 */

import * as Motion from './motion/motion.js';

const defaultKey = (el) => el.dataset.key ?? null;
const defaultValue = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// 目印ごとの値と位置（描き直す前に測る）
export function snapshot(root, selector, { key = defaultKey, value = defaultValue } = {}) {
    const map = new Map();
    if (!root) return map;
    for (const el of root.querySelectorAll(selector)) {
        const k = key(el);
        if (k !== null && k !== undefined && !map.has(k)) map.set(k, { value: value(el), rect: Motion.rectOf(el) });
    }
    return map;
}

// 前の値と比べて、新しく出たものと値が変わったものを動かす。動かした数を返す
export function animateDiff(before, root, selector, {
    key = defaultKey,
    value = defaultValue,
    enter = (el) => Motion.popIn(el, { duration: 320 }),
    change = (el) => Motion.pulse(el, { duration: 380, scale: 1.2 })
} = {}) {
    if (!before || !root || !Motion.enabled()) return 0;
    let count = 0;
    const seen = new Set();
    for (const el of root.querySelectorAll(selector)) {
        const k = key(el);
        if (k === null || k === undefined || seen.has(k)) continue;
        seen.add(k);
        const old = before.get(k);
        if (!old) {
            if (enter) { enter(el, k); count++; }
        } else if (change && old.value !== value(el)) {
            change(el, k, old);
            count++;
        }
    }
    return count;
}

// 新しく出た駒・カードを、出どころ（要素か位置）から飛ばす（出どころがなければ、はねて出す）
// 複製は body の下に置くので、親の CSS で決まる色・字の大きさを写して、見た目をそろえる
export function flyIn(el, from, { duration = 420, delay = 0 } = {}) {
    if (!el) return;
    const rect = from instanceof Element ? Motion.rectOf(from) : from;
    const size = Motion.rectOf(el);
    if (!rect || !size) {
        Motion.popIn(el, { duration: 320, delay });
        return;
    }
    const css = getComputedStyle(el);
    Motion.fly(rect, el, {
        content: el, hide: el, size, duration, delay,
        style: { color: css.color, fontSize: css.fontSize, lineHeight: css.lineHeight, fill: css.fill }
    });
}
