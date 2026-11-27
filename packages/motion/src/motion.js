/**
 * 駒やカードの動き（共通の部品）
 *
 * - 動きの速さ（普通・速い・なし）を端末ごとに保存し、すべての動きの長さに掛ける
 *   選んでいなければ、OS の「動きを減らす」（prefers-reduced-motion）のときは「なし」
 * - 動きの道具：fly（複製を飛ばす）・captureRects と flipFrom（FLIP：描き直す前後の位置の差を動かす）・fadeIn・flipCard・pulse
 * - 動いている間を数え、whenIdle で「動き終わってから」CPU を進められるようにする
 *
 * 画面のない環境（node のテスト）では何もせず、whenIdle はすぐに呼ぶ
 */

export const STORAGE_KEY = 'web-games.motion-speed';
export const SPEEDS = [
    { id: 'normal', label: '普通', scale: 1 },
    { id: 'fast', label: '速い', scale: 0.5 },
    { id: 'off', label: 'なし', scale: 0 }
];
const EASE = 'cubic-bezier(.45,.05,.4,1)';
const SLACK_MS = 400; // finished が来ないとき（裏のタブなど）に、待ちを打ち切るまでの余り
const MAX_WAIT_MS = 4000; // whenIdle が待つ最長

const hasDom = () => typeof window !== 'undefined' && typeof document !== 'undefined';
const storage = () => {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
};

// ===== 速さ =====

const listeners = new Set();
let memory = null; // 保存できないときだけ使う、この画面の間の選択

export function storedSpeed() {
    try {
        const id = storage()?.getItem(STORAGE_KEY);
        return SPEEDS.some(speed => speed.id === id) ? id : null;
    } catch {
        return null;
    }
}

export function prefersReducedMotion() {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// 今の速さの id。選んでいなければ、動きを減らす設定のとき 'off'、ほかは 'normal'
export function getSpeed() {
    return storedSpeed() ?? memory ?? (prefersReducedMotion() ? 'off' : 'normal');
}

export function setSpeed(id) {
    if (!SPEEDS.some(speed => speed.id === id)) return;
    try {
        storage().setItem(STORAGE_KEY, id);
        memory = null;
    } catch {
        memory = id; // 保存できない環境でも、この画面の間は効かせる
    }
    if (id === 'off') cancelAll();
    listeners.forEach(fn => fn(id));
}

// 動きの長さに掛ける倍率（0 なら動かさない）
export function speedScale() {
    return SPEEDS.find(speed => speed.id === getSpeed()).scale;
}

export const enabled = () => hasDom() && speedScale() > 0;

// 普通の速さでの長さ（ミリ秒）を、今の速さに合わせる
export const ms = (base) => Math.round(base * speedScale());

export function onSpeedChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// ===== 動いている間を数える =====

const pending = new Set();
const waiters = new Set();

// 動き（Animation か Promise）を、終わるまで数える。longest は finished が来ないときに打ち切るまでの長さ
export function track(animation, longest = 1000) {
    const promise = animation?.finished ?? animation;
    if (!promise || typeof promise.then !== 'function') return Promise.resolve();
    const entry = { animation };
    pending.add(entry);
    let timer;
    const done = new Promise(resolve => {
        const finish = () => {
            clearTimeout(timer);
            if (pending.delete(entry)) flushWaiters();
            resolve();
        };
        timer = setTimeout(finish, longest + SLACK_MS);
        promise.then(finish, finish);
    });
    return done;
}

// CSS のアニメーションなど、部品の外の動きを ms ミリ秒（今の速さに合わせる前の長さ）だけ数える
export function hold(base) {
    const length = ms(base);
    if (!enabled() || length <= 0) return Promise.resolve();
    return track(new Promise(resolve => setTimeout(resolve, length)), length);
}

export const isIdle = () => pending.size === 0;

// 動きが終わったら fn を呼ぶ（動いていなければすぐ呼ぶ）。返り値は、待つのをやめる関数
export function whenIdle(fn) {
    if (pending.size === 0) {
        fn();
        return () => {};
    }
    const waiter = { fn, timer: null };
    waiter.timer = setTimeout(() => runWaiter(waiter), MAX_WAIT_MS);
    waiters.add(waiter);
    return () => {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
    };
}

export const idle = () => new Promise(resolve => whenIdle(resolve));

// 動きが終わってから、さらに delay ミリ秒おいて fn を呼ぶ（CPU の手番に使う）。返り値は取り消す関数
export function afterIdle(fn, delay = 0) {
    let timer = null;
    const cancelWait = whenIdle(() => {
        timer = setTimeout(fn, delay);
    });
    return () => {
        cancelWait();
        clearTimeout(timer);
    };
}

function runWaiter(waiter) {
    if (!waiters.delete(waiter)) return;
    clearTimeout(waiter.timer);
    waiter.fn();
}

function flushWaiters() {
    if (pending.size > 0) return;
    [...waiters].forEach(runWaiter);
}

// 動いているものをすべて止める（速さを「なし」にしたとき・ゲームを抜けるとき）
export function cancelAll() {
    [...pending].forEach(entry => entry.animation?.cancel?.());
}

// ===== 位置 =====

export function rectOf(el) {
    const rect = el?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
}

// root の下の selector の要素の位置を、key（data-* の名前。'key' なら data-key）ごとに覚える
export function captureRects(root, selector, key = 'key') {
    const rects = new Map();
    if (!hasDom() || !root) return rects;
    root.querySelectorAll(selector).forEach(el => {
        const id = el.dataset[key];
        const rect = rectOf(el);
        if (id != null && rect) rects.set(id, rect);
    });
    return rects;
}

// ===== 動き =====

// FLIP：描き直したあと、前の位置（captureRects の結果）から今の位置へ動かす。新しく出た要素は enter（'fade' か 'pop'）で出す
export function flipFrom(before, root, selector, key = 'key', { duration = 260, stagger = 0, enter = 'fade', exclude = null } = {}) {
    if (!enabled() || !root) return [];
    const animations = [];
    let index = 0;
    root.querySelectorAll(selector).forEach(el => {
        const id = el.dataset[key];
        if (id == null || exclude?.(el)) return;
        const now = rectOf(el);
        const old = before.get(id);
        if (!now) return;
        const delay = ms(stagger * index);
        if (!old) {
            if (enter) animations.push(appear(el, enter, { duration, delay }));
            index++;
            return;
        }
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        const length = ms(duration);
        const animation = el.animate([
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0, 0)' }
        ], { duration: length, delay, easing: EASE, fill: 'backwards' });
        track(animation, length + delay);
        animations.push(animation);
        index++;
    });
    return animations;
}

