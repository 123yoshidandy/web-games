import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ショッテントッテン）', () => {
    it('ロビーで決めた戦術カードの有無で始まり、相手の手札と山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('setSettings', { settings: { tactics: true } });
        expect(b.last('lobby').settings).toEqual({ tactics: true });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.tactics).toBe(true);
        expect(view.players[1].hand).toHaveLength(view.players[1].handCount);
        expect(view.players[0].hand).toBeNull();
        expect(view).not.toHaveProperty('deck');
    });
});
