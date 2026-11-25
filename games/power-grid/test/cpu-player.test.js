import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot } from './helpers.js';

describe('CPU', () => {
    it('ビューだけで決め、同じビューなら同じ手を選び、ゲームの状態を変えない', () => {
        for (const level of ['easy', 'normal']) {
            const game = new Game(players(4, true).map(p => ({ ...p, cpuLevel: level })), { seed: 11 });
            let steps = 0;
            while (!game.isOver() && steps++ < 20000) {
                const seat = game.actors().find(s => game.players[s].isCPU);
                const before = snapshot(game);
                const view = JSON.parse(JSON.stringify(createGameView(game, seat)));
                const a = chooseCommand(view, level);
                expect(chooseCommand(view, level)).toEqual(a);
                expect(snapshot(game)).toBe(before);
                if (!game.applyCommand(seat, a)) runCpuStep(game);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人・3人・5人）', () => {
        const two = runMatches({ games: 80, levels: ['easy', 'normal'] });
        expect(two.finished).toBe(80);
        expect(two.wins[1] / two.finished).toBeGreaterThan(0.55);
        const three = runMatches({ games: 60, levels: ['easy', 'normal', 'easy'] });
        expect(three.finished).toBe(60);
        expect(three.wins[1] / three.finished).toBeGreaterThan(0.4);
        const five = runMatches({ games: 40, levels: ['easy', 'normal', 'easy', 'easy', 'easy'] });
        expect(five.finished).toBe(40);
        expect(five.wins[1] / five.finished).toBeGreaterThan(0.25);
    });
});
