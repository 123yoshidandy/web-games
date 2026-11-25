import { describe, it, expect } from 'vitest';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, tokens } from './helpers.js';

describe('ビュー', () => {
    it('山札の並びは入れず、枚数だけを入れる', () => {
        const game = makeGame(2);
        const view = createGameView(game, 0);
        expect(view.deckCounts).toEqual({ 1: 36, 2: 26, 3: 16 });
        expect(JSON.stringify(view)).not.toContain('decks');
        expect(view.board[1]).toEqual(game.board[1]);
    });

    it('伏せて予約したカードは本人にだけ見え、ほかの人と観戦者にはレベルだけが見える', () => {
        const game = makeGame(2);
        const top = game.decks[3][0];
        game.applyCommand(0, { type: 'reserve', level: 3 });
        const card = game.board[1][0];
        game.applyCommand(1, { type: 'reserve', card });

        const mine = createGameView(game, 0);
        expect(mine.players[0].reserved).toEqual([{ id: top, hidden: true, level: 3 }]);
        const theirs = createGameView(game, 1);
        expect(theirs.players[0].reserved).toEqual([{ id: null, hidden: true, level: 3 }]);
        expect(theirs.players[1].reserved).toEqual([{ id: card, hidden: false, level: 1 }]);
        const spectator = createGameView(game, null);
        expect(spectator.players[0].reserved[0].id).toBe(null);

        // 演出用のイベントにも、伏せたカードの中身は入らない
        const reserveEvent = theirs.events.find(e => e.type === 'reserve' && e.seat === 0);
        expect(reserveEvent.card).toBe(null);
        expect(mine.events.find(e => e.type === 'reserve' && e.seat === 0).card).toBe(top);
        // ログにも出ない
        expect(theirs.logs.join('')).not.toContain(String(top));
    });

    it('点数とボーナスを入れる。返す数と貴族の選択は手番の人にだけ入る', () => {
        const game = makeGame(2);
        game.players[0].tokens = tokens({ white: 4, blue: 4, green: 1 });
        game.applyCommand(0, { type: 'take', tokens: { red: 1, black: 1, green: 1 } });
        expect(createGameView(game, 0).discardCount).toBe(2);
        expect(createGameView(game, 1).discardCount).toBe(0);
        expect(createGameView(game, 0).players[0].points).toBe(0);
    });

    it('JSON にしても同じ内容になる（オンラインで送れる）', () => {
        const game = makeGame(4);
        const view = createGameView(game, 2);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });

    it('since より後のログだけを入れる', () => {
        const game = makeGame(2);
        const count = game.logs.length;
        game.applyCommand(0, { type: 'take', tokens: { red: 1, black: 1, green: 1 } });
        const view = createGameView(game, 0, { since: count });
        expect(view.logs).toHaveLength(1);
        expect(view.logCount).toBe(count + 1);
    });
});
