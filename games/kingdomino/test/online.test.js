import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（キングドミノ）', () => {
    it('ロビーで決めた追加ルールで始まり、山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { harmony: true } });
        expect(b.last('lobby').settings).toEqual({ middleKingdom: false, harmony: true });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.harmony).toBe(true);
        expect(JSON.stringify(b.last('state').view)).not.toContain('"deck"');
    });
});
