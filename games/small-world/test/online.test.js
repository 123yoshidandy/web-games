import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（スモールワールド）', () => {
    it('種族と特殊能力の山の並び（これから並ぶ組）は、どの席にも届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        // 山は枚数だけを送る
        expect(typeof view.raceDeckCount).toBe('number');
        expect(view.raceDeck).toBe(undefined);
        expect(view.powerDeck).toBe(undefined);
    });
});
