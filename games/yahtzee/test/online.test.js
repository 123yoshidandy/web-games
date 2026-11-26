import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ヤッツィー）', () => {
    it('各席のビューの seat はその席で、全員が同じ点数表を見る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const va = a.last('state').view;
        const vb = b.last('state').view;
        expect(va.seat ?? va.you).toBe(0);
        expect(vb.seat ?? vb.you).toBe(1);
        expect(vb.players).toHaveLength(2);
        expect(vb.players.map(p => p.name)).toEqual(va.players.map(p => p.name));
    });
});
