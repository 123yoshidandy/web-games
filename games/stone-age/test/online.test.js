import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ストーンエイジ）', () => {
    it('文明カードの山と建物の山の中は届かず、枚数と一番上だけが見える', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(typeof view.civDeckCount).toBe('number');
        expect(view.civDeck).toBe(undefined);
        view.stacks.forEach(stack => expect(Object.keys(stack).sort()).toEqual(['count', 'top']));
    });
});
