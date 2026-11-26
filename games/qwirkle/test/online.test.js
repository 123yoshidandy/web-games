import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（クワークル）', () => {
    it('ビューには自分の手札だけが入り、袋の中は枚数だけ', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].hand).toHaveLength(view.players[1].handCount);
        expect(view.players[0].hand).toBeNull();
        expect(view.bagCount).toBeGreaterThan(0);
        expect(view).not.toHaveProperty('bag');
    });
});
