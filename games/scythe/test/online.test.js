import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（大鎌戦役）', () => {
    it('ほかの人の戦闘カードと目標は枚数だけで、山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].objectives).toHaveLength(view.players[1].objectiveCount);
        expect(view.players[0].objectives).toBeNull();
        expect(view.players[0].cards).toBeNull();
        expect(view.decks.combat).toBeTypeOf('number');
    });

    it('部屋の席とゲームの席がそろう（手番の順はマットの番号の順のまま）', async () => {
        for (const seed of [1, 2, 3, 4]) {
            const server = createTestServer(definition, { seed });
            const [a] = await server.createRoom(['あお', 'みどり', 'あか']);
            await a.send('start');
            const room = await server.store.getRoom(a.last('joined').roomCode);
            const view = a.last('state').view;
            expect(view.players.map(p => p.name)).toEqual(room.players.map(p => p.name));
            expect(view.players.map(p => p.isCPU)).toEqual(room.players.map(p => Boolean(p.isCPU)));
        }
    });
});
