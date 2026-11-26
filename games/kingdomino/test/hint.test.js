import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { newGame, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([[2, 1], [3, 2], [4, 3]])('%i人：全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (n, seed) => {
        const game = newGame(n, seed, { middleKingdom: true, harmony: true });
        let steps = 0;
        while (!game.isOver && steps++ < 1000) {
            const seat = game.currentSeat;
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver).toBe(true);
    });

    it('手番でない人と、終わったゲームには出さない', () => {
        const game = newGame(2, 4);
        expect(suggest(game, 1 - game.currentSeat)).toBe(null);
    });
});
