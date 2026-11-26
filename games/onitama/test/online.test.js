import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（オニタマ）', () => {
    it('2人目は席1になり、打てる手は自分の番のときだけ届く。シードは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('start');
        const viewA = a.last('state').view;
        const viewB = b.last('state').view;
        expect(viewB.you).toBe(1);
        const mover = viewA.current === 0 ? viewA : viewB;
        const waiter = mover === viewA ? viewB : viewA;
        expect(mover.moves.length).toBeGreaterThan(0);
        expect(waiter.moves).toEqual([]);
        expect(JSON.stringify(viewB)).not.toContain('"seed"');
    });
});
