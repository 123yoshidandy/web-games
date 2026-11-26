import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

// 手は定義の CPU に選ばせる（suggest は手番の行動だけで、効果の途中の選択では null を返すため）
testOnline({ definition });

describe('オンライン対戦（エバーデール）', () => {
    it('ビューに、ほかの人の手札と山札の並びは入らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['はる', 'あき']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[0].hand).toBe(null);
        expect(Array.isArray(view.players[1].hand)).toBe(true);
        expect(JSON.stringify(view)).not.toContain('"deck":');
    });
});
