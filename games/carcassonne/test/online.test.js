import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

// ヒントは CPU の判断を使う（コントローラーの hint）ので、手は定義の CPU に選ばせる
testOnline({ definition });

describe('オンライン対戦（カルカソンヌ）', () => {
    it('ロビーで決めた CPU の強さで始まり、袋の中の並びはビューに入らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('setSettings', { settings: { cpuLevel: 'easy' } });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.cpuLevel).toBe('easy');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.bagCount).toBeGreaterThan(0);
        expect(JSON.stringify(view)).not.toContain('"bag":');
    });
});
