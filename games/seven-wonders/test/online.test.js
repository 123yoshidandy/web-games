import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

// 3人から遊ぶので、2人の部屋には CPU が1人入る。全員が同時に選ぶ
testOnline({ definition, suggest });

describe('オンライン対戦（世界の七不思議）', () => {
    it('自分の手札だけがビューに入り、ほかの人の手札と選んだカードは公開まで届かない', async () => {
        const server = createTestServer(definition);
        const clients = await server.createRoom(['あお', 'みどり', 'き']);
        await clients[0].send('start');
        const views = clients.map(c => c.last('state').view);
        views.forEach((view, seat) => {
            expect(view.seat).toBe(seat);
            expect(view.hand).toHaveLength(7);
            view.players.forEach(player => expect(player.hand).toBeUndefined());
        });
        const [card] = views[0].hand;
        await clients[0].send('command', { command: { type: 'play', card, action: 'discard' } });
        const other = clients[1].last('state').view;
        expect(JSON.stringify(other.players)).not.toContain(card);
        expect(other.hand).toEqual(views[1].hand);
    });

    it('ロビーで決めた面と CPU の強さで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { sides: 'B', cpuLevel: 'easy' } });
        expect(b.last('lobby').settings).toEqual({ sides: 'B', cpuLevel: 'easy' });
        await a.send('addCpu');
        await a.send('start');
        expect(a.last('state').view.players.every(p => p.city.side === 'B')).toBe(true);
    });
});
