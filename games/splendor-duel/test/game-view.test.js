import { describe, it, expect } from 'vitest';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, placeInPyramid, giveTokens, findCard } from './helpers.js';

describe('ビュー', () => {
    it('山札の並びは入れず、枚数だけを入れる', () => {
        const game = makeGame(2);
        const view = createGameView(game, 0);
        expect(view.deckCounts).toEqual({ 1: 25, 2: 20, 3: 10 });
        expect(JSON.stringify(view)).not.toContain('"decks"');
    });

    it('伏せて予約したカードは本人にだけ見せる（イベントも）', () => {
        const game = makeGame(2);
        const top = game.decks[2][0];
        game.applyCommand(0, { type: 'reserve', level: 2 });
        expect(createGameView(game, 0).players[0].reserved).toEqual([{ id: top, hidden: true, level: 2 }]);
        const other = createGameView(game, 1);
        expect(other.players[0].reserved).toEqual([{ id: null, hidden: true, level: 2 }]);
        expect(other.events.find(e => e.type === 'reserve').card).toBe(null);
        expect(createGameView(game, null).players[0].reserved[0].id).toBe(null);
    });

    it('手番の人にだけ、能力の選択肢と買えるカードを出す', () => {
        const game = makeGame(2);
        const id = findCard(c => c.level === 2 && c.color === 'white' && c.ability === 'steal');
        placeInPyramid(game, 2, 0, id);
        giveTokens(game.players[0], { blue: 4, red: 3 });
        giveTokens(game.players[1], { green: 1, pearl: 1 });
        expect(createGameView(game, 0).affordable).toContain(id);
        expect(createGameView(game, 1).affordable).toEqual([]);
        game.applyCommand(0, { type: 'buy', card: id });
        expect(createGameView(game, 0).choice).toEqual({ type: 'steal', color: null, card: null, options: ['green', 'pearl'] });
        expect(createGameView(game, 1).choice).toBe(null);
    });

    it('JSON にできる', () => {
        const view = createGameView(makeGame(3), 1);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
