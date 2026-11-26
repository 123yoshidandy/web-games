import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ノーサンキュー）', () => {
    it('ほかの人のチップの数と、山札の並び・抜いたカードは見えない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり', 'あか']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].chips).toBeTypeOf('number');
        expect(view.players[0].chips).toBeNull();
        expect(view.players[2].chips).toBeNull();
        expect(view.removed).toBeNull();
        expect(view).not.toHaveProperty('deck');
    });
});
