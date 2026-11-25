import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, runCpuStep, isCpuToAct, LEVELS } from '../public/js/cpu-player.js';

const cpus = n => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true }));

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
        if (!isCpuToAct(game) || ++steps > 20000) throw new Error('止まった');
        expect(runCpuStep(game, levelOf)).toBe(true);
    }
    return rejected;
}

describe('CPU', () => {
    it('2〜5 人で、CPU だけで最後まで進み、手を断られない', () => {
        for (const n of [2, 3, 4, 5]) {
            const game = new Game(cpus(n), { seed: n });
            expect(playOut(game, s => (s % 2 ? 'easy' : 'normal'))).toBe(0);
            expect(game.scores.length).toBe(n);
            expect(game.allMaxed()).toBe(true);
        }
    });

    it('ビューだけを見て選ぶ（同じビューなら同じ手。ほかの人の手札は入っていない）', () => {
        const game = new Game(cpus(3), { seed: 4 });
        const view = createGameView(game, 0);
        expect(view.players[1].hand).toBeUndefined();
        expect(JSON.stringify(chooseCommand(view, LEVELS.normal))).toBe(JSON.stringify(chooseCommand(structuredClone(view), LEVELS.normal)));
    });

    it('ふつうは無作為に選ぶ相手に勝ち越す', () => {
        let wins = 0;
        for (let seed = 0; seed < 10; seed++) {
            const game = new Game(cpus(2), { seed });
            playOut(game, s => (s === seed % 2 ? 'normal' : 'random'));
            if (game.winners.includes(seed % 2)) wins++;
        }
        expect(wins).toBeGreaterThanOrEqual(7);
    });
});
