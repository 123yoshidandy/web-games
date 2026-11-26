import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（街コロ）', () => {
    it('ロビーで足した CPU は「ふつう」で打ち、各席に自分の席のビューが届く', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('addCpu');
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.players[2]).toMatchObject({ isCPU: true, cpuLevel: 'normal' });
        expect(b.last('state').view.you).toBe(1);
    });
});
