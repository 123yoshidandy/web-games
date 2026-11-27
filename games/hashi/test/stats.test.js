import { describe, it, expect } from 'vitest';
import { emptyStats, normalizeStats, recordFree, recordAttack, recordDaily, recordOnline, dailyStreak, DAILY_KEEP } from '../public/js/stats.js';

describe('記録', () => {
    it('フリーは解いた数を数え、ヒントなしの最短だけを比べる', () => {
        const stats = emptyStats();
        expect(recordFree(stats, 'easy', 30000)).toBe(true);
        expect(recordFree(stats, 'easy', 20000, 2)).toBe(false);
        expect(recordFree(stats, 'easy', 40000)).toBe(false);
        expect(recordFree(stats, 'easy', 25000)).toBe(true);
        expect(stats.free.easy).toEqual({ solved: 4, best: 25000 });
    });

    it('タイムアタックと今日のパズルは、速いときだけ更新する', () => {
        const stats = emptyStats();
        expect(recordAttack(stats, 'normal:3', 90000)).toEqual({ first: true, best: false });
        expect(recordAttack(stats, 'normal:3', 95000)).toEqual({ first: false, best: false });
        expect(recordAttack(stats, 'normal:3', 80000)).toEqual({ first: false, best: true });
        expect(recordDaily(stats, '2026-01-01', 70000)).toEqual({ first: true, best: false });
        expect(recordDaily(stats, '2026-01-01', 60000)).toEqual({ first: false, best: true });
        expect(stats.attack['normal:3']).toBe(80000);
        expect(stats.daily['2026-01-01']).toBe(60000);
    });

    it('今日のパズルは古い日から消し、連続の日数を数える（今日がまだでも、昨日までの連続を数える）', () => {
        const stats = emptyStats();
        for (let d = 1; d <= DAILY_KEEP + 5; d++) recordDaily(stats, `2026-0${1 + Math.floor((d - 1) / 31)}-${String(((d - 1) % 31) + 1).padStart(2, '0')}`, 1000);
        expect(Object.keys(stats.daily)).toHaveLength(DAILY_KEEP);
        const fresh = emptyStats();
        ['2026-02-27', '2026-02-28', '2026-03-01'].forEach(key => recordDaily(fresh, key, 1000));
        expect(dailyStreak(fresh, '2026-03-01')).toBe(3);
        expect(dailyStreak(fresh, '2026-03-02')).toBe(3);
        expect(dailyStreak(fresh, '2026-03-03')).toBe(0);
    });

    it('オンラインは回数と1位の数。壊れた保存は空の記録として読む', () => {
        const stats = emptyStats();
        recordOnline(stats, 1);
        recordOnline(stats, 3);
        expect(stats.online).toEqual({ played: 2, wins: 1 });
        expect(normalizeStats(JSON.parse(JSON.stringify(stats)))).toEqual(stats);
        expect(normalizeStats('x')).toEqual(emptyStats());
        expect(normalizeStats({ free: { easy: 'x' }, attack: { a: -1 }, daily: { bad: 1 }, online: { played: 'x' } })).toEqual(emptyStats());
    });
});
