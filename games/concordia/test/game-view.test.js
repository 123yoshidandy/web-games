import { describe, it, expect } from 'vitest';
import { createGameView } from '../public/js/game-view.js';
import { newGame, cardOf } from './helpers.js';

describe('ビュー', () => {
    it('ほかの人の手札の中身と、山札の並びは入らない', () => {
        const game = newGame(3);
        const view = createGameView(game, 0);
        expect(view.players[0].hand).toHaveLength(7);
        expect(view.players[1].hand).toBe(null);
        expect(view.players[1].handCount).toBe(7);
        expect(view.players[1].discard).toBe(null);
        expect(view.players[1].score).toBe(null);
        expect(view.deck).toBeUndefined();
        expect(view.deckCount).toBe(game.deck.length);
        // 山札のカードの種類の並びが、ビューの文字のどこにも出ない
        const text = JSON.stringify(view);
        game.deck.forEach(id => expect(text).not.toContain(`"id":${id},`));
    });

    it('捨て札のいちばん上は全員に見える', () => {
        const game = newGame(3);
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'mercator'), trades: [] });
        const view = createGameView(game, 1);
        expect(view.players[0].discardTop.type).toBe('mercator');
        expect(view.players[0].discardCount).toBe(1);
    });

    it('観戦者にはだれの手札も入らない。終わったら全員の手札と得点を見せる', () => {
        const game = newGame(2);
        const spectator = createGameView(game, null);
        expect(spectator.players.every(p => p.hand === null)).toBe(true);
        game.finish();
        const after = createGameView(game, null);
        expect(after.players.every(p => p.hand !== null && p.score)).toBe(true);
    });

    it('JSON にできる', () => {
        const game = newGame(4);
        expect(() => JSON.parse(JSON.stringify(createGameView(game, 2)))).not.toThrow();
    });
});
