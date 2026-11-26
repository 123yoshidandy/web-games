import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

testOnline({ definition });

describe('オンライン対戦（電力会社）', () => {
    it('ロビーで選んだ地図で始まり、発電所の山の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり', 'あか']);
        await a.send('setSettings', { settings: { map: 'usa' } });
        expect(b.last('lobby').settings).toEqual({ map: 'usa' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.mapId).toBe('usa');
        expect(view.deckCount).toBeGreaterThan(0);
        expect(view).not.toHaveProperty('deck');
    });
});
