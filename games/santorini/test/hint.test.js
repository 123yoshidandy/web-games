import { describe, it, expect } from 'vitest';
import Game, { GODS } from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

const newGame = (n, seed, gods = null) => new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 })), { seed, gods });

describe('ヒント', () => {
    it('人がおすすめの1歩だけを打っても、手が通って最後まで進む', () => {
        const cases = [[2, null], [3, null], ...GODS.map(god => [2, [god, 'random']])];
        cases.forEach(([n, gods], k) => {
            const game = newGame(n, k + 1, gods);
            for (let step = 0; step < 2000 && !game.isOver(); step++) {
                if (game.current === 0) {
                    const command = suggest(game, 0);
                    expect(command).toBeTruthy();
                    expect(game.applyCommand(0, command), `${JSON.stringify(gods)} ${JSON.stringify(command)}`).toBe(true);
                } else runCpuStep(game);
            }
            expect(game.isOver()).toBe(true);
        });
    });

    it('人の番でなければ出さない', () => {
        const game = newGame(2, 1);
        expect(suggest(game, 1 - game.current)).toBeNull();
    });
});
