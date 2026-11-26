import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（アズール）', () => {
    it('ビューに袋の中の並びは入らず、ロビーで決めた CPU の強さで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'easy' } });
        expect(b.last('lobby').settings).toEqual({ level: 'easy' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.level).toBe('easy');
        const text = JSON.stringify(b.last('state').view);
        expect(text).not.toContain('"bag"');
        expect(b.last('state').view.viewer).toBe(1);
    });
});
