import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { newGame } from './helpers.js';

const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it('9路で、おすすめの手を何手か続けて打てる。求めるだけでは状態を変えない', () => {
        const game = newGame([false, false], { size: 9 });
        for (let i = 0; i < 8; i++) {
            const seat = game.current;
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before);
            expect(['move', 'pass']).toContain(command.type);
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
    });

    it('手番でない人には出さない', () => {
        const game = newGame([false, false], { size: 9 });
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
