import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ザ・ゲーム）', () => {
    it('ほかの席の手札と山札の並びはビューに入らず、枚数だけが入る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(view.hand).toHaveLength(6);
        expect(view.players.map(p => p.handCount)).toEqual([6, 6, 6]);
        expect(view.deckCount).toBe(98 - 18);
        const text = JSON.stringify(view);
        expect(text).not.toContain('"hands"');
        expect(text).not.toContain('"deck"');
        expect(text).not.toContain('"seed"');
    });

    it('合図は番でなくても置け、全員のビューに見える', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        await b.send('command', { command: { type: 'signal', pile: 2, mark: 'stop' } });
        expect(b.last('error')).toBeFalsy();
        expect(a.last('state').view.players[1].signals).toEqual([null, null, 'stop', null]);
    });
});
