import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ザ・クルー）', () => {
    it('ほかの席の手札はビューに入らず、枚数だけが入る。部屋はミッション1から始める', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(view.mission).toBe(1);
        expect(view.hand.length).toBeGreaterThan(0);
        expect(view.players[0].handCount).toBeGreaterThan(0);
        expect(JSON.stringify(view)).not.toContain('"hands":');
    });
});
