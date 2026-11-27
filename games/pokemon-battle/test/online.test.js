import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';
import { team, TEAM_B } from './helpers.js';

testOnline({ definition, suggest });

describe('オンライン対戦（ポケモン6対6）', () => {
    it('両方の編成がそろうまで、相手の手持ちは届かない。そろうと対戦が始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'みどり']);
        await a.send('start');
        expect(a.last('state').view.phase).toBe('setup');
        await a.send('command', { command: { type: 'team', team: team() } });
        const seen = b.last('state').view;
        expect(seen.sides).toBe(null);
        expect(seen.players[0].ready).toBe(true);
        expect(JSON.stringify(b.messages)).not.toContain('charizard');
        await b.send('command', { command: { type: 'team', team: team(TEAM_B) } });
        const view = a.last('state').view;
        expect(view.phase).toBe('battle');
        expect(view.sides[1].units.map(u => u.id)).toEqual(TEAM_B);
        expect(view.sides[1].units[0].rules).toBe(null);
        expect(JSON.stringify(view)).not.toMatch(/"(seed|random|teams)"/);
    });

    it('手番でない人の操作と、知らない操作は断り、記録に残らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'みどり']);
        await a.send('start');
        await a.send('command', { command: { type: 'team', team: team() } });
        await b.send('command', { command: { type: 'team', team: team(TEAM_B) } });
        const view = a.last('state').view;
        const waiting = view.current === 0 ? b : a;
        const before = view.logTotal;
        await waiting.send('command', { command: { type: 'end' } });
        expect(waiting.last('error')).toBeTruthy();
        await a.send('command', { command: { type: 'teleport' } });
        expect(a.last('error')).toBeTruthy();
        expect(a.last('state').view.logTotal).toBe(before);
    });

    it('勝った席を記録に渡す（引き分けは両方）', () => {
        expect(definition.result({ result: { winner: 1 } })).toEqual({ winners: [1] });
        expect(definition.result({ result: { winner: null } })).toEqual({ winners: [0, 1] });
        expect(definition.result({ result: null })).toBe(null);
    });
});
