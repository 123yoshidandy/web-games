import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { cpuRingTime, nextEvent, runUntil, CPU_LEVELS } from '../public/js/cpu-player.js';
import { versus, allCpu, setPiles, card, snapshot } from './helpers.js';

// 5つの場を作る（席1の CPU が見る）
function fiveTable(seed, level) {
    const game = versus(seed, { level });
    setPiles(game, [[card(0, 2)], [card(0, 3)], []]);
    game.tableVersion = seed;
    return game;
}

describe('CPU', () => {
    it('5つの場では、強さの反応の時間で鳴らし、同じ記録からは同じ時刻', () => {
        let rang = 0;
        for (let seed = 1; seed <= 50; seed++) {
            const due = cpuRingTime(fiveTable(seed, 'hard'), 1);
            expect(cpuRingTime(fiveTable(seed, 'hard'), 1)).toBe(due);
            if (due === Infinity) continue;
            rang++;
            expect(due).toBeGreaterThanOrEqual(CPU_LEVELS.hard.min);
            expect(due).toBeLessThanOrEqual(CPU_LEVELS.hard.mean + CPU_LEVELS.hard.spread);
        }
        expect(rang).toBeGreaterThan(40);
        expect(cpuRingTime(fiveTable(1, 'hard'), 0)).toBe(Infinity); // 人の席
    });

    it('強いほど早く鳴らし、見落としとまちがいが少ない', () => {
        const stats = (level) => {
            let sum = 0;
            let count = 0;
            let missed = 0;
            let wrong = 0;
            for (let seed = 1; seed <= 400; seed++) {
                const due = cpuRingTime(fiveTable(seed, level), 1);
                if (due === Infinity) missed++;
                else { sum += due; count++; }
                const near = versus(seed, { level });
                setPiles(near, [[card(0, 4)], [], []]);
                near.tableVersion = seed;
                if (cpuRingTime(near, 1) !== Infinity) wrong++;
            }
            return { mean: sum / count, missed, wrong };
        };
        const [easy, normal, hard] = ['easy', 'normal', 'hard'].map(stats);
        expect(easy.mean).toBeGreaterThan(normal.mean);
        expect(normal.mean).toBeGreaterThan(hard.mean);
        expect(easy.missed).toBeGreaterThan(hard.missed);
        expect(easy.wrong).toBeGreaterThan(normal.wrong);
        expect(normal.wrong).toBeGreaterThan(hard.wrong);
    });

    it('4つも6つもない場では鳴らさず、同じ場で2回は鳴らさない', () => {
        const game = versus(3, { level: 'easy' });
        setPiles(game, [[card(0, 1)], [card(1, 2)], []]);
        expect(cpuRingTime(game, 1)).toBe(Infinity);
        const five = fiveTable(4, 'hard');
        const due = cpuRingTime(five, 1);
        five.players[1].rangVersion = five.tableVersion;
        expect(due).not.toBe(Infinity);
        expect(cpuRingTime(five, 1)).toBe(Infinity);
    });

    it('時刻が来るまでは起こさず、来たら起きる時刻そのもので記録する', () => {
        const game = allCpu(5, 3);
        const next = nextEvent(game);
        expect(next.type).toBe('flip');
        expect(runUntil(game, next.due - 1)).toBe(0);
        expect(runUntil(game, next.due)).toBe(1);
        expect(game.commands[0]).toEqual({ seat: 0, type: 'flip', t: next.due });
    });

    it('CPU だけの試合が、どの強さ・人数でも終わりまで進み、記録から再現できる', () => {
        for (const level of ['easy', 'normal', 'hard']) {
            for (let seed = 1; seed <= 5; seed++) {
                const count = 2 + seed % 5;
                const game = allCpu(seed, count, { level, timeLimit: 'short', speed: 'fast' });
                runUntil(game, Infinity, 100000);
                expect(game.isOver).toBe(true);
                const copy = Game.replay(game.players.map(p => ({ name: p.name, isCPU: true })), { seed, mode: 'cpu', level, timeLimit: 'short', speed: 'fast' }, game.commands);
                expect(snapshot(copy)).toBe(snapshot(game));
            }
        }
    });
});
