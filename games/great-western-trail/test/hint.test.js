import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { makeGame, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2])('おすすめの手だけを選んでも、手が通る（シード %i）', (seed) => {
        const game = makeGame(2, seed);
        for (let i = 0; i < 60 && !game.isOver(); i++) {
            const seat = game.turn;
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
    });

    it('手番でない人には出さない', () => {
        const game = makeGame(2, 3);
        expect(suggest(game, 1 - game.turn)).toBe(null);
    });
});
