import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（コリドール）', () => {
    it('ロビーで決めた CPU の強さで始まり、2人目は席1になる。手番でない席には打てる手が届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('setSettings', { settings: { level: 'easy' } });
        expect(b.last('lobby').settings).toEqual({ level: 'easy' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.level).toBe('easy');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.current).toBe(0);
        expect(view.moves).toEqual([]);
        expect(a.last('state').view.moves.length).toBeGreaterThan(0);
    });
});
