import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（麻雀）', () => {
    it('ロビーで決めた長さで始まり、ほかの人の手牌と牌山は届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('addCpu');
        await a.send('addCpu');
        await a.send('setSettings', { settings: { length: 'south' } });
        expect(b.last('lobby').settings).toEqual({ length: 'south' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.length).toBe('south');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(JSON.stringify(view)).not.toContain('"wall"');
        expect(view.players[0].hand ?? null).toBe(null);
    });
});
