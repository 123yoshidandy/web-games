import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCpuCommand, isCpuTurn, winChance, blotRisk, PROFILES } from '../public/js/cpu-player.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';
import { board, side, setMove } from './helpers.js';

describe('CPU', () => {
    it('CPU だけのマッチが、設定と強さを変えても最後まで進む', () => {
        const settings = [
            { matchLength: 1, cube: true }, { matchLength: 3, cube: true }, { matchLength: 5, cube: false }, { matchLength: 7, cube: true }
        ];
        for (const s of settings) {
            for (const profiles of [['normal', 'easy'], ['easy', 'random'], ['normal', 'normal']]) {
                for (let seed = 1; seed <= 4; seed++) {
                    const { game, steps } = playMatch({ profiles, seed, ...s });
                    expect(game.isOver(), `${JSON.stringify(s)} ${profiles} ${seed} ${steps}`).toBe(true);
                }
            }
        }
    });

    it('ゲームの乱数を使わない（CPU の手を記録から再現できる）', () => {
        const { game } = playMatch({ profiles: ['normal', 'easy'], seed: 8, matchLength: 3 });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(again.score).toEqual(game.score);
        expect(again.state.board).toEqual(game.state.board);
    });

    it('ふつうはやさしいに勝ち越し、やさしいはでたらめに勝ち越す', () => {
        const a = runMatches({ games: 60, profiles: ['normal', 'easy'], matchLength: 1 });
        expect(a.wins[0]).toBeGreaterThan(a.wins[1]);
        const b = runMatches({ games: 30, profiles: ['easy', 'random'], matchLength: 1 });
        expect(b.wins[0]).toBeGreaterThan(b.wins[1] * 3);
    });

    it('打てるブロットを打ち、自分のブロットは危うい場所に残さない', () => {
        const g = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 1, matchLength: 1 });
        // 6-5：相手のブロット（自分の 7）を 13 から打てる
        setMove(g, board({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 18: 1, 24: 1, 13: 5, 8: 3, 6: 5 }), [6, 5], 0);
        const cmd = chooseCpuCommand(g, 0, PROFILES.normal);
        expect(cmd.steps.some(([from, die]) => from - die === 7)).toBe(true);
        // ブロットは、相手の駒の 6 先より、届かない場所のほうが危うさが小さい
        const opp = side({ 24: 2, 13: 5, 8: 3, 6: 5 });
        expect(blotRisk(side({ 18: 1, 6: 14 }), opp)).toBeGreaterThan(blotRisk(side({ 6: 15 }), opp));
    });

    it('大きく勝っている競走ではダブルし、大きく負けているときは降りる', () => {
        const ahead = board({ 6: 5, 5: 5, 4: 5 }, { 13: 5, 8: 5, 6: 5 });
        expect(winChance(ahead, 0)).toBeGreaterThan(0.9);
        const g = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 1, matchLength: 5 });
        g.state.board = ahead;
        g.state.turn = 0;
        g.state.phase = 'roll';
        g.state.dice = null;
        expect(chooseCpuCommand(g, 0, PROFILES.normal)).toEqual({ type: 'double' });
        g.applyCommand(0, { type: 'double' });
        expect(chooseCpuCommand(g, 1, PROFILES.normal)).toEqual({ type: 'drop' });
        // 互角の始まりではダブルしない
        const even = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 1, matchLength: 5 });
        even.state.phase = 'roll';
        even.state.dice = null;
        expect(chooseCpuCommand(even, even.state.turn, PROFILES.normal)).toEqual({ type: 'roll' });
    });

    it('人の番では進めない。ゲームの間は、人がいれば待つ', () => {
        const g = new Game([{ name: 'A' }, { name: 'B', isCPU: true }], { seed: 2, matchLength: 3 });
        if (g.current === 1) runCpuStep(g, 1);
        expect(isCpuTurn(g)).toBe(false);
        expect(runCpuStep(g, 1)).toBe(false);
        g.state.phase = 'between';
        expect(isCpuTurn(g)).toBe(false);
    });
});
