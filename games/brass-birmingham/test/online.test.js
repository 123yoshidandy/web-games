import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

// ヒントの suggest は状態（state）を受け取る形なので、ゲームの状態を渡す
testOnline({ definition, pick: (game, seat) => suggest(game.state, seat) });

describe('オンライン対戦（ブラス：バーミンガム）', () => {
    it('ほかの席の手札と山札の中身はビューに入らず、枚数だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.state.players[1].hand.length).toBeGreaterThan(0);
        expect(view.state.players[0].hand).toEqual([]);
        expect(view.state.players[0].handCount).toBeGreaterThan(0);
        expect(view.state.deck).toEqual([]);
        expect(view.state.deckCount).toBeGreaterThan(0);
    });
});
