import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（お邪魔者）', () => {
    it('ビューには自分の役割と手札だけが入り、ほかの人の役割・手札と山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b, c] = await server.createRoom(['あお', 'みどり', 'あか']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(['digger', 'saboteur']).toContain(view.role);
        expect(view.hand.length).toBe(view.players[1].handCount);
        expect(view.players.every(p => !('role' in p) && !('hand' in p))).toBe(true);
        expect(view).not.toHaveProperty('deck');
        expect(c.last('state').view.hand).not.toEqual(view.hand);
    });
});
