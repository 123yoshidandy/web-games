import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（コロレット）', () => {
    it('山札の並びはビューに入らず、枚数だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.deckCount).toBeGreaterThan(0);
        expect(JSON.stringify(view)).not.toContain('"deck":');
    });
});
