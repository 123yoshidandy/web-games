import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, legalMoves, utility, isCpuTurn } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { COLOR_ORDER } from '../public/js/colors.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { at, setHand, paint, skipFirst } from './helpers.js';

const fixed = (x) => () => x;
const cpuGame = (n) => new Game([{ name: 'A' }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: 'normal' }))], { seed: 1, startPlayer: 0 });

describe('CPU どうしの試合', () => {
    it('人数・遊び方・強さ・シードを変えても、止まらずに最後まで進む', () => {
        const cases = [[1, 'solo'], [2, 'standard'], [3, 'standard'], [4, 'standard'], [4, 'team']];
        for (const [count, mode] of cases) {
            for (const mix of [['easy'], ['easy', 'normal'], ['normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 6; seed++) {
                    const game = playMatch({ count, levels, seed, mode });
                    expect(game.isOver(), `${count}人 ${mode} ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('ふつうは、やさしいと、ふさがない CPU に勝ち越す', () => {
        expect(runMatches({ games: 20, count: 2, levels: ['easy', 'normal'] }).wins[1]).toBeGreaterThan(16);
        const a = runMatches({ games: 60, count: 2, levels: ['grow', 'normal'] }).wins[1];
        const b = runMatches({ games: 60, count: 2, levels: ['normal', 'grow'] }).wins[0];
        expect(a + b).toBeGreaterThan(60);
    });
});

describe('CPU の判断', () => {
    it('置ける手は、最初の手番の決まりを守る', () => {
        const game = cpuGame(2);
        const moves = legalMoves(createGameView(game, 0));
        expect(moves.length).toBeGreaterThan(0);
        moves.forEach(m => expect(game.placementError(0, m.cells)).toBe(null));
    });

    it('いちばん低い色を伸ばす手を選ぶ', () => {
        const game = cpuGame(2);
        skipFirst(game);
        COLOR_ORDER.forEach(c => { game.sides[0].scores[c] = 10; });
        game.sides[0].scores.yellow = 2; // 黄がいちばん低い
        setHand(game, 0, [['yellow', 'yellow'], ['red', 'red']]);
        // 黄の列と赤の列（赤のほうが長い）
        paint(game, [at(-3, 0), at(-3, 1)], ['yellow', 'yellow']);
        paint(game, [at(3, -3), at(3, -2), at(3, -1)], ['red', 'red', 'red']);
        const command = chooseCommand(createGameView(game, 0), 'normal', fixed(0.5));
        expect(command.tile).toEqual(['yellow', 'yellow']);
    });

    it('18に届く手（もう1枚）を高く見る', () => {
        const game = cpuGame(2);
        skipFirst(game);
        COLOR_ORDER.forEach(c => { game.sides[0].scores[c] = 5; });
        game.sides[0].scores.blue = 17;
        setHand(game, 0, [['blue', 'blue'], ['green', 'orange']]);
        paint(game, [at(2, 0)], ['blue']);
        const command = chooseCommand(createGameView(game, 0), 'normal', fixed(0.5));
        expect(command.tile).toEqual(['blue', 'blue']);
    });

    it('取り替えられるときは、ふつうは取り替える', () => {
        expect(chooseCommand({ phase: 'swap' }, 'normal', fixed(0.9))).toEqual({ type: 'swap' });
        expect(chooseCommand({ phase: 'swap' }, 'easy', fixed(0.9))).toEqual({ type: 'keep' });
    });

    it('低い色ほど重く数える', () => {
        const base = Object.fromEntries(COLOR_ORDER.map(c => [c, 5]));
        const low = { ...base, red: 6 };
        const high = { ...base, red: 4, blue: 7, green: 7 };
        expect(utility(low)).toBeGreaterThan(utility(high) - 1);
    });

    it('人だけを待っているときは CPU は動かない', () => {
        const game = cpuGame(3);
        expect(isCpuTurn(game)).toBe(false);
        const view = createGameView(game, 0);
        const move = legalMoves(view)[0];
        game.applyCommand(0, { type: 'place', tile: move.tile, cells: move.cells });
        if (game.phase === 'swap') game.applyCommand(0, { type: 'keep' });
        expect(isCpuTurn(game)).toBe(true);
    });
});
