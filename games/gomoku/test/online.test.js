import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

// 手は定義の CPU に選ばせる
testOnline({ definition });

describe('オンライン対戦（五目並べ）', () => {
    it('黒の席から打ち、もう一方には待つビューが届く', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('start');
        const va = a.last('state').view;
        const vb = b.last('state').view;
        expect(va.you).toBe(0);
        expect(vb.you).toBe(1);
        expect(va.myTurn).not.toBe(vb.myTurn);
        const black = va.colors[0] === 1 ? 0 : 1;
        expect([va, vb][black].myTurn).toBe(true);
    });

    it('ロビーで決めた盤の大きさで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('setSettings', { settings: { size: '10' } });
        expect(b.last('lobby').settings).toEqual({ size: '10', clock: 'none' });
        await a.send('start');
        expect(b.last('state').view.size).toBe(10);
    });
});
