import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（イスタンブール）', () => {
    it('ほかの人のボーナスカードと山札の並びは届かず、枚数だけが分かる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[0].cards).toBe(null);
        expect(Array.isArray(view.players[1].cards)).toBe(true);
        expect(JSON.stringify(view)).not.toContain('"deck"');
        expect(Number.isInteger(view.deckCount)).toBe(true);
    });
});
