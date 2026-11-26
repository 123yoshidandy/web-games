import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（将棋）', () => {
    it('先手と後手に、それぞれの席のビューで同じ盤面が届く', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const va = a.last('state').view;
        const vb = b.last('state').view;
        expect(va.you).toBe(0);
        expect(vb.you).toBe(1);
        expect(vb.board).toEqual(va.board);
    });
});
