import { describe, it, expect } from 'vitest';
import { normalizeClock, createClockSides, limitOf, spend, reading, formatClock, cpuBudget, isLow } from '../public/js/clock.js';

// 持ち時間の計算（clock.js は chess・shogi・go で同じ中身）
describe('持ち時間の計算', () => {
    it('設定をそろえる。時間のない設定は時計なし', () => {
        expect(normalizeClock(null)).toBe(null);
        expect(normalizeClock({})).toBe(null);
        expect(normalizeClock({ main: 0 })).toBe(null);
        expect(normalizeClock({ main: 60000 })).toEqual({ main: 60000, byoyomi: 0, periods: 0, increment: 0 });
        expect(normalizeClock({ main: 60000, byoyomi: 30000 })).toEqual({ main: 60000, byoyomi: 30000, periods: 1, increment: 0 });
        // 秒読みと加算は一緒に使わない（秒読みを優先）。負の値・小数は 0
        expect(normalizeClock({ main: 1000, byoyomi: 5000, periods: 3, increment: 2000 })).toEqual({ main: 1000, byoyomi: 5000, periods: 3, increment: 0 });
        expect(normalizeClock({ main: -5, increment: 1.5 })).toBe(null);
    });

    it('切れ負け：使った分だけ減り、使い切ったら時間切れ', () => {
        const config = normalizeClock({ main: 10000 });
        const [side] = createClockSides(config);
        expect(spend(config, side, 3000)).toEqual({ side: { main: 7000, periods: 0 }, flagged: false });
        expect(spend(config, side, 9999).flagged).toBe(false);
        expect(spend(config, side, 10000)).toEqual({ side: { main: 0, periods: 0 }, flagged: true });
        expect(limitOf(config, side)).toBe(10000);
    });

    it('フィッシャー：指すたびに加算する（加算しない操作もある）。使い切ったあとの加算はない', () => {
        const config = normalizeClock({ main: 10000, increment: 2000 });
        const [side] = createClockSides(config);
        expect(spend(config, side, 3000).side.main).toBe(9000);
        expect(spend(config, side, 3000, { increment: false }).side.main).toBe(7000);
        expect(spend(config, side, 10000).flagged).toBe(true);
        // 加算でもとの持ち時間より増えてよい
        expect(spend(config, side, 500).side.main).toBe(11500);
    });

    it('秒読み：持ち時間を使い切っても、秒読みの中で指せば回数は減らない。超えたら1回ずつ減り、全部超えたら時間切れ', () => {
        const config = normalizeClock({ main: 60000, byoyomi: 30000, periods: 3 });
        const [side] = createClockSides(config);
        expect(limitOf(config, side)).toBe(150000);
        expect(spend(config, side, 50000).side).toEqual({ main: 10000, periods: 3 });
        expect(spend(config, side, 80000).side).toEqual({ main: 0, periods: 3 });   // 秒読み20秒目で指した
        expect(spend(config, side, 90000).side).toEqual({ main: 0, periods: 2 });   // 秒読みをちょうど使い切った
        expect(spend(config, side, 125000).side).toEqual({ main: 0, periods: 1 });
        expect(spend(config, side, 150000).flagged).toBe(true);
        // 秒読みに入ったあとは、毎手 byoyomi × 残りの回数まで
        const inByoyomi = { main: 0, periods: 1 };
        expect(limitOf(config, inByoyomi)).toBe(30000);
        expect(spend(config, inByoyomi, 29999).side).toEqual({ main: 0, periods: 1 });
        expect(spend(config, inByoyomi, 30000).flagged).toBe(true);
    });

    it('表示：持ち時間、秒読みの残りと回数、負けまでの時間', () => {
        const config = normalizeClock({ main: 60000, byoyomi: 30000, periods: 3 });
        const side = { main: 60000, periods: 3 };
        expect(reading(config, side, 10000)).toEqual({ shown: 50000, byoyomi: false, periods: 3, total: 140000 });
        expect(reading(config, side, 65000)).toEqual({ shown: 25000, byoyomi: true, periods: 3, total: 85000 });
        expect(reading(config, side, 95000)).toEqual({ shown: 25000, byoyomi: true, periods: 2, total: 55000 });
        expect(reading(config, side, 200000)).toEqual({ shown: 0, byoyomi: true, periods: 0, total: 0 });
        expect(isLow(reading(config, side, 141000))).toBe(true);
        expect(isLow(reading(config, side, 95000))).toBe(false);
    });

    it('時間の書き方：分と秒、10秒を切ったら0.1秒まで', () => {
        expect(formatClock(300000)).toBe('5:00');
        expect(formatClock(299001)).toBe('5:00');
        expect(formatClock(61000)).toBe('1:01');
        expect(formatClock(10000)).toBe('0:10');
        expect(formatClock(9950)).toBe('9.9');
        expect(formatClock(40)).toBe('0.0');
        expect(formatClock(-5)).toBe('0.0');
    });

    it('CPU が1手に使う時間は、負けまでの時間より十分短い', () => {
        const cases = [
            [{ main: 180000 }, { main: 180000, periods: 0 }],
            [{ main: 180000 }, { main: 900, periods: 0 }],
            [{ main: 180000, increment: 2000 }, { main: 400, periods: 0 }],
            [{ main: 600000, byoyomi: 30000, periods: 1 }, { main: 0, periods: 1 }],
            [{ main: 180000, byoyomi: 10000, periods: 1 }, { main: 2000, periods: 1 }]
        ];
        cases.forEach(([raw, side]) => {
            const config = normalizeClock(raw);
            const budget = cpuBudget(config, side);
            expect(budget).toBeGreaterThanOrEqual(0);
            expect(budget).toBeLessThan(limitOf(config, side));
            // 秒読みの回数を減らさない
            if (config.byoyomi) expect(spend(config, side, budget).side.periods).toBe(side.periods);
        });
        expect(cpuBudget(null, { main: 0, periods: 0 })).toBe(null);
    });
});
