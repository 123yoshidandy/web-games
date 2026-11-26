import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（キングダムビルダー）', () => {
    it('手番でないほかの人の地形カードと、山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b, c] = await server.createRoom(['あお', 'みどり', 'あか']);
        await a.send('start');
        const view = c.last('state').view;
        expect(view.you).toBe(2);
        const idle = view.players.find(p => p.id !== view.you && p.id !== view.active);
        expect(idle.card).toBe(null);
        expect(view.players[2].card).not.toBe(null);
        expect(JSON.stringify(view)).not.toContain('"deck"');
        expect(b.last('state').view.you).toBe(1);
    });
});
