import { describe, it, expect } from 'vitest';
import { testOnline, randomKeysIn } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { encodeTactic, decodeTactic } from '../public/js/codec.js';
import { BUILTIN } from '../public/js/cpu-tactics.js';
import { runBattle, hashBattle } from '../public/js/battle.js';

// 席の今の手：まだ戦術を出していなければ、組み込みの戦術を出す
const pick = (game, seat) => (game.phase === 'submit' && !game.tactics[seat] ? { type: 'submit', tactic: encodeTactic(BUILTIN.sample) } : null);

testOnline({ definition, pick });

describe('オンライン対戦（3rd Force）', () => {
    const submit = (client, tactic) => client.send('command', { command: { type: 'submit', tactic: encodeTactic(tactic) } });

    it('そろうまで、相手の戦術とシードはビューに入らない。そろったら記録が届き、手元で同じ対戦を流せる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'あか']);
        await a.send('start');
        await submit(a, BUILTIN.offense);
        const before = [...a.all('state'), ...b.all('state')].map((m) => m.view);
        for (const view of before) {
            expect(view.battle).toBeNull();
            expect(randomKeysIn(view)).toEqual([]);
        }
        expect(b.last('state').view.players[0].submitted).toBe(true);
        expect(JSON.stringify(b.last('state').view)).not.toContain(encodeTactic(BUILTIN.offense));
        await submit(b, BUILTIN.random);
        const view = a.last('state').view;
        expect(view.phase).toBe('over');
        expect(b.last('state').view.battle).toEqual(view.battle);
        const local = runBattle({ seed: view.battle.seed, tactics: view.battle.tactics.map(decodeTactic) });
        expect(local.winner).toBe(view.result.winner);
        expect(local.sides.map((s) => s.life)).toEqual(view.result.life);
        expect(hashBattle(local)).toBe(hashBattle(runBattle({ seed: view.battle.seed, tactics: [BUILTIN.offense, BUILTIN.random] })));
    });

    it('壊れた戦術・二度目の提出は断る', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['あお', 'あか']);
        await a.send('start');
        await a.send('command', { command: { type: 'submit', tactic: 'AAAA' } });
        expect(a.last('error')).toBeTruthy();
        await submit(a, BUILTIN.sample);
        const errors = a.all('error').length;
        await submit(a, BUILTIN.offense);
        expect(a.all('error').length).toBe(errors + 1);
    });

    it('CPU の席は、ロビーで選んだ組み込みの戦術を出す。再戦では勝ち数を引き継ぐ', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['あお']);
        await a.send('setSettings', { settings: { cpu: 'offense' } });
        await a.send('addCpu');
        await a.send('start');
        expect(a.last('state').view.players[1].submitted).toBe(true);
        await submit(a, BUILTIN.random);
        const view = a.last('state').view;
        expect(view.battle.tactics[1]).toBe(encodeTactic(BUILTIN.offense));
        expect(view.wins[1]).toBe(1);
        await a.send('ready', { ready: true });
        expect(a.last('state').view.phase).toBe('submit');
        expect(a.last('state').view.wins).toEqual([0, 1]);
    });

    it('名前を変える前の CPU の id を選んでも、今の戦術に読み替える', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['あお']);
        await a.send('setSettings', { settings: { cpu: 'kazuki' } });
        await a.send('addCpu');
        await a.send('start');
        await submit(a, BUILTIN.random);
        expect(a.last('state').view.battle.tactics[1]).toBe(encodeTactic(BUILTIN.offense));
    });
});
