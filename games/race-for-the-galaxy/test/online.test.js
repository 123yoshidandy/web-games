import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（レース・フォー・ザ・ギャラクシー）', () => {
    it('ロビーで決めた設定で始まり、ほかの人の手札と山札の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { cpuLevel: 'easy', advanced: true } });
        expect(b.last('lobby').settings).toEqual({ cpuLevel: 'easy', advanced: true });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options).toMatchObject({ cpuLevel: 'easy', advanced: true });
        const viewA = a.last('state').view;
        const viewB = b.last('state').view;
        expect(viewB.seat).toBe(1);
        expect(viewB.hand).toHaveLength(viewB.players[1].handCount);
        expect(viewB.players.every(p => !('hand' in p))).toBe(true);
        expect(viewB.hand).not.toEqual(viewA.hand);
        expect(viewB).not.toHaveProperty('deck');
    });
});
