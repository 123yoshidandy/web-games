import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';
import { legalActions } from '../public/js/rules.js';

const make = (seed) => new Game([{ name: 'A', isCPU: false }, { name: 'B', isCPU: false }], { seed });
const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    // 読みに時間がかかるので、1局につき 12 手まで確かめる
    it.each([1, 2])('両者がおすすめの手だけを打っても、手が通る（シード %i）', (seed) => {
        const game = make(seed);
        for (let i = 0; i < 12 && !game.isOver(); i++) {
            const seat = game.current;
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(legalActions(game.state).map(a => JSON.stringify(a))).toContain(JSON.stringify(command));
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
    });

    it('手番でない人には出さない', () => {
        const game = make(7);
        expect(suggest(game, 1 - game.current)).toBe(null);
    });
});
