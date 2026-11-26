import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { makeGame } from './helpers.js';

const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2])('全員がおすすめの手だけを選んでも、最後まで進む（シード %i）', (seed) => {
        const game = makeGame(seed);
        for (let i = 0; i < 2000 && !game.isOver(); i++) {
            const seat = game.actors()[0];
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('操作する番でない人には出さない', () => {
        const game = makeGame(3);
        const seat = game.actors()[0];
        expect(game.applyCommand(seat, suggest(game, seat))).toBe(true);
        expect(suggest(game, seat)).toBe(null); // 渡し終えた人
    });
});
