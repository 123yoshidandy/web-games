import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（リバーシ）', () => {
    it('2人目は席1（白）になり、先手は1人目', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['くろ', 'しろ']);
        await a.send('start');
        const viewA = a.last('state').view;
        const viewB = b.last('state').view;
        expect(viewB.you).toBe(1);
        expect(viewA.myTurn).toBe(true);
        expect(viewA.moves.length).toBe(4);
        expect(viewB.myTurn).toBe(false);
        expect(viewB.current).toBe(0);
    });
});
