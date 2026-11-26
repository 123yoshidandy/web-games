import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

// ヒントの suggest はビューを受け取る形なので渡さない（定義の CPU にその席の手を選ばせる）
testOnline({ definition });

describe('オンライン対戦（アグリコラ）', () => {
    it('各席のビューは自分の席から見たもので、ロビーで足した CPU は CPU の席として始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('addCpu');
        await a.send('start');
        expect(a.last('state').view.you).toBe(0);
        expect(b.last('state').view.you).toBe(1);
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.players.map(p => p.isCPU)).toEqual([false, false, true]);
    });
});
