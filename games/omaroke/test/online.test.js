import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（お前、もしかしてロケット団？）', () => {
    it('ロビーで決めたルールと CPU の強さで始まり、ほかの人の隠れた役割と手札は届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり', 'あか', 'きいろ']);
        await a.send('setSettings', { settings: { mode: 'expert', level: 'easy' } });
        expect(b.last('lobby').settings).toEqual({ mode: 'expert', level: 'easy' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options).toMatchObject({ mode: 'expert', level: 'easy' });
        const view = b.last('state').view;
        const others = view.players.filter(p => p.id !== 1 && p.role !== 'leader');
        expect(others.length).toBeGreaterThan(0);
        expect(others.every(p => p.role === null && !('hand' in p))).toBe(true);
        expect(view.hand).not.toBeNull();
    });
});
