import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot, newGame, put, cellOf } from './helpers.js';

describe('CPU', () => {
    it('ビューだけで決め、同じビューなら同じ手を選び、ゲームの状態を変えない', () => {
        for (const level of ['easy', 'normal']) {
            const game = new Game(players(3, true).map(p => ({ ...p, cpuLevel: level })), { seed: 11 });
            let steps = 0;
            while (!game.isOver() && steps++ < 3000) {
                const seat = game.active;
                const before = snapshot(game);
                const view = JSON.parse(JSON.stringify(createGameView(game, seat)));
                const a = chooseCommand(view, level);
                expect(chooseCommand(view, level)).toEqual(a);
                expect(snapshot(game)).toBe(before);
                expect(game.applyCommand(seat, a), JSON.stringify(a)).toBe(true);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('ほかの人の手札の地形カードは見えない', () => {
        const game = new Game(players(3, true), { seed: 3 });
        const other = (game.active + 1) % 3;
        const view = createGameView(game, game.active);
        expect(view.players[game.active].card).toBe(game.players[game.active].card);
        expect(view.players[other].card).toBe(null);
        expect(createGameView(game, other).players[game.active].card).toBe(game.players[game.active].card);
    });

    it('ふつうは、王のカードの得点になるマスを選ぶ（騎士なら同じ行に、城の隣を取る）', () => {
        const game = newGame(2, { card: 'G', cards: ['knights', 'hermits', 'discoverers'] });
        game.players[0].isCPU = true;
        put(game, 0, [cellOf(0, 0)]);
        // (0,0) の隣の草原は (0,1) と (1,0)。騎士は同じ行の (0,1) で 2点ふえる
        expect(chooseCommand(createGameView(game, 0), 'normal')).toEqual({ type: 'build', cell: cellOf(0, 1) });
    });

    it('ふつうは、使える場所タイルを使ってから番を終える', () => {
        const game = newGame(2, { card: 'G' });
        game.players[0].isCPU = true;
        game.players[0].tiles.push({ type: 'oracle', loc: cellOf(3, 7), fresh: false, used: false });
        put(game, 0, [cellOf(2, 7)]);
        while (!game.mandatoryDone) runCpuStep(game);
        runCpuStep(game);
        expect(game.commands.at(-1).command.type).toBe('tile');
        runCpuStep(game);
        expect(game.commands.at(-1).command.type).toBe('end');
    });

    it('ふつうは、やさしいに大きく勝ち越す（2人と4人）', () => {
        const two = runMatches({ games: 40, levels: ['easy', 'normal'] });
        expect(two.finished).toBe(40);
        expect(two.wins[1] / two.finished).toBeGreaterThan(0.8);
        const four = runMatches({ games: 20, levels: ['easy', 'normal', 'easy', 'normal'] });
        expect(four.finished).toBe(20);
        expect((four.wins[1] + four.wins[3]) / four.finished).toBeGreaterThan(0.8);
    });
});
