import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

// 2人の協力ゲーム。機長（席0）と副操縦士（席1）が交互に置く
testOnline({ definition, suggest });

describe('オンライン対戦（スカイチーム）', () => {
    it('自分のダイスの目だけがビューに入り、相手のまだ置いていない目は届かない', async () => {
        const server = createTestServer(definition);
        const clients = await server.createRoom(['きちょう', 'ふく']);
        await clients[0].send('start');
        const room = await server.store.getRoom(clients.code);
        const game = definition.restore(structuredClone(room.game));
        clients.forEach((client, seat) => {
            const view = client.last('state').view;
            expect(view.seat).toBe(seat);
            expect(view.dice.map(d => d.value)).toEqual(game.dice[seat].map(d => d.value));
            expect(view.players[1 - seat].diceLeft).toBe(4);
            expect(JSON.stringify(view)).not.toContain('"dice":[[');
        });
    });

    it('ロビーで決めた空港で始まる', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['きちょう']);
        await a.send('setSettings', { settings: { airport: 'KUL', cpuLevel: 'hard' } });
        await a.send('addCpu');
        await a.send('start');
        expect(a.last('state').view.airport.key).toBe('KUL');
    });
});
