import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep, cpuActor } from '../public/js/cpu-player.js';

const newGame = (n, seed) => new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 })), { seed });

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        for (const n of [3, 5]) {
            for (let seed = 1; seed <= 5; seed++) {
                const game = newGame(n, seed);
                for (let step = 0; step < 3000 && !game.isOver(); step++) {
                    if (game.actors().includes(0)) {
                        const command = suggest(game, 0);
                        expect(command).toBeTruthy();
                        expect(game.applyCommand(0, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
                    } else runCpuStep(game, cpuActor(game));
                }
                expect(game.isOver()).toBe(true);
            }
        }
    });

    it('人の番でなければ出さない', () => {
        const game = newGame(3, 1);
        game.applyCommand(0, suggest(game, 0));
        expect(game.actors()).not.toContain(0);
        expect(suggest(game, 0)).toBeNull();
    });
});
