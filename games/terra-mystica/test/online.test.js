import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { chooseCpuCommands } from '../public/js/cpu-player.js';

// ヒントの suggest は交換を除いた本命の1手なので、ここでは CPU の手順（交換を含む）の最初の1手を送る
const pick = (game, seat) => (game.state.phase !== 'end' && game.actors().includes(seat) ? chooseCpuCommands(game, seat)[0] ?? null : null);
testOnline({ definition, pick });

describe('オンライン対戦（テラミスティカ）', () => {
    it('どの席にも同じ盤面と勢力が届き、乱数のシードは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const va = a.last('state').view;
        const vb = b.last('state').view;
        expect([va.you, vb.you]).toEqual([0, 1]);
        expect(vb.state.hexes).toEqual(va.state.hexes);
        expect(vb.options.factions).toEqual(va.options.factions);
        expect(vb.options.seed).toBe(undefined);
    });
});
