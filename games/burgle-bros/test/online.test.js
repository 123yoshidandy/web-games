import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（バーグルブロス）', () => {
    it('ロビーで決めた階数で始まり、めくっていない部屋と山の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { floors: 3 } });
        expect(b.last('lobby').settings).toEqual({ floors: 3 });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.floorCount).toBe(3);
        expect(view.floors[0].guard.deckCount).toBeGreaterThan(0);
        const hidden = view.floors.flatMap(fl => fl.tiles).filter(t => !t.revealed);
        expect(hidden.length).toBe(3 * 16 - 1);
        expect(hidden.every(t => t.type === null && t.num === null)).toBe(true);
        const text = JSON.stringify(view);
        expect(text).not.toMatch(/"(deck|toolDeck|lootDeck|random|options)"/);
    });

    it('手番でない人の操作と、知らない操作は断り、記録に残らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const before = b.last('state').view;
        await b.send('command', { command: { type: 'pass' } });
        expect(b.last('error')).toBeTruthy();
        await a.send('command', { command: { type: 'teleport' } });
        expect(a.last('error')).toBeTruthy();
        expect(a.last('state').view.logTotal).toBe(before.logTotal);
    });

    it('協力の結果を、全員の勝ちか負けとして記録に渡す', () => {
        expect(definition.result({ result: { won: true } })).toEqual({ coop: true, won: true });
        expect(definition.result({ result: { won: false } })).toEqual({ coop: true, won: false });
        expect(definition.result({ result: null })).toBe(null);
    });
});
