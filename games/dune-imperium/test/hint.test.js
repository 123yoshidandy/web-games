import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';

const make = (seed, n = 3) => new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), { seed });
const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = make(seed, seed === 3 ? 4 : 3);
        let steps = 0;
        while (!game.isOver() && steps++ < 20000) {
            const seat = game.actors()[0];
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
        expect(suggest(game, (game.actors()[0] + 1) % 3)).toBe(null);
    });
});
