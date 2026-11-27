import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

// 手は定義の CPU に選ばせる（suggest は打つ段階だけで、死に石を決める段階では null を返すため）
testOnline({ definition });

describe('オンライン対戦（囲碁）', () => {
    it('席0が黒で先に打ち、席1には白の番を待つビューが届く', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['くろ', 'しろ']);
        await a.send('start');
        expect(a.last('state').view.myTurn).toBe(true);
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.myTurn).toBe(false);
        expect(view.toPlay).toBe(1); // 1 が黒
    });

    it('ロビーで決めた盤の大きさで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['くろ', 'しろ']);
        await a.send('setSettings', { settings: { size: '13' } });
        expect(b.last('lobby').settings).toEqual({ size: '13', clock: 'none' });
        await a.send('start');
        expect(b.last('state').view.size).toBe(13);
    });
});
