import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, legalActions, PROFILES, LEVELS } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot } from './helpers.js';

describe('CPU', () => {
    it('CPU だけの試合が、人数と強さを変えても最後まで進む', () => {
        [[2, 'strong'], [3, 'normal'], [4, 'normal'], [4, 'random']].forEach(([n, level]) => {
            const r = runMatches({ games: 3, profiles: Array(n).fill(level) });
            expect(r.finished, `${n}人 ${level}`).toBe(3);
        });
    });

    it('CPU の判断はゲームの乱数を使わない（同じ状態からは同じ手で、記録の再現がずれない）', () => {
        const a = new Game(players(2, true), { seed: 9 });
        const b = new Game(players(2, true), { seed: 9 });
        for (let i = 0; i < 30; i++) {
            runCpuStep(a, cpuActors(a)[0], PROFILES.strong);
            runCpuStep(b, cpuActors(b)[0], PROFILES.strong);
        }
        expect(snapshot(a)).toBe(snapshot(b));
        expect(a.commands.length).toBeGreaterThanOrEqual(30);
    });

    it('手番の行動の候補は、すべてゲームが受け付ける', () => {
        const game = new Game(players(3, true), { seed: 4 });
        legalActions(game, game.turn).forEach(command => {
            const copy = game.clone();
            expect(copy.applyCommand(game.turn, command), JSON.stringify(command)).toBe(true);
        });
    });

    it('強い CPU は、ふつうの CPU に勝ち越す', () => {
        const r1 = runMatches({ games: 12, profiles: ['strong', 'normal'] });
        const r2 = runMatches({ games: 12, profiles: ['normal', 'strong'], seedBase: 101 });
        const strongWins = r1.wins[0] + r2.wins[1];
        expect(strongWins / 24).toBeGreaterThan(0.6);
    });

    it('画面で選べる強さは2段階', () => {
        expect(Object.keys(LEVELS)).toEqual(['normal', 'strong']);
    });
});
