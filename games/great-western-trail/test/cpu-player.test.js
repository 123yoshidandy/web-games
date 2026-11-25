import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, cpuActors, PROFILES, expectedHandValue } from '../public/js/cpu-player.js';
import { trial } from '../public/js/rules.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';
import { makeGame, snapshot } from './helpers.js';

describe('CPU', () => {
    it('選んだ手は、いつもルールで受け付けられる', () => {
        const game = makeGame(3, 21);
        game.players.forEach(p => { p.isCPU = true; });
        for (let i = 0; i < 120 && !game.isOver(); i++) {
            const seat = game.turn;
            const command = chooseCommand(game.state, seat, PROFILES[i % 2 ? 'strong' : 'normal']);
            expect(trial(game.state, seat, command).ok).toBe(true);
            expect(game.applyCommand(seat, command)).toBe(true);
        }
    });

    it('手を選んでも、ゲームの状態を変えない（ゲームの乱数も使わない）', () => {
        const game = makeGame(4, 22);
        const before = snapshot(game);
        chooseCommand(game.state, game.turn, PROFILES.normal);
        chooseCommand(game.state, game.turn, PROFILES.strong);
        expect(snapshot(game)).toBe(before);
    });

    it('人数とシードを変えても、CPU だけの試合が最後まで進み、記録から再現できる', () => {
        for (const n of [2, 3, 4]) {
            const game = playMatch({ profiles: Array(n).fill(n === 3 ? 'strong' : 'normal'), seed: 31 + n });
            expect(game.isOver()).toBe(true);
            const copy = Game.replay(game.setup, game.options, game.commands);
            expect(JSON.stringify(copy.state)).toBe(JSON.stringify(game.state));
            expect(game.results()[0].total).toBeGreaterThan(20);
        }
    });

    it('つよいは、ふつうに勝ち越す', () => {
        const r = runMatches({ games: 6, profiles: ['strong', 'normal'], seedBase: 500 });
        expect(r.finished).toBe(6);
        expect(r.wins[0]).toBeGreaterThan(r.wins[1]);
    });

    it('人間の番では動かない', () => {
        const game = makeGame(3, 23);
        expect(cpuActors(game)).toEqual([]);
        expect(runCpuStep(game, game.turn)).toBe(false);
    });

    it('手札の繁殖値の見込み：同じ品種ばかりより、違う品種が多いほうが高い', () => {
        const mixed = ['p0jersey0', 'p0dutch0', 'p0angus0', 'p0guernsey0'];
        const same = ['p0jersey0', 'p0jersey1', 'p0jersey2', 'p0jersey3'];
        expect(expectedHandValue(mixed, 4)).toBe(7);
        expect(expectedHandValue(same, 4)).toBe(1);
        expect(expectedHandValue([...mixed, ...same], 4)).toBeLessThan(7);
    });
});
