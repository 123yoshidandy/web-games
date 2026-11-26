import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（パンデミック）', () => {
    it('ロビーで決めた難易度で始まり、山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'heroic' } });
        expect(b.last('lobby').settings).toEqual({ level: 'heroic' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.level).toBe('heroic');
        expect(view.playerDeckCount).toBeGreaterThan(0);
        expect(view).not.toHaveProperty('playerDeck');
        expect(view).not.toHaveProperty('infectionDeck');
        expect(view.forecast).toBeNull();
    });
});
