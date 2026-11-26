import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ハーツ）', () => {
    it('自分の手札だけが届き、ほかの人の手札は届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('addCpu');
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.hand.length).toBe(13);
        expect(JSON.stringify(view)).not.toContain('"hands"');
    });
});
