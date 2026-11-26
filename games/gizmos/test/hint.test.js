import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2])('手番の行動でおすすめの手だけを選んでも、最後まで進む（シード %i）', (seed) => {
        const game = new Game(players(2), { seed });
        for (let i = 0; i < 600 && game.phase !== 'end'; i++) {
            const seat = game.current;
            if (game.phase !== 'action') {
                expect(runCpuStep(game, seat)).toBe(true);
                continue;
            }
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.phase).toBe('end');
    });

    it('手番でない人には出さない', () => {
        const game = new Game(players(2), { seed: 3, startPlayer: 0 });
        expect(suggest(game, 1)).toBe(null);
    });
});
