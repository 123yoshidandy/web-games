import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（センチュリー：スパイスロード）', () => {
    it('ほかの席の手札と山札の並びはビューに入らず、枚数だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.players[1].hand.length).toBeGreaterThan(0);
        expect(view.players[0].hand).toBeNull();
        expect(view.players[0].handCount).toBeGreaterThan(0);
        expect(JSON.stringify(view)).not.toContain('"deck":');
    });

    it('1手打つと、ほかの席のビューにその手の出来事が届く（印とビューの絞り方の単位がそろっている）', async () => {
        const server = createTestServer(definition);
        const clients = await server.createRoom(['あか', 'あお']);
        await clients[0].send('start');
        const room = await server.store.getRoom(clients[0].last('joined').roomCode);
        const game = definition.restore(structuredClone(room.game), room);
        const seat = [0, 1].find(s => suggest(game, s));
        expect(seat).toBeDefined();
        await clients[seat].send('command', { command: suggest(game, seat) });
        const other = clients[1 - seat];
        expect(other.last('state').view.events.length).toBeGreaterThan(0);
    });
});
