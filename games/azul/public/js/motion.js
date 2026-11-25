/**
 * 何が起きたかを動きで見せる（タイルが取った場所から置いた場所へ飛ぶ）
 * 描画の前に元の位置を測り、描画のあとで行き先を測って、複製を飛ばす
 */

const DURATION = 420;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const rectOf = el => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
};

// 描画の前：取ったタイルと、工房の残り（中央へ移る）の位置を測る
export function measureBefore(move) {
    if (!move || reduced()) return null;
    const src = String(move.source);
    const taken = [];
    const rest = [];
    if (move.source === 'center') {
        const group = document.querySelector(`#center .center-group[data-color="${move.color}"]`);
        if (group) for (let i = 0; i < move.count; i++) taken.push({ color: move.color, rect: rectOf(group) });
        const first = document.querySelector('#center .center-first');
        if (move.tookFirst && first) taken.push({ color: 'first', rect: rectOf(first) });
    } else {
        document.querySelectorAll(`#factories .factory[data-src="${src}"] .ftile`).forEach(el => {
            const color = Number(el.dataset.color);
            (color === move.color ? taken : rest).push({ color, rect: rectOf(el) });
        });
    }
    return { taken, rest };
}

// 描画のあと：行き先を決めて飛ばす
export function playMove(move, before, viewerSeat) {
    if (!before) return;
    const flights = [];
    const fallback = viewerSeat === move.seat
        ? document.querySelector('#my-board .board')
        : document.querySelector(`#opponents .opp[data-seat="${move.seat}"]`);
    if (!fallback) return;

    if (viewerSeat === move.seat) {
        const lineSlots = move.line === 'floor' ? [] : [...document.querySelectorAll(`#my-board .line[data-line="${move.line}"] .slot.filled`)];
        const floorSlots = [...document.querySelectorAll('#my-board .floor .slot.filled')];
        // 先手マーカーは床の左端、あふれたタイルは床の後ろの方に入る
        const placedTargets = lineSlots.slice(-move.placed);
        const floorTargets = floorSlots.slice(-(move.overflow + (move.tookFirst ? 1 : 0)));
        let tileIndex = 0;
        let floorIndex = move.tookFirst ? 1 : 0;
        for (const item of before.taken) {
            let target;
            if (item.color === 'first') {
                target = floorTargets[0];
            } else if (tileIndex < move.placed) {
                target = placedTargets[tileIndex++];
            } else {
                target = floorTargets[floorIndex++];
            }
            flights.push({ ...item, to: target ?? fallback, hide: target });
        }
    } else {
        for (const item of before.taken) flights.push({ ...item, to: fallback, shrink: true });
    }
    for (const item of before.rest) {
        const group = document.querySelector(`#center .center-group[data-color="${item.color}"]`);
        flights.push({ ...item, to: group ?? document.querySelector('#center'), hide: group });
    }
    flights.forEach((flight, i) => fly(flight, i * 35));
}

function fly({ color, rect, to, hide, shrink }, delay) {
    const end = rectOf(to);
    const size = shrink ? Math.min(rect.w, 18) : end.w > 0 && end.w < rect.w * 2.5 ? end.w : rect.w;
    const endX = end.x + end.w / 2 - size / 2;
    const endY = end.y + end.h / 2 - size / 2;
    const clone = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    clone.setAttribute('class', 'tile flying');
    clone.innerHTML = `<use href="#tile-${color}"/>`;
    Object.assign(clone.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    document.body.appendChild(clone);
    if (hide) hide.style.visibility = 'hidden';
    const dx = endX - rect.x;
    const dy = endY - rect.y;
    const scale = size / rect.w;
    const lift = Math.min(60, 12 + Math.hypot(dx, dy) * 0.12);
    const animation = clone.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(${(1 + scale) / 2 + 0.08})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: shrink ? 0.2 : 1 }
    ], { duration: DURATION, delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'backwards' });
    const done = () => {
        clone.remove();
        if (hide) hide.style.visibility = '';
    };
    animation.onfinish = done;
    animation.oncancel = done;
    // 裏のタブなどで終わらなかったときも、必ず消す
    setTimeout(done, DURATION + delay + 400);
}
