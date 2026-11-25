import { describe, it, expect } from 'vitest';
import Game, { TILES } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES, bestPayment } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { makeGame, setHand, snapshot } from './helpers.js';

describe('CPU', () => {
    it('人数と強さを変えても、最後まで終わり、手が断られない', () => {
        for (const profiles of [['easy', 'normal'], ['normal', 'normal', 'easy'], ['easy', 'normal', 'easy', 'normal', 'easy', 'normal']]) {
            const r = runMatches({ games: 8, profiles, seedBase: 30 });
            expect(r.finished).toBe(8);
            expect(r.stuck).toBe(0);
            expect(r.fallbacks).toBe(0);
        }
    });

    it('CPU の試合は記録から再現できる（CPU はゲームの乱数を使わない）', () => {
        const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'easy' }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }], { seed: 77 });
        let steps = 0;
        while (!game.isOver() && steps++ < 6000) runCpuStep(game);
        expect(game.isOver()).toBe(true);
        const saved = game.persist();
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('手を決めるだけでは状態を変えず、同じ場面では同じ手を選ぶ', () => {
        const game = makeGame(3, 12);
        const seat = game.current;
        const before = snapshot(game);
        const a = chooseCpuCommand(game, seat);
        expect(snapshot(game)).toBe(before);
        expect(chooseCpuCommand(game, seat)).toEqual(a);
        expect(game.applyCommand(seat, a)).toBe(true);
    });

    it('払い方は、払い過ぎが最も少なく、枚数の少ない組', () => {
        const cards = [{ id: 1, value: 5 }, { id: 2, value: 4 }, { id: 3, value: 3 }, { id: 4, value: 9 }];
        expect(bestPayment(cards, 7)).toEqual({ ids: [2, 3], over: 0 });
        expect(bestPayment(cards, 9)).toEqual({ ids: [4], over: 0 });
        expect(bestPayment(cards, 30)).toBe(null);
    });

    it('ちょうどの額で買える欲しい建物があれば買う（見落としのない CPU）', () => {
        const game = makeGame(3, 3);
        const seat = game.current;
        const tower = TILES.find(t => t.type === 'tower' && t.cost === 12).id;
        game.market[2] = tower;
        setHand(game, seat, [['blue', 7], ['blue', 5]]);
        expect(chooseCpuCommand(game, seat, PROFILES.strong)).toMatchObject({ type: 'buy', slot: 2 });
    });

    it('強さの順（やさしい＜ふつう）になっている', () => {
        const r = runMatches({ games: 60, profiles: ['easy', 'normal'], seedBase: 500 });
        expect(r.wins[1]).toBeGreaterThan(r.wins[0]);
    });
});
