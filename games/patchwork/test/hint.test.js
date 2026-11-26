import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { newGame } from './helpers.js';

const snapshot = (game) => JSON.stringify({ players: game.players, ring: game.ring, commands: game.commands });

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = newGame(seed);
        let steps = 0;
        const types = new Set();
        while (!game.isOver && steps++ < 1000) {
            const seat = game.current;
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            types.add(command.type);
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver).toBe(true);
        expect(types.has('buy')).toBe(true);
    });

    it('手番でない人には出さない', () => {
        const game = newGame(4);
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
