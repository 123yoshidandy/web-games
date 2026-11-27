import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（デューン インペリウム）', () => {
    it('ほかの人の手札と陰謀カードは届かず、枚数だけが分かる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[0].hand).toEqual([]);
        expect(view.players[0].handCount).toBe(5);
        expect(view.players[0].deckList).toEqual([]);
        expect(view.players[1].hand.length).toBe(5);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"imperiumDeck"');
        expect(json).not.toContain('"intrigueDeck"');
        expect(json).not.toContain('"conflictDeck"');
    });
});
