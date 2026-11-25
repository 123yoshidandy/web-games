import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, runCpuStep, cpuSeatsToAct, LEVELS } from '../public/js/cpu-player.js';
import { newGame, setHand, setTableau, skipStart, choose } from './helpers.js';

function playOut(game, levelOf) {
    let rejected = 0;
    const apply = game.applyCommand.bind(game);
    game.applyCommand = (seat, command) => {
        const result = apply(seat, command);
        if (!result) rejected++;
        return result;
    };
    let steps = 0;
    while (!game.isOver()) {
        const seats = cpuSeatsToAct(game);
        if (!seats.length || ++steps > 5000) throw new Error('止まった');
        for (const seat of seats) if (game.pending[seat]) expect(runCpuStep(game, seat, levelOf)).toBe(true);
    }
    return rejected;
}

const cpus = n => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true }));

describe('CPU', () => {
    it('2〜4 人と上級ルールで、CPU だけで最後まで進み、手を断られない', () => {
        for (const [n, advanced] of [[2, false], [3, false], [4, false], [2, true]]) {
            for (const seed of [1, 2, 3]) {
                const game = new Game(cpus(n), { seed, advanced });
                expect(playOut(game, s => ['normal', 'easy', 'normal', 'easy'][s])).toBe(0);
                expect(game.scores.length).toBe(n);
            }
        }
    });

    it('ビューだけを見て選ぶ（同じビューなら同じ手。ほかの人の手札は入っていない）', () => {
        const game = newGame(3);
        const view = createGameView(game, 1);
        expect(view.hand.length).toBe(6);
        expect(view.players[0].hand).toBeUndefined();
        expect(JSON.stringify(chooseCommand(view, LEVELS.normal))).toBe(JSON.stringify(chooseCommand(structuredClone(view), LEVELS.normal)));
    });

    it('入植の段階では、払える世界があれば置く', () => {
        const game = newGame(2);
        skipStart(game);
        game.players[0].isCPU = true;
        setTableau(game, 0, ['oldEarth']);
        setHand(game, 0, ['gemWorld', 'spaceMarines', 'investmentCredits']);
        choose(game, ['settle', 'produce']);
        expect(runCpuStep(game, 0)).toBe(true);
        expect(game.choices[0].card).toBe('gemWorld');
        expect(game.choices[0].pay.length).toBe(2);
    });

    it('ふつうは無作為に選ぶ相手に大きく勝ち越す', () => {
        let wins = 0;
        for (let seed = 0; seed < 20; seed++) {
            const game = new Game(cpus(2), { seed });
            playOut(game, s => (s === seed % 2 ? 'normal' : 'random'));
            if (game.winners.includes(seed % 2)) wins++;
        }
        expect(wins).toBeGreaterThanOrEqual(16);
    });
});
