import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（スターレルム）', () => {
    it('自分の手札だけが届き、相手の手札と山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        [a, b].forEach((client, seat) => {
            const view = client.last('state').view;
            expect(view.you).toBe(seat);
            expect(Array.isArray(view.players[seat].hand)).toBe(true);
            expect(view.players[1 - seat].hand).toBe(null);
            expect(view.players[seat].deck).toBe(undefined);
        });
    });
});
