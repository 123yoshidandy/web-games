import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ニムト）', () => {
    it('ビューには自分の手札だけが入り、ほかの人の手札は枚数だけ', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const viewA = a.last('state').view;
        const viewB = b.last('state').view;
        expect(viewB.hand).toHaveLength(viewA.hand.length);
        expect(viewB.hand).not.toEqual(viewA.hand);
        expect(viewB.players.every(p => !('hand' in p))).toBe(true);
    });
});
