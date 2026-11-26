import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（サントリーニ）', () => {
    it('ロビーで「神の力あり」にすると、2人の対戦で両方に神が配られる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('setSettings', { settings: { gods: true, level: 'easy' } });
        expect(b.last('lobby').settings).toEqual({ level: 'easy', gods: true });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.players.every(p => typeof p.god === 'string')).toBe(true);
    });
});
