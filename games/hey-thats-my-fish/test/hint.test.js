import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { newGame } from './helpers.js';

const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([2, 3, 4])('%i人：全員がおすすめの手だけを選んでも、最後まで進む', (n) => {
        const game = newGame(n, n);
        for (let i = 0; i < 300 && !game.isOver(); i++) {
            const seat = game.actors()[0];
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('手番でない人には出さない', () => {
        const game = newGame(2, 5);
        expect(suggest(game, 1)).toBe(null);
    });
});
