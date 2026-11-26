import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers.js';
import { suggest } from '../public/js/cpu-player.js';

const make = (seed) => makeGame(seed);
const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = make(seed);
        let steps = 0;
        while (!game.isOver() && steps++ < 5000) {
            const seat = game.current;
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(command).toBeTruthy();
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('手番でない人には出さない', () => {
        const game = make(7);
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