function appear(el, kind, { duration, delay }) {
    const length = ms(duration);
    const frames = kind === 'pop'
        ? [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }]
        : [{ opacity: 0 }, { opacity: 1 }];
    const animation = el.animate(frames, { duration: length, delay, easing: 'ease-out', fill: 'backwards' });
    track(animation, length + delay);
    return animation;
}

export function fadeIn(el, { duration = 220, delay = 0 } = {}) {
    if (!enabled() || !el) return null;
    return appear(el, 'fade', { duration, delay: ms(delay) });
}

export function popIn(el, { duration = 280, delay = 0 } = {}) {
    if (!enabled() || !el) return null;
    return appear(el, 'pop', { duration, delay: ms(delay) });
}

// 目立たせる（大きくして戻す）
export function pulse(el, { duration = 320, delay = 0, scale = 1.1 } = {}) {
    if (!enabled() || !el) return null;
    const length = ms(duration);
    const animation = el.animate([
        { transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.4 }, { transform: 'scale(1)' }
    ], { duration: length, delay: ms(delay), easing: 'ease-out' });
    track(animation, length + ms(delay));
    return animation;
}

// 裏返す：半分（横向き）まで回したところで onHalf を呼び（表の中身に替える）、残りを回す
export function flipCard(el, { duration = 360, delay = 0, onHalf = null, axis = 'Y' } = {}) {
    if (!enabled() || !el) {
        onHalf?.();
        return Promise.resolve();
    }
    const half = ms(duration) / 2;
    const wait = ms(delay);
    const rotate = (deg) => ({ transform: `perspective(600px) rotate${axis}(${deg}deg)` });
    // 途中で止められても、中身は必ず替える
    let swapped = false;
    const swap = () => {
        if (swapped) return;
        swapped = true;
        onHalf?.();
    };
    const first = el.animate([rotate(0), rotate(90)], { duration: half, delay: wait, easing: 'ease-in', fill: 'both' });
    const run = first.finished.then(() => {
        swap();
        const second = el.animate([rotate(-90), rotate(0)], { duration: half, easing: 'ease-out' });
        first.cancel();
        return second.finished;
    }).catch(swap);
    track(run, half * 2 + wait);
    return run;
}

