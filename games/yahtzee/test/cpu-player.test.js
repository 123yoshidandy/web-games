import { describe, it, expect } from 'vitest';
import Game, { emptyScores } from '../public/js/game.js';
import { planTurn, decide, runCpuStep, cpuActors, bonusChance, PROFILES } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot } from './helpers.js';
import { createRandom } from '../public/js/random.js';

const state = (dice, rollsLeft, filled = {}) => ({ scores: { ...emptyScores(), ...filled }, dice, rollsLeft, rolled: true });
const fixed = () => 0.5;

describe('CPU の判断', () => {
    it('振る前は全部振る', () => {
        expect(decide({ ...state([0, 0, 0, 0, 0], 3), rolled: false }, fixed, PROFILES.strong)).toEqual({ type: 'roll', keep: [false, false, false, false, false] });
    });

    it('ヤッツィーができたら、ヤッツィーに書く', () => {
        expect(planTurn(state([6, 6, 6, 6, 6], 2))).toEqual({ type: 'score', category: 'yahtzee' });
    });

    it('L・ストレートができたら、振らずに書く', () => {
        expect(planTurn(state([2, 3, 4, 5, 6], 2))).toEqual({ type: 'score', category: 'largeStraight' });
    });

    it('4個そろっていれば、その4個を残して振る', () => {
        const plan = planTurn(state([5, 5, 2, 5, 5], 2));
        expect(plan.type).toBe('roll');
        expect(plan.keep).toEqual([true, true, false, true, true]);
    });

    it('L・ストレートとチャンスしか空いていなければ、続いた4つの目を残す', () => {
        const filled = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, threeKind: 20, fourKind: 0, fullHouse: 25, smallStraight: 30, yahtzee: 0 };
        const plan = planTurn(state([2, 3, 4, 5, 5], 2, filled));
        expect(plan.type).toBe('roll');
        expect(plan.keep).toEqual([true, true, true, true, false]);
    });

    it('振れないときは、空いている欄に書く', () => {
        const plan = planTurn(state([1, 2, 2, 4, 6], 0, { chance: 20 }));
        expect(plan.type).toBe('score');
        expect(plan.category).not.toBe('chance');
    });

    it('上段ボーナスの見込みは、余裕があるほど高い', () => {
        expect(bonusChance(63, [])).toBe(1);
        expect(bonusChance(50, [])).toBe(0);
        expect(bonusChance(40, ['sixes'])).toBeGreaterThan(bonusChance(30, ['sixes']));
    });

    it('CPU はゲームの乱数を使わない（考えても状態が変わらない）', () => {
        const game = new Game(players(2, true), { seed: 4 });
        game.applyCommand(0, { type: 'roll', keep: [false, false, false, false, false] });
        const before = snapshot(game);
        decide({ scores: { ...game.players[0].scores }, dice: [...game.dice], rollsLeft: game.rollsLeft, rolled: true }, createRandom(1), PROFILES.normal);
        expect(snapshot(game)).toBe(before);
    });

    it('乱数を渡さなくても、同じ局面なら同じ手を選ぶ（Math.random を使わない）', () => {
        const plan = planTurn(state([1, 2, 2, 4, 6], 2), PROFILES.normal);
        expect(planTurn(state([1, 2, 2, 4, 6], 2), PROFILES.normal)).toEqual(plan);
    });

    it('どの強さでも、CPU だけのゲームが最後まで進む', () => {
        ['easy', 'normal', 'strong', 'random'].forEach(level => {
            const game = new Game(players(3, true), { seed: 8 });
            let steps = 0;
            while (!game.isOver() && steps++ < 1000) runCpuStep(game, cpuActors(game)[0], PROFILES[level]);
            expect(game.isOver(), level).toBe(true);
        });
    });
});

describe('CPU の強さ', () => {
    it('つよい > ふつう > やさしい > でたらめ の順に、平均点が高い', () => {
        const average = (level) => {
            const r = runMatches({ games: 60, profiles: [level], seedBase: 500 });
            expect(r.stuck).toBe(0);
            return r.totals[0].reduce((s, v) => s + v, 0) / r.totals[0].length;
        };
        const strong = average('strong');
        const normal = average('normal');
        const easy = average('easy');
        const random = average('random');
        expect(strong).toBeGreaterThan(220);
        expect(strong).toBeGreaterThan(normal);
        expect(normal).toBeGreaterThan(easy);
        expect(easy).toBeGreaterThan(random);
    });
});
