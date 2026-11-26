import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（グレート・ウエスタン・トレイル）', () => {
    it('ほかの人の手札は届かず、枚数だけが分かる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        const other = view.state.players[0];
        expect(other.hand).toEqual([]);
        expect(other.handCount).toBeGreaterThan(0);
        expect(view.state.players[1].hand.length).toBe(other.handCount);
    });
});
