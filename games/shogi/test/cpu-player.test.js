import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { decide, runCpuStep, CPU_LEVELS, LEVELS } from '../public/js/cpu-player.js';
import { analyze, evaluate, MATE } from '../public/js/engine.js';
import { Position, sqOf, KI } from '../public/js/rules.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { newGame, setPosition, move } from './helpers.js';

describe('CPU', () => {
    it('どの強さも、1手で詰ませる手を選ぶ（頭金）', () => {
        for (const level of CPU_LEVELS) {
            const game = setPosition(newGame([true, true]), '4k4/9/4P4/9/9/9/9/9/4K4 b G');
            expect(decide(game, level), level).toEqual({ type: 'drop', piece: KI, to: sqOf(5, 2) });
        }
    });

    it('ふつう以上は、ただで取られる大駒をそのままにしない', () => {
        // 先手の飛 2五 が、後手の銀 3四 に取られる位置にいる
        for (const level of ['normal', 'strong', 'expert']) {
            const game = setPosition(newGame([true, true]), '4k4/9/9/6s2/7R1/9/9/9/4K4 b -');
            const command = decide(game, level);
            game.applyCommand(0, command);
            // 指したあと、後手が飛をただで取れない
            const after = analyze(game.pos, { depth: 1 });
            expect(after.scored[0].score, level).toBeLessThan(500);
        }
    });

    it('同じ局面なら同じ手を選ぶ', () => {
        const a = newGame([true, true]);
        const b = newGame([true, true]);
        for (let i = 0; i < 6; i++) {
            runCpuStep(a);
            runCpuStep(b);
        }
        expect(a.commands).toEqual(b.commands);
    });

    it('連続王手の千日手で負ける手は選ばず、相手の連続王手の千日手で勝てる手は選ぶ', () => {
        // 後手の番から：後手玉 1一・2一、先手の飛 1九・2九 の往復で、12手目に4回目
        const cycle = [move(sqOf(1, 1), sqOf(2, 1)), move(sqOf(1, 9), sqOf(2, 9)), move(sqOf(2, 1), sqOf(1, 1)), move(sqOf(2, 9), sqOf(1, 9))];
        const game = setPosition(newGame([true, true]), '8k/9/9/9/9/9/9/9/K7R w -');
        for (let i = 0; i < 11; i++) expect(game.applyCommand((i + 1) % 2, cycle[i % 4])).toBe(true);
        // 先手が 1九へ戻すと、連続王手の千日手で先手の負け。別の手を選ぶ
        const sente = decide(game, 'strong');
        expect(sente).not.toEqual(cycle[3]);
        // 先手の連続王手の千日手で、後手が勝てる局面
        const game2 = setPosition(newGame([true, true]), '8k/9/9/9/9/9/9/9/K6R1 b -');
        const cycle2 = [move(sqOf(2, 9), sqOf(1, 9)), move(sqOf(1, 1), sqOf(2, 1)), move(sqOf(1, 9), sqOf(2, 9)), move(sqOf(2, 1), sqOf(1, 1))];
        for (let i = 0; i < 11; i++) expect(game2.applyCommand(i % 2, cycle2[i % 4])).toBe(true);
        expect(decide(game2, 'easy')).toEqual(cycle2[3]);
    });

    it('局面の数で打ち切る（時間は使わない）', () => {
        const pos = Position.initial();
        const r = analyze(pos, { depth: 1, maxDepth: 8, nodeLimit: 5000 });
        expect(r.nodes).toBeLessThanOrEqual(5001);
        expect(r.depth).toBeGreaterThanOrEqual(1);
        expect(r.depth).toBeLessThan(8);
        expect(r.scored.length).toBe(30);
    });

    it('局面の点は手番の側から見る（先後を入れ替えると符号が逆になる）', () => {
        const a = Position.fromSfen('4k4/9/9/9/9/9/9/9/4K4 b R');
        const b = Position.fromSfen('4k4/9/9/9/9/9/9/9/4K4 w R');
        expect(evaluate(a)).toBeGreaterThan(500);
        expect(evaluate(b)).toBe(-evaluate(a));
    });

    it('強さの設定がそろっている', () => {
        expect(CPU_LEVELS.every(level => LEVELS[level])).toBe(true);
        expect(MATE).toBeGreaterThan(10000);
    });

    it('CPU どうしの試合が最後まで進み、ふつうがやさしいに勝ち越す', () => {
        const r = runMatches({ games: 4, a: 'normal', b: 'easy', maxPly: 300 });
        expect(r.stuck).toBe(0);
        expect(r.winsA).toBeGreaterThan(r.winsB);
    });

    it('記録から再現できる（CPU の手も同じ入口を通る）', () => {
        const game = new Game([{ isCPU: true, cpuLevel: 'easy' }, { isCPU: true, cpuLevel: 'normal' }]);
        for (let i = 0; i < 20 && !game.isOver(); i++) runCpuStep(game);
        const replayed = Game.replay(game.players, game.options, game.commands);
        expect(replayed.pos.toSfen()).toBe(game.pos.toSfen());
    });
});
