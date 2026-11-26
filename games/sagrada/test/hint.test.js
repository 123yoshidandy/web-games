import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep, nextCpuSeat } from '../public/js/cpu-player.js';

const newGame = (n, seed) => new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: i > 0 })), { seed, soloTools: 4 });

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む（1人用も）', () => {
        for (const n of [1, 2, 4]) {
            for (let seed = 1; seed <= 3; seed++) {
                const game = newGame(n, seed);
                for (let step = 0; step < 3000 && !game.isOver(); step++) {
                    if (game.actors().includes(0)) {
                        const command = suggest(game, 0);
                        expect(command).toBeTruthy();
                        expect(game.applyCommand(0, command), `${n}人 ${JSON.stringify(command)} ${game.lastError}`).toBe(true);
                    } else runCpuStep(game, nextCpuSeat(game));
                }
                expect(game.isOver()).toBe(true);
            }
        }
    });

    it('人の番でなければ出さない', () => {
        const game = newGame(2, 1);
        game.applyCommand(0, suggest(game, 0));
        expect(game.actors()).not.toContain(0);
        expect(suggest(game, 0)).toBeNull();
    });
});
