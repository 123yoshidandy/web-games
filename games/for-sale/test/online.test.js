import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（フォーセール）', () => {
    it('ビューに山札の並びと除いたカードは入らない（枚数だけ）', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        const text = JSON.stringify(view);
        expect(text).not.toContain('"propDeck"');
        expect(text).not.toContain('"checkDeck"');
        expect(view.removed).toBe(null);
    });
});
