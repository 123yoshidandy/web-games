import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { DECK_SIZE } from '../public/js/deck.js';
import { cpuDueTime, nextCpu, runCpuUntil, suggest, CPU_LEVELS } from '../public/js/cpu-player.js';
import { versus, snapshot } from './helpers.js';

const allCpu = (seed, count, level) => new Game(Array.from({ length: count }, (_, i) => ({ name: `C${i}`, isCPU: true })), { seed, mode: 'cpu', level });

describe('CPU', () => {
    it('取る時刻は、真ん中が変わった時刻から強さの範囲で決まり、同じ記録からは同じ時刻', () => {
        const game = versus(3, 'hard');
        const due = cpuDueTime(game, 1);
        expect(due).toBeGreaterThanOrEqual(CPU_LEVELS.hard.min);
        expect(cpuDueTime(versus(3, 'hard'), 1)).toBe(due);
        expect(cpuDueTime(game, 0)).toBe(Infinity); // 人の席
    });

    it('強いほど早く取る（多くの場で平均を比べる）', () => {
        const mean = (level) => {
            let sum = 0;
            for (let seed = 1; seed <= 300; seed++) sum += cpuDueTime(versus(seed, level), 1);
            return sum / 300;
        };
        const [easy, normal, hard] = ['easy', 'normal', 'hard'].map(mean);
        expect(easy).toBeGreaterThan(normal);
        expect(normal).toBeGreaterThan(hard);
        expect(hard).toBeGreaterThan(1000);
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
                const count = 2 + seed % 3;
                const game = allCpu(seed, count, level);
                runCpuUntil(game, Infinity, 1000);
                expect(game.isOver).toBe(true);
                expect(game.players.reduce((sum, p) => sum + p.taken, 0)).toBe(DECK_SIZE - count);
                const copy = Game.replay(game.players.map(p => ({ name: p.name, isCPU: true })), { seed, mode: 'cpu', level }, game.commands);
                expect(snapshot(copy)).toBe(snapshot(game));
            }
        }
    });

    it('おすすめは、その席のカードと真ん中のカードに共通のマーク', () => {
        const game = versus(5);
        expect(suggest(game, 0)).toEqual({ type: 'claim', symbol: game.answerFor(0), center: game.center });
    });
});
