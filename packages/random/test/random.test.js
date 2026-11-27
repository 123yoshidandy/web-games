import { describe, expect, it } from 'vitest';
import { createRandom, createSeed, shuffle } from '../src/random.js';

describe('createRandom', () => {
    it('同じシードからは同じ順で同じ値が出る', () => {
        const a = createRandom(42);
        const b = createRandom(42);
        const seqA = Array.from({ length: 20 }, () => a());
        const seqB = Array.from({ length: 20 }, () => b());
        expect(seqA).toEqual(seqB);
    });

    it('値は mulberry32 のまま変わらない（変えると、保存した記録や CPU の手が再現できなくなる）', () => {
        const random = createRandom(1);
        expect([random(), random(), random()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    });

    it('値は [0, 1) に収まり、シードは 32 ビットに丸める', () => {
        const random = createRandom(-1);
        for (let i = 0; i < 1000; i++) {
            const value = random();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
        expect(createRandom(2 ** 32 + 5)()).toBe(createRandom(5)());
    });
});

describe('createSeed', () => {
    it('0 以上 2^32 未満の整数を返す', () => {
        for (let i = 0; i < 100; i++) {
            const seed = createSeed();
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThan(2 ** 32);
        }
    });
});

describe('shuffle', () => {
    it('その場で並べ替えて同じ配列を返し、要素は変わらない', () => {
        const array = [1, 2, 3, 4, 5, 6, 7, 8];
        const result = shuffle(array, createRandom(7));
        expect(result).toBe(array);
        expect([...array].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('同じシードなら同じ並びになる', () => {
        expect(shuffle([1, 2, 3, 4, 5, 6, 7, 8], createRandom(3))).toEqual(shuffle([1, 2, 3, 4, 5, 6, 7, 8], createRandom(3)));
    });
});
