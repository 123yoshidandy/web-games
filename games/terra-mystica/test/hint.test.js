import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, chooseCpuCommands, runCpuStep, PROFILES } from '../public/js/cpu-player.js';
import { players, snapshot, quickSetup } from './helpers.js';

describe('ヒント（suggest）', () => {
    it('準備では、置ける土地への最初の住居をすすめる', () => {
        const game = new Game(players(3), { seed: 7 });
        const seat = game.waiting().seat;
        const command = suggest(game, seat);
        expect(command.type).toBe('place');
        expect(game.applyCommand(seat, command)).toBe(true);
    });

    it('答える番でない人には null を返し、状態を変えない', () => {
        const game = new Game(players(3), { seed: 7 });
        const seat = game.waiting().seat;
        const before = snapshot(game);
        expect(suggest(game, (seat + 1) % 3)).toBe(null);
        suggest(game, seat);
        expect(snapshot(game)).toBe(before);
    });

    it('手番では、CPU と同じ本命の手（交換を除く）をすすめ、交換のあとに通る', () => {
        const game = quickSetup(new Game(players(3), { seed: 11 }));
        for (let i = 0; i < 30 && game.state.phase !== 'end'; i++) {
            const seat = game.waiting().seat;
            const plan = chooseCpuCommands(game, seat, PROFILES.normal);
            const command = suggest(game, seat);
            expect(command).toEqual(plan.filter(c => c.type !== 'convert').at(-1) ?? plan.at(-1));
            expect(command.type).not.toBe('convert');
            runCpuStep(game, seat, PROFILES.normal);
        }
    });

    it('終わったゲームでは null', () => {
        const game = new Game(players(2, true), { seed: 3 });
        for (let i = 0; i < 3000 && game.state.phase !== 'end'; i++) runCpuStep(game, game.waiting().seat, PROFILES.normal);
        expect(game.state.phase).toBe('end');
        expect(suggest(game, 0)).toBe(null);
    });
});
