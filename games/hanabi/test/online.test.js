import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（花火）', () => {
    it('自分の札の中身と山札の並びは届かず、ほかの人の札は見える', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(view.players[1].hand.every(card => card.color === null && card.rank === null)).toBe(true);
        expect(view.players[0].hand.every(card => card.color !== null && card.rank !== null)).toBe(true);
        expect(JSON.stringify(view)).not.toContain('"deck"');
    });
});
