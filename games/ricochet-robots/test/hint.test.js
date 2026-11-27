import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest } from '../public/js/cpu-player.js';
import { solve } from '../public/js/solver.js';
import { applyMoves, reached } from '../public/js/board.js';

describe('ヒント（suggest）', () => {
    it('早解きでは、最短の手数を宣言し、もっと少ない宣言があればパスする', () => {
        const game = new Game([{ name: 'A' }, { name: 'B' }], { seed: 21, targets: 5, startAt: 0 });
        const best = solve(game.board.walls, game.robots, game.round.target, game.round.cell).count;
        expect(suggest(game, 0)).toEqual({ type: 'declare', count: best });
        game.applyCommand(1, { type: 'declare', count: best, at: 4000 });
        expect(suggest(game, 0)).toEqual({ type: 'pass' });
    });

    it('実演の番では、宣言した手数以内で着く手順を出す', () => {
        const game = new Game([{ name: 'A' }, { name: 'B' }], { seed: 22, targets: 5, startAt: 0 });
        game.applyCommand(0, { ...suggest(game, 0), at: 4000 });
        game.applyCommand(0, { type: 'pass', at: 4001 });
        game.applyCommand(1, { type: 'pass', at: 4002 });
        expect(suggest(game, 1)).toBeNull();
        const move = suggest(game, 0);
        expect(move.type).toBe('demo');
        const after = applyMoves(game.board.walls, game.robots, move.moves).robots;
        expect(reached(game.round.target, game.round.cell, after)).toBe(true);
    });

    it('ひとりで練習では、最短の手順の最初の1手で、続けると最短で着く', () => {
        const game = new Game([{ name: 'A' }], { seed: 23, mode: 'solo', targets: 5, startAt: 0 });
        const best = game.round.optimum;
        for (let i = 0; i < best; i++) {
            const move = suggest(game, 0);
            expect(move.type).toBe('move');
            expect(game.applyCommand(0, { ...move, at: 4000 + i })).toBe(true);
        }
        expect(game.rounds[0]).toMatchObject({ solved: true, points: 3 });
    });
});
