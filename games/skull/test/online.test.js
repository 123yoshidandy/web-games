import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（スカル）', () => {
    it('自分の手と伏せた札だけが届き、ほかの人の伏せた札の中身は届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.hand).toEqual(expect.objectContaining({ F: expect.any(Number), S: expect.any(Number) }));
        expect(Array.isArray(view.myStack)).toBe(true);
        expect(JSON.stringify(view.players)).not.toContain('"stack":');
    });
});
