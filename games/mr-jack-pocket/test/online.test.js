import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

testOnline({ definition });

describe('オンライン対戦（ミスター・ジャック・ポケット）', () => {
    it('刑事側のビューには、ジャックの正体とジャック側のアリバイカードが入らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['ジャック', '刑事']);
        await a.send('start');
        const jackView = a.last('state').view;
        const detectiveView = b.last('state').view;
        expect(jackView.you).toBe(0);
        expect(jackView.jack).toBeTruthy();
        expect(detectiveView.you).toBe(1);
        expect(detectiveView.jack).toBeNull();
        expect(detectiveView.jackCards).toBeNull();
    });
});
