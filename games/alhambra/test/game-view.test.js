import { describe, it, expect } from 'vitest';
import { createGameView } from '../public/js/game-view.js';
import { makeGame } from './helpers.js';

describe('ビュー', () => {
    it('手持ちのお金は本人にだけ見せ、山札と袋の並びは入れない', () => {
        const game = makeGame(3, 2);
        const view = createGameView(game, 1);
        expect(view.players[1].hand.length).toBe(game.players[1].hand.length);
        expect(view.players[0].hand).toBe(null);
        expect(view.players[0].handCount).toBe(game.players[0].hand.length);
        expect(view.bagCount).toBe(game.bag.length);
        expect(JSON.stringify(view)).not.toContain('"bag"');
        expect(JSON.stringify(view)).not.toContain('"deck"');
    });

    it('置く建物は、置く人にだけ出す', () => {
        const game = makeGame(3, 2);
        game.phase = 'place';
        game.bought = [6];
        expect(createGameView(game, game.current).toPlace).toEqual([6]);
        expect(createGameView(game, (game.current + 1) % 3).toPlace).toEqual([]);
    });

    it('JSON にできる', () => {
        const view = createGameView(makeGame(2, 4), 0);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
