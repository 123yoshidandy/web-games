import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

// 手は定義の CPU に選ばせる（suggest は手番の行動だけで、連鎖・研究の途中では null を返すため）
testOnline({ definition });

describe('オンライン対戦（ギズモ）', () => {
    it('ビューに山札の並びは入らず、枚数だけが届く', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(JSON.stringify(view)).not.toContain('"decks"');
        expect(Object.values(view.deckCounts).every(n => Number.isInteger(n))).toBe(true);
    });
});
