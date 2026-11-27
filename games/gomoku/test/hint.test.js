import { describe, it, expect } from 'vitest';
import { suggest } from '../public/js/cpu-player.js';
import { newGame, at, mv, playMoves } from './helpers.js';

const state = (game) => JSON.stringify(game.persist());

describe('ヒント（おすすめの手）', () => {
    it('おすすめの手を何手か続けて打てる。求めるだけでは状態を変えない', () => {
        const game = newGame([false, false]);
        for (let i = 0; i < 10 && !game.isOver(); i++) {
            const seat = game.current;
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before);
            expect(command.type).toBe('move');
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
    });

    it('相手の四を止める手をすすめる', () => {
        const game = newGame([false, false]);
        playMoves(game, [at(15, 7, 4), at(15, 0, 0), at(15, 7, 5), at(15, 0, 14), at(15, 7, 6), at(15, 14, 0), at(15, 7, 7), at(15, 7, 3)]);
        // 黒が H8 まで4つ、白は左端を止めた。黒の番：五にする
        expect(suggest(game, 0)).toEqual(mv(at(15, 7, 8)));
    });

    it('手番でない人と、終わったあとには出さない', () => {
        const game = newGame([false, false]);
        expect(suggest(game, 1 - game.current)).toBe(null);
        game.applyCommand(0, { type: 'resign' });
        expect(suggest(game, 1)).toBe(null);
    });
});
