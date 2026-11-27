import { describe, it, expect } from 'vitest';
import Game, { findSets } from '../public/js/game.js';
import { cpuDueTime, cpuChoice, nextCpu, runCpuUntil, CPU_LEVELS } from '../public/js/cpu-player.js';
import { versus, snapshot } from './helpers.js';

const allCpu = (seed, levels) => new Game(levels.map((level, i) => ({ name: `C${i}`, isCPU: true })), { seed, mode: 'cpu', level: levels[0] });

describe('CPU', () => {
    it('取る時刻は、場が変わった時刻から強さの範囲で決まり、同じ記録からは同じ時刻', () => {
        const game = versus(3, 'hard');
        const due = cpuDueTime(game, 1);
        expect(due).toBeGreaterThanOrEqual(CPU_LEVELS.hard.min);
        expect(cpuDueTime(versus(3, 'hard'), 1)).toBe(due);
        expect(cpuDueTime(game, 0)).toBe(Infinity); // 人の席
        expect(cpuChoice(game, 1)).toEqual(cpuChoice(versus(3, 'hard'), 1));
    });

    it('強いほど早く取る（多くの場で平均を比べる）', () => {
        const mean = (level) => {
            let sum = 0;
            for (let seed = 1; seed <= 200; seed++) sum += cpuDueTime(versus(seed, level), 1);
            return sum / 200;
        };
        const [easy, normal, hard] = ['easy', 'normal', 'hard'].map(mean);
        expect(easy).toBeGreaterThan(normal);
        expect(normal).toBeGreaterThan(hard);
    });

    it('時刻が来るまでは取らず、来たら取る時刻そのもので記録する', () => {
        const game = versus(4, 'normal', 1);
        const next = nextCpu(game);
        expect(runCpuUntil(game, next.due - 1)).toBe(0);
        expect(runCpuUntil(game, next.due)).toBe(1);
        expect(game.commands[0]).toMatchObject({ seat: 1, t: next.due });
        expect(game.players[1].score).toBe(1);
    });

    it('CPU だけの試合が、どの強さ・人数でも終わりまで進み、記録から再現できる', () => {
        for (const level of ['easy', 'normal', 'hard']) {
            for (let seed = 1; seed <= 6; seed++) {
                const game = allCpu(seed, Array.from({ length: 2 + seed % 3 }, () => level));
                runCpuUntil(game, Infinity, 1000);
                expect(game.isOver).toBe(true);
                expect(findSets(game.board)).toHaveLength(0);
                const copy = Game.replay(game.players.map(p => ({ name: p.name, isCPU: true })), { seed, mode: 'cpu', level }, game.commands);
                expect(snapshot(copy)).toBe(snapshot(game));
            }
        }
    });
});
