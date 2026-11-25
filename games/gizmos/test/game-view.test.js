import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players } from './helpers.js';

describe('ビュー', () => {
    it('山札の並びは入れず、枚数だけを入れる', () => {
        const game = new Game(players(2), { seed: 3, startPlayer: 0 });
        const view = createGameView(game, 0);
        expect(view.deckCounts).toEqual({ 1: 32, 2: 33, 3: 14 });
        expect(JSON.stringify(view)).not.toContain('decks');
        expect(JSON.stringify(view)).not.toContain('dispenser"');
        expect(view.display[1]).toEqual(game.display[1]);
        expect(view.players[0].limits).toEqual({ storage: 5, archive: 1, research: 3 });
    });

    it('研究で引いたカードは本人にだけ見え、ほかの人と観戦者には枚数だけ', () => {
        const game = new Game(players(2), { seed: 3, startPlayer: 0 });
        const top = game.decks[2].slice(0, 3);
        game.applyCommand(0, { type: 'research', level: 2 });
        expect(createGameView(game, 0).research).toEqual({ level: 2, count: 3, cards: top });
        expect(createGameView(game, 1).research).toEqual({ level: 2, count: 3, cards: null });
        expect(createGameView(game, null).research.cards).toBe(null);
        // ほかの人のビューのどこにも、引いたカードの番号が出ない（場にあるものを除く）
        const other = JSON.stringify(createGameView(game, 1));
        expect(other).not.toContain(`"cards":[${top[0]}`);
    });

    it('JSON にしても同じ形のまま', () => {
        const game = new Game(players(3), { seed: 4 });
        const view = createGameView(game, 1);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
