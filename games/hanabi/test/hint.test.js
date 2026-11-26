import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { newGame, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([2, 3, 4])('%i人：全員がおすすめの手だけを選んでも、最後まで進む', (n) => {
        const game = newGame(n, n * 7);
        for (let i = 0; i < 200 && game.phase !== 'end'; i++) {
            const seat = game.current;
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.phase).toBe('end');
    });

    it('手番でない人には出さない', () => {
        const game = newGame(2, 3);
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
