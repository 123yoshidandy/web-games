import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3, 4])('両者がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = new Game(players(false), { seed });
        game.players.forEach(p => { p.isCPU = false; });
        let steps = 0;
        while (!game.isOver() && steps++ < 5000) {
            const seat = game.current;
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('手番でない人には出さない', () => {
        const game = new Game(players(false), { seed: 9 });
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
