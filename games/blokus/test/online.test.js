import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ブロックス）', () => {
    it('2人では各席が2色ずつ受け持ち、各席のビューの you はその席になる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(a.last('state').view.you).toBe(0);
        expect(view.you).toBe(1);
        expect(view.owners.filter(owner => owner === 1)).toHaveLength(2);
        expect(view.owners.filter(owner => owner === 0)).toHaveLength(2);
    });
});