/**
 * 複製を from から to へ飛ばす（山札から手札へ・手札から場へ など）
 * from・to：位置（rectOf の結果）か要素。content：複製する要素か HTML の文字列（省くと from の要素を複製する）
 * hide：飛んでいる間は隠す、行き先の要素。size：複製の大きさ（省くと from の大きさ）
 */
export function fly(from, to, { content = null, delay = 0, duration = 420, hide = null, size = null, lift = true, className = 'motion-flyer' } = {}) {
    if (!enabled()) return Promise.resolve();
    const fromRect = from instanceof Element ? rectOf(from) : from;
    const toRect = to instanceof Element ? rectOf(to) : to;
    if (!fromRect || !toRect) return Promise.resolve();
    const width = size?.width ?? fromRect.width;
    const height = size?.height ?? fromRect.height;
    let el;
    if (typeof content === 'string') {
        el = document.createElement('div');
        el.innerHTML = content;
    } else {
        el = (content ?? (from instanceof Element ? from : null))?.cloneNode(true) ?? document.createElement('div');
    }
    el.classList.add(className);
    el.removeAttribute?.('id');
    Object.assign(el.style, {
        position: 'fixed', margin: '0', zIndex: '1000', pointerEvents: 'none', boxSizing: 'border-box',
        left: `${fromRect.left + (fromRect.width - width) / 2}px`, top: `${fromRect.top + (fromRect.height - height) / 2}px`,
        width: `${width}px`, height: `${height}px`, visibility: 'visible'
    });
    document.body.appendChild(el);
    const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
    const scale = Math.max(0.3, Math.min(1.5, toRect.width / width, toRect.height / height));
    const up = lift ? -Math.min(50, 8 + Math.hypot(dx, dy) * 0.1) : 0;
    const length = ms(duration);
    const wait = ms(delay);
    if (hide) hide.style.visibility = 'hidden';
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 + up}px) scale(${(1 + scale) / 2})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }
    ], { duration: length, delay: wait, easing: EASE, fill: 'backwards' });
    let cleaned = false;
    const done = () => {
        if (cleaned) return;
        cleaned = true;
        el.remove();
        if (hide) hide.style.visibility = '';
    };
    animation.finished.then(done, done);
    setTimeout(done, length + wait + SLACK_MS);
    return track(animation, length + wait);
}

// ===== 設定の画面 =====

const STYLE_ID = 'motion-speed-style';
const STYLE = `
:where(.motion-speed){display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
:where(.motion-speed) .motion-speed-label{font-size:.9em;opacity:.85}
:where(.motion-speed) .motion-speed-options{display:inline-flex;border-radius:999px;overflow:hidden;border:1px solid currentColor}
:where(.motion-speed) button{all:unset;cursor:pointer;padding:6px 12px;min-height:32px;box-sizing:border-box;display:inline-flex;align-items:center;font-size:.9em;touch-action:manipulation}
:where(.motion-speed) button+button{border-left:1px solid currentColor}
:where(.motion-speed) button[aria-pressed="true"]{background:rgba(127,127,127,.35);font-weight:bold}
:where(.motion-speed) button:focus-visible{outline:2px solid currentColor;outline-offset:-3px}
`;

/**
 * 「動き：普通・速い・なし」の切り替えを container の中に作る。返り値は作った要素
 * label：前に出す文字（'' なら出さない）
 */
export function mountSpeedSetting(container, { label = '動き', onChange = null } = {}) {
    if (!hasDom() || !container) return null;
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = STYLE;
        document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'motion-speed';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', '動きの速さ');
    root.innerHTML = `${label ? `<span class="motion-speed-label">${label}</span>` : ''}<span class="motion-speed-options">${SPEEDS.map(speed =>
        `<button type="button" data-motion-speed="${speed.id}" aria-pressed="false">${speed.label}</button>`).join('')}</span>`;
    const paint = () => root.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.motionSpeed === getSpeed()));
    });
    root.addEventListener('click', event => {
        const button = event.target.closest('button[data-motion-speed]');
        if (!button) return;
        setSpeed(button.dataset.motionSpeed);
        onChange?.(button.dataset.motionSpeed);
    });
    onSpeedChange(paint);
    paint();
    container.appendChild(root);
    return root;
}
