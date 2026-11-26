import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { makeGame } from './helpers.js';

const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('両者がおすすめの手だけを選んでも、最後まで進む（シード %i）', (seed) => {
        const game = makeGame(seed);
        for (let i = 0; i < 300 && !game.isOver(); i++) {
            const seat = game.actor();
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('操作する番でない人には出さない', () => {
        const game = makeGame(4);
        expect(suggest(game, 1 - game.actor())).toBe(null);
    });
});
