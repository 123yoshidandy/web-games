import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { makeGame } from './helpers.js';

const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([[3, 1], [4, 2], [5, 3]])('%i人：全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (n, seed) => {
        const game = makeGame(n, seed);
        let steps = 0;
        while (!game.isOver() && steps++ < 5000) {
            const seat = game.actors()[0];
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('出し終えた人には出さない', () => {
        const game = makeGame(3, 7);
        expect(game.applyCommand(0, suggest(game, 0))).toBe(true);
        expect(suggest(game, 0)).toBe(null);
    });
});
