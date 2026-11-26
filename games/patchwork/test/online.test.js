import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（パッチワーク）', () => {
    it('2人目は席1になり、シードは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(a.last('state').view.viewer).toBe(0);
        expect(JSON.stringify(view)).not.toContain('"seed"');
    });
});
