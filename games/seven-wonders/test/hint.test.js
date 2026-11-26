import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep, cpuSeatsToAct } from '../public/js/cpu-player.js';

const newGame = (n, seed, sides = 'A') => new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 })), { seed, sides });

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        for (const [n, sides] of [[3, 'A'], [5, 'B'], [7, 'A']]) {
            for (let seed = 1; seed <= 3; seed++) {
                const game = newGame(n, seed, sides);
                for (let step = 0; step < 2000 && !game.isOver(); step++) {
                    const command = suggest(game, 0);
                    if (command) expect(game.applyCommand(0, command), JSON.stringify(command)).toBe(true);
                    else {
                        const seat = cpuSeatsToAct(game)[0];
                        expect(seat).not.toBeUndefined();
                        runCpuStep(game, seat);
                    }
                }
                expect(game.isOver()).toBe(true);
            }
        }
    });

    it('選び終えた人には出さない', () => {
        const game = newGame(3, 1);
        game.applyCommand(0, suggest(game, 0));
        expect(suggest(game, 0)).toBeNull();
    });
});
