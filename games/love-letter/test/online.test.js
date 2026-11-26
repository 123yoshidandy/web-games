import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ラブレター）', () => {
    it('自分の手札だけが届き、ほかの人の手札と山札の並びは届かない。CPU の強さはロビーで決める', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { cpuLevel: 'easy' } });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.cpuLevel).toBe('easy');
        const view = b.last('state').view;
        expect(view.seat ?? view.you).toBe(1);
        const text = JSON.stringify(view);
        expect(text).not.toContain('"hands"');
        expect(text).not.toContain('"deck"');
        expect(view.hand.length).toBeGreaterThan(0);
    });
});
