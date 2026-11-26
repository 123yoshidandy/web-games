import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';
import { players } from './helpers.js';

const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it.each([3, 4, 5])('%i人：全員がおすすめの手だけを選んでも、最後まで進む', (n) => {
        const game = new Game(players(n), { seed: n * 3 });
        for (let i = 0; i < 3000 && game.phase !== 'end'; i++) {
            const seat = game.actors()[0];
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.phase).toBe('end');
    });

    it('操作する番でない人には出さない', () => {
        const game = new Game(players(3), { seed: 2 });
        const idle = [0, 1, 2].find(seat => !game.actors().includes(seat));
        expect(suggest(game, idle)).toBe(null);
    });
});
