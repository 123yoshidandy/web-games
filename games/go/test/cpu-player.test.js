import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { decide, runCpuStep, isCpuTurn, cpuSeat, PLAYOUTS, CPU_LEVELS } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, setPosition, at } from './helpers.js';

const FINAL = [
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....'
];

describe('CPU', () => {
    it('強さは4段階で、強いほど多く読む。盤が大きいほど回数を減らす', () => {
        expect(CPU_LEVELS).toEqual(['easy', 'normal', 'strong', 'expert']);
        for (const size of [9, 13, 19]) {
            const counts = CPU_LEVELS.map(level => PLAYOUTS[level][size]);
            expect([...counts].sort((a, b) => a - b)).toEqual(counts);
        }
        expect(PLAYOUTS.expert[19]).toBeLessThanOrEqual(PLAYOUTS.expert[9]);
    });

    it('CPU どうしの対局が、どの盤でも最後まで終わる', () => {
        for (const size of [9, 13]) {
            const r = runMatches({ games: 2, a: 'easy', b: 'easy', size, seedBase: size });
            expect(r.finished).toBe(2);
            expect(r.stuck).toBe(0);
        }
    });

    it('ふつうは、やさしいに勝ち越す（9路）', () => {
        const r = runMatches({ games: 4, a: 'normal', b: 'easy', size: 9, seedBase: 11 });
        expect(r.finished).toBe(4);
        expect(r.winsA).toBeGreaterThanOrEqual(3);
    });

    it('相手がパスし、今終わっても勝っているならパスする', () => {
        const game = new Game(players([false, true], 'normal'), { size: 9, komi: 6.5 });
        setPosition(game, FINAL, 0);
        game.applyCommand(0, { type: 'pass' });
        // 白（CPU）は地が9路の右4列で36、黒は左3列で27。白の勝ち → パス
        expect(decide(createGameView(game, 1), 'normal')).toEqual({ type: 'pass' });
    });

    it('序盤には、パスしない', () => {
        const game = new Game(players([true, false], 'normal'), { size: 9, komi: 6.5 });
        const command = decide(createGameView(game, 0), 'normal');
        expect(command.type).toBe('move');
    });

    it('死に石を決める段階では、確定する', () => {
        const game = new Game(players([false, true]), { size: 9 });
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'pass' });
        expect(isCpuTurn(game)).toBe(true);
        expect(cpuSeat(game)).toBe(1);
        expect(runCpuStep(game)).toBe(true);
        expect(game.agreed).toEqual([false, true]);
        expect(isCpuTurn(game)).toBe(false);
    });

    it('人の番では動かない。ビューだけを見て、合法な手を返す', () => {
        const game = new Game(players([false, true]), { size: 9 });
        expect(runCpuStep(game)).toBe(false);
        game.applyCommand(0, { type: 'move', sq: at(9, 4, 4) });
        const view = createGameView(game, 1);
        const command = decide(JSON.parse(JSON.stringify(view)), 'easy');
        expect(command.type).toBe('move');
        expect(game.applyCommand(1, command)).toBe(true);
    });

    it('長すぎる対局は、パスで終わらせる', () => {
        const game = new Game(players([false, true]), { size: 9 });
        game.applyCommand(0, { type: 'move', sq: 0 });
        game.moveNumber = 9 * 9 * 3;
        expect(decide(createGameView(game, 1), 'easy')).toEqual({ type: 'pass' });
    });
});
