import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ブラフ）', () => {
    it('ほかの席のカップの中のダイスはビューに入らず、数と見せた目だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].dice).toHaveLength(5);
        expect(view.players[0].dice).toBeNull();
        expect(view.players[0].count).toBe(5);
        expect(view.players[0].shown).toEqual([]);
    });
});
