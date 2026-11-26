import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（あやつり人形）', () => {
    it('ほかの席の手札と、まだ明かしていない役割はビューに入らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].hand.length).toBeGreaterThan(0);
        expect(view.players[0].hand).toBeNull();
        expect(view.players[0].handCount).toBeGreaterThan(0);
        expect(view.players[0].characters).toEqual([]);
        expect(JSON.stringify(view)).not.toContain('"deck":');
    });
});
