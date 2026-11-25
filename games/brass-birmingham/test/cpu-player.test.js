import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';
import { trial } from '../public/js/rules.js';
import { playMatch } from '../scripts/cpu-match.mjs';
import { makeGame, snapshot } from './helpers.js';

describe('CPU', () => {
    it('選んだ手は、いつもルールで受け付けられる', () => {
        const game = makeGame(3, 21);
        game.players.forEach(p => { p.isCPU = true; });
        for (let i = 0; i < 40 && !game.isOver(); i++) {
            const seat = game.turn;
            const command = chooseCommand(game.state, seat, PROFILES.strong);
            expect(trial(game.state, seat, command).ok).toBe(true);
            expect(game.applyCommand(seat, command)).toBe(true);
        }
    });

    it('手を選んでも、ゲームの状態を変えない（乱数も使わない）', () => {
        const game = makeGame(4, 22);
        const before = snapshot(game);
        chooseCommand(game.state, game.turn, PROFILES.normal);
        chooseCommand(game.state, game.turn, PROFILES.strong);
        expect(snapshot(game)).toBe(before);
    });

    it('人数とシードを変えても、CPU だけの試合が最後まで進み、記録から再現できる', () => {
        for (const n of [2, 3, 4]) {
            for (const seed of [1, 2]) {
                const game = playMatch({ profiles: Array(n).fill(seed === 1 ? 'normal' : 'strong'), seed: seed * 31 + n });
                expect(game.isOver()).toBe(true);
                expect(game.commands.length).toBe({ 2: 78, 3: 105, 4: 124 }[n] - game.commands.filter(c => c.command.type === 'scout').length * 2);
                const copy = Game.replay(game.setup, game.options, game.commands);
                expect(JSON.stringify(copy.state)).toBe(JSON.stringify(game.state));
                expect(game.results()[0].vp).toBeGreaterThan(20);
            }
        }
    });

    it('人間の番では動かない', () => {
        const game = makeGame(3, 23);
        expect(cpuActors(game)).toEqual([]);
        expect(runCpuStep(game, (game.turn + 1) % 3)).toBe(false);
    });
});
