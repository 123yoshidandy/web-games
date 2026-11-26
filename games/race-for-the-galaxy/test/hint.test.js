import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';

const make = (seed) => new Game([0, 1, 2, 3].map(i => ({ name: `P${i}` })), { seed });
const state = (game) => JSON.stringify({ players: game.players, pending: game.pending, commands: game.commands });

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = make(seed);
        let steps = 0;
        while (!game.isOver() && steps++ < 20000) {
            const seat = game.pending.findIndex(Boolean);
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('選ぶ番でない人には出さない', () => {
        const game = make(7);
        const seat = game.pending.findIndex(Boolean);
        expect(game.applyCommand(seat, suggest(game, seat))).toBe(true);
        if (!game.pending[seat]) expect(suggest(game, seat)).toBe(null);
    });
});
