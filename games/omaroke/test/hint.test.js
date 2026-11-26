import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { players } from './helpers.js';
import { suggest } from '../public/js/cpu-player.js';

const make = (seed) => new Game(players(5), { seed });
const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = make(seed);
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
        expect(suggest(game, [0, 1, 2, 3, 4].find(s => !game.actors().includes(s)))).toBe(null);
    });
});
