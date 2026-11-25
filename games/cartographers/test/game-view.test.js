import { describe, it, expect } from 'vitest';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, setCard, fullBoard, cell } from './helpers.js';

describe('ビュー', () => {
    it('山札の並びは入れず、枚数だけを入れる', () => {
        const game = makeGame(2, 2);
        const view = createGameView(game, 0);
        expect(view.deckCount).toBe(game.deck.length);
        expect(JSON.stringify(view)).not.toContain('"deck"');
    });

    it('描く番の人にだけ、描く必要と 1×1 の要否を出す', () => {
        const game = makeGame(2, 2);
        setCard(game, 'fishing');
        game.players[0].board = fullBoard('farm', [cell(0, 0)]);
        expect(createGameView(game, 0)).toMatchObject({ mustPlace: true, fallback: true });
        game.pending = [1];
        expect(createGameView(game, 0)).toMatchObject({ mustPlace: false, fallback: false });
        expect(createGameView(game, null).you).toBe(null);
    });

    it('JSON にできる', () => {
        const view = createGameView(makeGame(3, 4), 1);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
