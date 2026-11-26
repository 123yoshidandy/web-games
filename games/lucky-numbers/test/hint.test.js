import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';

const HUMANS = (count) => Array.from({ length: count }, (_, i) => ({ name: `P${i + 1}`, isCPU: false }));
const state = (game) => JSON.stringify({ commands: game.commands, current: game.currentPlayerIndex, holding: game.holding, table: game.table });

describe('ヒント（おすすめの手）', () => {
    it.each([2, 3, 4])('%i人：全員がおすすめの手だけを選んでも、最後まで進む', (count) => {
        const game = new Game(HUMANS(count), { seed: count });
        for (let i = 0; i < 1000 && game.phase === 'play'; i++) {
            const seat = game.currentPlayerIndex;
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.phase).toBe('end');
    });

    it('手番でない人には出さない', () => {
        const game = new Game(HUMANS(2), { seed: 5 });
        expect(suggest(game, 1 - game.currentPlayerIndex)).toBe(null);
    });
});
