import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（プエルトリコ）', () => {
    it('ロビーで決めた CPU の強さで始まり、2人目は席1になる。シードは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり', 'あか']);
        await a.send('setSettings', { settings: { cpuLevel: 'easy' } });
        expect(b.last('lobby').settings).toEqual({ cpuLevel: 'easy' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.cpuLevel).toBe('easy');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(JSON.stringify(view)).not.toContain('"seed"');
    });
});
