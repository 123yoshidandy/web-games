import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ラー）', () => {
    it('袋の中は枚数だけで、ほかの人の裏返した太陽駒の値は届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり', 'あか']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.bagCount).toBeGreaterThan(0);
        expect(view).not.toHaveProperty('bag');
        expect(view.players[1].downSuns).toEqual([]);
        expect(view.players[0].downSuns).toBeNull();
        expect(view.players[2].downSuns).toBeNull();
    });
});
