import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';
import { snapshot } from './helpers.js';

const humans = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: false }));

describe('ヒント（おすすめの手）', () => {
    it.each([[2, 5], [3, 6], [4, 7]])('%i人：全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (n, seed) => {
        const game = new Game(humans(n), { seed });
        let steps = 0;
        while (!game.isOver() && steps++ < 500) {
            const seat = game.current;
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('手番でない人には出さない', () => {
        const game = new Game(humans(2), { seed: 1 });
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
