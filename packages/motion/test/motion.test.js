import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Motion from '../src/motion.js';

// 小さな偽の画面：localStorage・matchMedia・animate を持つ要素
function fakeStorage() {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), clear: () => data.clear() };
}

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

function fakeAnimation() {
    const done = deferred();
    return { finished: done.promise, finish: () => done.resolve(), cancel: vi.fn(() => done.resolve()) };
}

function fakeElement(id, rect) {
    return {
        dataset: { key: id },
        rect,
        animations: [],
        getBoundingClientRect() { return this.rect; },
        animate(frames, timing) {
            const animation = fakeAnimation();
            this.animations.push({ frames, timing, animation });
            return animation;
        }
    };
}

const rect = (left, top, width = 40, height = 40) => ({ left, top, width, height });
let reduce = false;

beforeEach(() => {
    reduce = false;
    globalThis.localStorage = fakeStorage();
    globalThis.matchMedia = () => ({ matches: reduce });
    globalThis.window = globalThis;
    globalThis.document = {};
});

afterEach(() => {
    vi.useRealTimers();
    delete globalThis.localStorage;
    delete globalThis.matchMedia;
    delete globalThis.window;
    delete globalThis.document;
});

describe('速さ', () => {
    it('選んでいなければ普通、動きを減らす設定ならなし', () => {
        expect(Motion.getSpeed()).toBe('normal');
        expect(Motion.speedScale()).toBe(1);
        reduce = true;
        expect(Motion.getSpeed()).toBe('off');
        expect(Motion.enabled()).toBe(false);
    });

    it('選んだ速さを保存し、動きを減らす設定より優先する', () => {
        reduce = true;
        Motion.setSpeed('fast');
        expect(localStorage.getItem(Motion.STORAGE_KEY)).toBe('fast');
        expect(Motion.getSpeed()).toBe('fast');
        expect(Motion.ms(400)).toBe(200);
        Motion.setSpeed('off');
        expect(Motion.ms(400)).toBe(0);
        expect(Motion.enabled()).toBe(false);
    });

    it('知らない速さは無視し、変わったら知らせる', () => {
        const seen = [];
        const stop = Motion.onSpeedChange(id => seen.push(id));
        Motion.setSpeed('warp');
        Motion.setSpeed('normal');
        stop();
        Motion.setSpeed('fast');
        expect(seen).toEqual(['normal']);
    });

    it('画面のない環境では動かさない', () => {
        delete globalThis.document;
        expect(Motion.enabled()).toBe(false);
    });
});

describe('動き終わるのを待つ', () => {
    it('動いていなければ、すぐに呼ぶ', () => {
        const fn = vi.fn();
        Motion.whenIdle(fn);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(Motion.isIdle()).toBe(true);
    });

    it('数えている動きがすべて終わってから呼ぶ', async () => {
        const a = fakeAnimation();
        const b = fakeAnimation();
        Motion.track(a, 500);
        Motion.track(b, 500);
        const fn = vi.fn();
        Motion.whenIdle(fn);
        a.finish();
        await Promise.resolve(); await Promise.resolve();
        expect(fn).not.toHaveBeenCalled();
        b.finish();
        await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
        expect(Motion.isIdle()).toBe(true);
    });

    it('finished が来なくても、長さと余りを過ぎれば打ち切る', () => {
        vi.useFakeTimers();
        Motion.track(fakeAnimation(), 300);
        const fn = vi.fn();
        Motion.whenIdle(fn);
        vi.advanceTimersByTime(699);
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('afterIdle は動き終わってから間をおいて呼び、取り消せる', async () => {
        vi.useFakeTimers();
        const animation = fakeAnimation();
        Motion.track(animation, 1000);
        const fn = vi.fn();
        Motion.afterIdle(fn, 200);
        animation.finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(fn).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(200);
        expect(fn).toHaveBeenCalledTimes(1);

        const again = fakeAnimation();
        Motion.track(again, 1000);
        const cancelled = vi.fn();
        const cancel = Motion.afterIdle(cancelled, 0);
        cancel();
        again.finish();
        await vi.advanceTimersByTimeAsync(5000);
        expect(cancelled).not.toHaveBeenCalled();
    });

    it('hold は CSS の動きの長さだけ数え、なしのときは数えない', async () => {
        vi.useFakeTimers();
        Motion.hold(400);
        expect(Motion.isIdle()).toBe(false);
        await vi.advanceTimersByTimeAsync(400);
        expect(Motion.isIdle()).toBe(true);
        Motion.setSpeed('off');
        Motion.hold(400);
        expect(Motion.isIdle()).toBe(true);
    });

    it('なしにすると、動いているものを止める', () => {
        const animation = fakeAnimation();
        Motion.track(animation, 1000);
        Motion.setSpeed('off');
        expect(animation.cancel).toHaveBeenCalled();
    });
});

describe('FLIP', () => {
    const root = (elements) => ({ querySelectorAll: () => elements });

    it('前の位置から今の位置へ動かし、動かないものと新しいものを分ける', () => {
        const moved = fakeElement('a', rect(100, 0));
        const still = fakeElement('b', rect(0, 50));
        const fresh = fakeElement('c', rect(0, 100));
        const before = new Map([['a', rect(0, 0)], ['b', rect(0, 50)]]);
        const animations = Motion.flipFrom(before, root([moved, still, fresh]), '.x', 'key', { duration: 200 });
        expect(animations).toHaveLength(2);
        expect(moved.animations[0].frames[0].transform).toBe('translate(-100px, 0px)');
        expect(moved.animations[0].timing.duration).toBe(200);
        expect(still.animations).toHaveLength(0);
        expect(fresh.animations[0].frames[0].opacity).toBe(0);
        expect(Motion.isIdle()).toBe(false);
        animations.forEach(animation => animation.finish());
    });

    it('速いなら長さを半分に、なしなら動かさない', () => {
        const el = fakeElement('a', rect(10, 0));
        Motion.setSpeed('fast');
        Motion.flipFrom(new Map([['a', rect(0, 0)]]), root([el]), '.x', 'key', { duration: 300 });
        expect(el.animations[0].timing.duration).toBe(150);
        el.animations[0].animation.finish();
        Motion.setSpeed('off');
        expect(Motion.flipFrom(new Map([['a', rect(0, 0)]]), root([el]), '.x')).toEqual([]);
    });

    it('captureRects は data-* ごとに位置を覚え、大きさのない要素は外す', () => {
        const hidden = fakeElement('h', rect(0, 0, 0, 0));
        const rects = Motion.captureRects(root([fakeElement('a', rect(1, 2)), hidden]), '.x');
        expect([...rects.keys()]).toEqual(['a']);
    });
});

describe('裏返す', () => {
    it('なしのときは、中身だけ替える', async () => {
        Motion.setSpeed('off');
        const onHalf = vi.fn();
        await Motion.flipCard(fakeElement('a', rect(0, 0)), { onHalf });
        expect(onHalf).toHaveBeenCalledTimes(1);
    });

    it('途中で止められても、中身は1度だけ替える', async () => {
        const el = fakeElement('a', rect(0, 0));
        const onHalf = vi.fn();
        const run = Motion.flipCard(el, { onHalf });
        el.animations[0].animation.finish();
        await vi.waitFor(() => expect(el.animations).toHaveLength(2));
        el.animations[1].animation.cancel();
        await run;
        expect(onHalf).toHaveBeenCalledTimes(1);
    });
});
