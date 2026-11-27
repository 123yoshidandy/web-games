import { describe, it, expect } from 'vitest';
import Game, { RESULT_MS } from '../public/js/game.js';
import { cpuPlan, runDue, nextEvent } from '../public/js/cpu-player.js';

const cpuGame = (level, seed = 5) => new Game([{ name: 'A' }, { name: 'C', isCPU: true }], { seed, targets: 5, level, startAt: 0 });

describe('CPU', () => {
    it('計画（いつ何手を宣言するか）はシードから決まり、ゲームの乱数を使わない', () => {
        const a = cpuGame('normal');
        const b = cpuGame('normal');
        expect(cpuPlan(a, 1).steps).toEqual(cpuPlan(b, 1).steps);
        expect(a.deck).toEqual(b.deck);
    });

    it('強いほど早く、最短を見つけやすい（多くの目標で比べる）', () => {
        const stats = {};
        for (const level of ['easy', 'normal', 'hard']) {
            let time = 0, exact = 0, n = 0;
            for (let seed = 1; seed <= 40; seed++) {
                const game = cpuGame(level, seed);
                const plan = cpuPlan(game, 1);
                if (!plan.steps.length) continue;
                n++;
                time += plan.steps[0].at - game.round.revealAt;
                if (plan.steps[0].count === plan.solution.count) exact++;
            }
            stats[level] = { time: time / n, exact: exact / n };
        }
        expect(stats.hard.time).toBeLessThan(stats.normal.time);
        expect(stats.normal.time).toBeLessThan(stats.easy.time);
        expect(stats.hard.exact).toBeGreaterThan(stats.easy.exact);
    });

    it('CPU の宣言は計画した時刻に入り、人が全員パスすると待たずに今の時刻で先へ進む', () => {
        const game = cpuGame('normal');
        const plan = cpuPlan(game, 1);
        expect(runDue(game, plan.steps[0].at - 1)).toBe(0);
        game.applyCommand(0, { type: 'pass', at: 4000 });
        expect(nextEvent(game).fastForward).toBe(true);
        runDue(game, 4000);
        expect(game.rounds).toHaveLength(1);
        expect(game.rounds[0].winner).toBe(1);
        expect(game.rounds[0].bids[0]).toMatchObject({ seat: 1, at: 4000 });
        expect(game.round.revealAt).toBe(4000 + RESULT_MS); // 時計を先へ進めないので、次の目標を待たされない
    });
});
