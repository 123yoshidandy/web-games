import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, values, isCpuTurn } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { at, movePhase } from './helpers.js';

const fixed = (x) => () => x;
const cpuGame = (n) => new Game([{ name: 'A' }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: 'normal' }))], { seed: 1, startPlayer: 0 });

describe('CPU どうしの試合', () => {
    it('人数・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 2; count <= 4; count++) {
            for (const mix of [['easy'], ['easy', 'normal'], ['normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= (mix.length === 1 && mix[0] === 'normal' ? 4 : 10); seed++) {
                    const game = playMatch({ count, levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                    expect(game.players.every(p => p.out)).toBe(true);
                }
            }
        }
    });

    it('ふつうは、やさしいと1手だけ読む CPU に勝ち越す', () => {
        expect(runMatches({ games: 30, count: 2, levels: ['easy', 'normal'] }).wins[1]).toBeGreaterThan(24);
        expect(runMatches({ games: 30, count: 2, levels: ['greedy', 'normal'] }).wins[1]).toBeGreaterThan(18);
    });
});

describe('CPU の判断', () => {
    it('ほかの人が届かない領域は、自分の値に満額で入る', () => {
        const game = cpuGame(2);
        game.fish.fill(0);
        [at(0, 1), at(2, 1), at(4, 1)].forEach(c => { game.fish[c] = 3; });
        [at(13, 6), at(14, 7)].forEach(c => { game.fish[c] = 1; });
        movePhase(game, { 0: at(0, 1), 4: at(14, 7) });
        const v = values({ fish: game.fish, pens: game.penguins, got: [0, 0], out: [false, false], n: 2 });
        expect(v[0]).toBeGreaterThan(v[1] + 5);
    });

    it('相手を閉じ込められるなら、閉じ込める', () => {
        // 相手（席1）は8枚の列の左端にいて、出口は右だけ。自分（席0）は右端から左へ滑り、相手のとなりで止まれば、相手は動けない
        const game = cpuGame(2);
        game.fish.fill(0);
        [0, 2, 4, 6, 8, 10, 12, 14].forEach(x => { game.fish[at(x, 1)] = 1; });
        [7, 9, 11, 13].forEach(x => { game.fish[at(x, 2)] = 2; });
        movePhase(game, { 0: at(14, 1), 4: at(0, 1) });
        const command = chooseCommand(createGameView(game, 0), 'normal', fixed(0.5));
        expect(command).toEqual({ type: 'move', penguin: 0, to: at(2, 1) });
    });

    it('置くときは、魚の多い場所の近くを選ぶ', () => {
        const game = cpuGame(2);
        game.fish.fill(1);
        const rich = at(7, 2);
        game.fish[rich] = 1;
        NEIGHBORS_OF(rich).forEach(c => { game.fish[c] = 3; });
        game.current = 1;
        const command = chooseCommand(createGameView(game, 1), 'normal', fixed(0.5));
        expect(command).toEqual({ type: 'place', cell: rich });
    });

    it('人だけを待っているときは CPU は動かない', () => {
        const game = cpuGame(3);
        expect(isCpuTurn(game)).toBe(false);
        game.applyCommand(0, { type: 'place', cell: game.placeable()[0] });
        expect(isCpuTurn(game)).toBe(true);
    });
});

import { NEIGHBORS } from '../public/js/board.js';
function NEIGHBORS_OF(c) {
    return NEIGHBORS[c].filter(nb => nb >= 0);
}
