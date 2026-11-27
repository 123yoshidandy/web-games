import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ホラーファイド）', () => {
    it('ロビーで決めた怪物の数で始まり、袋と山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: '3' } });
        expect(b.last('lobby').settings).toEqual({ level: '3' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.monsters).toHaveLength(3);
        expect(view.deckCount).toBe(30);
        expect(view).not.toHaveProperty('bag');
        expect(view).not.toHaveProperty('deck');
        expect(view).not.toHaveProperty('perkDeck');
        expect(view).not.toHaveProperty('options');
    });
});
