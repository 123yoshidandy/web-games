import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（レイルロードインク）', () => {
    it('全員が同時に描く：始まると2人とも描ける席になり、同じダイスの目が届く', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const viewA = a.last('state').view;
        const viewB = b.last('state').view;
        expect(viewB.you).toBe(1);
        expect(viewA.actors).toEqual(expect.arrayContaining([0, 1]));
        expect(viewB.dice).toEqual(viewA.dice);
        expect(viewB.dice).toHaveLength(4);
    });
});
