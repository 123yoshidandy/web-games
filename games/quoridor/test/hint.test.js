import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';
import { actionKey } from '../public/js/rules.js';

const newGame = (n, seed) => new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: false })), { seed });

describe('ヒント（おすすめの手）', () => {
    it.each([[2, 1], [4, 2]])('%i人：おすすめの手は通る手で、それだけを打っても進む（シード %i）', (n, seed) => {
        const game = newGame(n, seed);
        for (let i = 0; i < 30 && !game.isOver(); i++) {
            const seat = game.current;
            const before = JSON.stringify(game.persist());
            const command = suggest(game, seat);
            expect(JSON.stringify(game.persist())).toBe(before); // 求めるだけでは状態を変えない
            expect(game.legalActions().map(actionKey)).toContain(actionKey(command));
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
    });

    it('手番でない人には出さない', () => {
        const game = newGame(2, 3);
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
