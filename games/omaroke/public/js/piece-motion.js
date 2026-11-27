/**
 * 盤の駒・数字の動き（描き直す前後の差から動かす）
 * 描く側が、動く部品に次の data 属性を付ける。
 *   data-mk：場所ごとの名前（描き直しても同じ部品は同じ名前になるもの）
 *   data-mv：数（省くと 1）
 *   data-mg：駒の種類。付いていれば「駒」で、ある場所で減って別の場所で増えたら、前の場所から飛ばす
 *            付いていなければ「値」で、新しく出たらはねて出し、数が変わったら目立たせる
 *   data-mr：駒の向き。'src' なら飛ばす元だけ（手札など）、'sink' なら行き先だけ（盤の上のタイルなど）。省くと両方
 * 使い方：描き直す前に measure(root)、描いたあとに animate(前の結果, root)。前の結果が null なら動かさない
 */

import * as Motion from './motion/motion.js';

const MAX_FLIGHTS = 8;
const FLIGHT_MS = 420;
const STAGGER_MS = 70;

// 動かす部品の位置・数・見た目（飛ばす複製の元）を測る
export function measure(root) {
    const map = new Map();
    if (!Motion.enabled() || !root) return map;
    root.querySelectorAll('[data-mk]').forEach(el => {
        const rect = Motion.rectOf(el);
        if (!rect) return;
        const grouped = el.dataset.mg !== undefined;
        map.set(el.dataset.mk, {
            el,
            rect,
            v: Number(el.dataset.mv ?? 1),
            g: el.dataset.mg ?? null,
            r: el.dataset.mr ?? null,
            html: grouped ? ghostOf(el) : null
        });
    });
    return map;
}

// SVG の部品は、その形のまま飛ばせるように、座標をそろえた svg に包む
function ghostOf(el) {
    if (!(el instanceof SVGElement)) return el.outerHTML;
    try {
        const box = el.getBBox();
        return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" overflow="visible" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">${el.outerHTML}</svg>`;
    } catch {
        return el.outerHTML;
    }
}

export function animate(before, root) {
    if (!before || !Motion.enabled() || !root) return;
    const after = measure(root);
    // 減った場所（駒の種類ごと）。飛ばす元になる
    const sources = new Map();
    for (const [key, old] of before) {
        if (old.g === null || old.r === 'sink') continue;
        const left = old.v - (after.get(key)?.v ?? 0);
        if (left > 0) {
            if (!sources.has(old.g)) sources.set(old.g, []);
            sources.get(old.g).push({ old, left });
        }
    }
    let flights = 0;
    for (const [key, now] of after) {
        const old = before.get(key);
        if (now.g === null) {
            if (!old) Motion.popIn(now.el, { duration: 300 });
            else if (old.v !== now.v) Motion.pulse(now.el, { duration: 360, scale: 1.2 });
            continue;
        }
        let gain = now.v - (old?.v ?? 0);
        if (gain <= 0) continue;
        // 飛ばす元だけの部品（手札）は、新しく出たらはねて出す
        if (now.r === 'src') {
            if (!old) Motion.popIn(now.el, { duration: 300 });
            continue;
        }
        for (const source of sources.get(now.g) ?? []) {
            if (gain <= 0 || flights >= MAX_FLIGHTS) break;
            if (source.left <= 0) continue;
            const moved = Math.min(source.left, gain);
            source.left -= moved;
            gain -= moved;
            Motion.fly(source.old.rect, now.el, { content: source.old.html, hide: now.el, duration: FLIGHT_MS, delay: flights * STAGGER_MS });
            flights++;
        }
        // 飛んでこなかった分（供給から置いた・数が変わっただけ）は、はねて出す・目立たせる
        if (gain > 0) {
            if (!old) Motion.popIn(now.el, { duration: 300 });
            else Motion.pulse(now.el, { duration: 360, scale: 1.2 });
        }
    }
}
