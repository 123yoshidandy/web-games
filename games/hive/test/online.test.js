import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ハイブ）', () => {
    it('席0が先手で、席1には相手の番を待つビューが届く', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['くろ', 'しろ']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.current).toBe(0);
        expect(a.last('state').view.current).toBe(0);
    });
});
