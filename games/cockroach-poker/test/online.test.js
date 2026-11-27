import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest } from '../public/js/cpu-player.js';

// ヒントの suggest はビューを受け取る形なので、その席のビューを作って渡す
testOnline({ definition, pick: (game, seat) => suggest(createGameView(game, seat)) });

describe('オンライン対戦（おばけポーカー）', () => {
    it('ほかの席の手札はビューに入らず、枚数だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].hand.length).toBeGreaterThan(0);
        expect(view.players[0].hand).toBeNull();
        expect(view.players[0].handCount).toBeGreaterThan(0);
    });
});
