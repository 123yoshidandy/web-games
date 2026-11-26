import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ティチュー）', () => {
    it('4人で始まり、ほかの席の手札はビューに入らず、枚数だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('addCpu');
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.players).toHaveLength(4);
        expect(view.hand.length).toBeGreaterThan(0);
        expect(view.players.every(p => typeof p.count === 'number')).toBe(true);
        expect(JSON.stringify(view)).not.toContain('"hands":');
    });

    it('出来事の出る手を打つと、ほかの席のビューにその出来事が届く（印とビューの絞り方の単位がそろっている）', async () => {
        const server = createTestServer(definition);
        const clients = await server.createRoom(['あか', 'あお']);
        await clients[0].send('addCpu');
        await clients[0].send('addCpu');
        await clients[0].send('start');
        // 最初の手（グランド・ティチューの宣言・札の交換）は出来事を出さないので、出来事が出るまで人の席が打つ
        const code = clients[0].last('joined').roomCode;
        let delivered = false;
        for (let step = 0; step < 40 && !delivered; step++) {
            const room = await server.store.getRoom(code);
            const game = definition.restore(structuredClone(room.game), room);
            const seat = [0, 1].find(s => suggest(game, s));
            if (seat === undefined) break;
            const before = game.eventSeq;
            await clients[seat].send('command', { command: suggest(game, seat) });
            const after = definition.restore(structuredClone((await server.store.getRoom(code)).game)).eventSeq;
            if (after > before) {
                expect(clients[1 - seat].last('state').view.events.length).toBeGreaterThan(0);
                delivered = true;
            }
        }
        expect(delivered).toBe(true);
    });
});
