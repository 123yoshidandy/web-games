import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ゴーストストーリーズ）', () => {
    it('ロビーで決めた難易度で始まり、幽霊の山の並びは届かない。足りない僧は CPU', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'nightmare' } });
        expect(b.last('lobby').settings).toEqual({ level: 'nightmare' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.level).toBe('nightmare');
        expect(view.players).toHaveLength(4);
        expect(view.players.slice(2).every(p => p.isCPU)).toBe(true);
        expect(view.deckCount).toBeGreaterThan(0);
        expect(view).not.toHaveProperty('deck');
        expect(JSON.stringify(view)).not.toContain('"seed"');
    });
});
