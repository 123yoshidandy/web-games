import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ウイングスパン）', () => {
    it('準備で配られた候補とほかの席の手札・山札の並びは、本人にしか入らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].offer).toBeTruthy();
        expect(view.players[0].offer).toBeNull();
        expect(view.players[0].hand).toBeNull();
        expect(JSON.stringify(view)).not.toContain('"deck":');
    });
});
