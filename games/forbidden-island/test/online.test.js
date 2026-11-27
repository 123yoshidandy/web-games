import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（禁断の島）', () => {
    it('ロビーで決めた難易度で始まり、山の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'elite' } });
        expect(b.last('lobby').settings).toEqual({ level: 'elite' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.level).toBe('elite');
        expect(view.water).toBe(3);
        expect(view.treasureDeckCount).toBeGreaterThan(0);
        expect(view.floodDeckCount).toBe(18);
        // 隠れた情報：宝のカードと浸水のカードの山の並び
        const text = JSON.stringify(view);
        expect(view).not.toHaveProperty('treasureDeck');
        expect(view).not.toHaveProperty('floodDeck');
        expect(text).not.toMatch(/"(treasureDeck|floodDeck|random|options)"/);
    });

    it('手番でない人も特別なカードを使える。断られた操作は記録に残らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const before = b.last('state').view;
        await b.send('command', { command: { type: 'sand', tile: 99 } });
        expect(b.last('error')).toBeTruthy();
        await b.send('command', { command: { type: 'draw' } });
        expect(a.last('state').view.logTotal).toBe(before.logTotal);
    });
});
