import { describe, it, expect } from 'vitest';
import Game, { CARDS } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot, energy, giveBuilt } from './helpers.js';

const cpuPlayers = (n, level) => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: level }));

const playOut = (game, limit = 4000) => {
    let steps = 0;
    while (!game.isOver() && steps < limit) {
        expect(runCpuStep(game)).toBe(true);
        steps++;
    }
    return game;
};

describe('CPU', () => {
    it.each([2, 3, 4])('全員 CPU の%i人戦が、20シードとも最後まで進み、記録から再現できる', (n) => {
        for (let seed = 1; seed <= 20; seed++) {
            const level = seed % 2 === 0 ? 'easy' : 'normal';
            const game = playOut(new Game(cpuPlayers(n, level), { seed }));
            expect(game.isOver()).toBe(true);
            expect(game.endReason).toBe('gizmos');
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('同じ場面では同じ手を選ぶ', () => {
        const a = new Game(cpuPlayers(3, 'normal'), { seed: 7 });
        const b = new Game(cpuPlayers(3, 'normal'), { seed: 7 });
        expect(chooseCpuCommand(a)).toEqual(chooseCpuCommand(b));
    });

    it('山札の並びをのぞかない', () => {
        const base = new Game(cpuPlayers(2, 'normal'), { seed: 11 });
        const other = new Game(cpuPlayers(2, 'normal'), { seed: 11 });
        [1, 2, 3].forEach(level => other.decks[level].reverse());
        expect(chooseCpuCommand(other)).toEqual(chooseCpuCommand(base));
    });

    it('連鎖の場面と研究の場面でも手を選べる', () => {
        const game = new Game(players(2, true), { seed: 3, startPlayer: 0 });
        // 保管したら1個取る（黒・レベル1）を持たせ、エネルギーを上限近くにして、選ぶ場面を作る
        giveBuilt(game, 0, 20);
        game.players[0].energy = energy({ red: 4 });
        game.applyCommand(0, { type: 'file', card: game.display[1][0] });
        expect(game.phase).toBe('chain');
        expect(runCpuStep(game)).toBe(true);

        const research = new Game(players(2, true), { seed: 3, startPlayer: 0 });
        research.applyCommand(0, { type: 'research', level: 1 });
        expect(['researchBuild', 'researchFile', 'researchSkip']).toContain(chooseCpuCommand(research).type);
        expect(runCpuStep(research)).toBe(true);
        expect(research.phase).not.toBe('research');
    });

    it('建てられるギズモが一杯でも、手を返す', () => {
        const game = new Game(cpuPlayers(2, 'normal'), { seed: 5, startPlayer: 0 });
        game.players[0].energy = energy({ red: 2, yellow: 1, blue: 1, black: 1 });
        const command = chooseCpuCommand(game);
        expect(command).toBeTruthy();
        expect(game.applyCommand(0, command)).toBe(true);
    });

    it('ふつうは、やさしいより強い（200試合の勝率）', () => {
        const r = runMatches({ games: 200, count: 2, profiles: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.finished).toBe(200);
        expect(r.wins[1] / r.finished).toBeGreaterThan(0.55);
    });

    it('強さの設定がそろっている', () => {
        expect(Object.keys(PROFILES)).toEqual(['easy', 'normal', 'strong']);
        expect(CARDS.length).toBe(112);
    });
});
