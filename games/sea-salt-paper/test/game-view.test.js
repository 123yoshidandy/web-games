import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, pick, setHand, setPile } from './helpers.js';

const newGame = () => new Game(players(3), { seed: 3, startPlayer: 0 });
const json = (view) => JSON.stringify(view);

describe('ビュー（手札を隠す）', () => {
    it('ほかの人の手札は枚数だけ。山札の並びは入れない', () => {
        const game = newGame();
        const hand = pick('mermaid', 'octopus');
        setHand(game, 1, hand);
        const view = createGameView(game, 0);
        expect(view.players[1].hand).toBe(null);
        expect(view.players[1].handCount).toBe(2);
        expect(view.deckCount).toBe(game.deck.length);
        expect(view).not.toHaveProperty('deck');
        expect(createGameView(game, 1).players[1].hand).toEqual(hand);
        expect(createGameView(game, null).players.every(p => p.hand === null)).toBe(true);
    });

    it('山札から引いた2枚は、引いた本人にだけ見せる。出来事からもカードを消す', () => {
        const game = newGame();
        const drawn = game.deck.slice(0, 2);
        game.applyCommand(0, { type: 'drawDeck' });
        expect(createGameView(game, 0).drawn).toEqual(drawn);
        const other = createGameView(game, 1);
        expect(other.drawn).toBe(null);
        expect(other.drawnCount).toBe(2);
        expect(other.events.at(-1)).not.toHaveProperty('cards');
        expect(createGameView(game, 0).events.at(-1).cards).toEqual(drawn);
        // 残した1枚は、捨てた1枚と違ってほかの人には分からない
        game.applyCommand(0, { type: 'keep', card: drawn[0], pile: 0 });
        expect(createGameView(game, 1).discards[0].top).toBe(drawn[1]);
        expect(json(createGameView(game, 1).players[0])).not.toContain(`[${drawn[0]}]`);
    });

    it('捨て札の山は一番上だけ。カニで見ている本人にだけ全部を見せる', () => {
        const game = newGame();
        const [c1, c2, s1, s2] = pick('crab', 'crab', 'shell', 'shell');
        game.applyCommand(0, { type: 'drawDeck' });
        game.applyCommand(0, { type: 'keep', card: game.drawn[0], pile: 1 });
        setHand(game, 0, [c1, c2]);
        setPile(game, 0, [s1, s2]);
        game.applyCommand(0, { type: 'duo', cards: [c1, c2] });
        game.applyCommand(0, { type: 'crabLook', pile: 0 });
        expect(createGameView(game, 0).crab.cards).toEqual([s1, s2]);
        expect(createGameView(game, 1).crab.cards).toBe(null);
        expect(createGameView(game, 1).discards[0]).toEqual({ count: 2, top: s2 });
        game.applyCommand(0, { type: 'crabTake', card: s1 });
        expect(createGameView(game, 1).events.at(-1)).not.toHaveProperty('card');
    });

    it('ラストチャンスを宣言した人の手札は公開する', () => {
        const game = newGame();
        const hand = pick('shell', 'shell', 'shell', 'shell', 'crab', 'crab');
        game.phase = 'play';
        setHand(game, 0, hand);
        game.applyCommand(0, { type: 'lastChance' });
        const view = createGameView(game, 1);
        expect(view.players[0].revealed).toBe(true);
        expect(view.players[0].hand).toEqual(hand);
        expect(view.players[0].points).toBe(7);
    });

    it('JSON にできる', () => {
        const game = newGame();
        const view = createGameView(game, 0);
        expect(JSON.parse(json(view))).toEqual(view);
    });
});
