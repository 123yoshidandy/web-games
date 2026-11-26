import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（インチキ薬師）', () => {
    it('袋の中は種類ごとの数だけで、引く順は届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        view.players.forEach(p => {
            expect(Array.isArray(p.bag)).toBe(false);
            expect(Object.values(p.bag).reduce((s, n) => s + n, 0)).toBe(p.bagCount);
        });
        expect(view).not.toHaveProperty('fortuneDeck');
    });
});
