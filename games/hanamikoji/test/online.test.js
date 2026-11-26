import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（花見小路）', () => {
    it('相手の手札と、配った出来事の相手の札は届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[0].hand).toBe(null);
        expect(view.players[1].hand.length).toBeGreaterThan(0);
        expect(JSON.stringify(view)).not.toContain('"hands"');
    });
});
