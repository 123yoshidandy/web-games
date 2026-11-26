import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ヴィティカルチャー）', () => {
    it('ほかの席の手札と山札の並びはビューに入らず、種類ごとの枚数だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[0].hand).toEqual([]);
        expect(Object.values(view.decks).some(n => n > 0)).toBe(true);
        expect(Object.values(view.decks).every(n => typeof n === 'number')).toBe(true);
    });
});
