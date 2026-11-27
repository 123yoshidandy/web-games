import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';
import { players } from './helpers.js';

const state = (game) => JSON.stringify(game.persist()) + JSON.stringify(game.fire) + JSON.stringify(game.players);

describe('ヒント（おすすめの手）', () => {
    it.each([['family', 1], ['family', 2], ['experienced', 3]])('全員がおすすめの手だけを打っても、手が通って最後まで進む（%s・シード %i）', (mode, seed) => {
        const game = new Game(players(3), { seed, mode, level: 'recruit' });
        let steps = 0;
        while (!game.isOver() && steps++ < 5000) {
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
        const game = new Game(players(3), { seed: 7 });
        expect(suggest(game, 1)).toBe(null);
        expect(suggest(game, 0)?.type).toBe('place');
    });
});
