import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

const newGame = (seed) => new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed });

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = newGame(seed);
            for (let step = 0; step < 3000 && game.phase !== 'end'; step++) {
                if (game.current === 0) {
                    const command = suggest(game, 0);
                    expect(command).toBeTruthy();
                    expect(game.applyCommand(0, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
                } else runCpuStep(game);
            }
            expect(game.phase).toBe('end');
        }
    });

    it('人の番でなければ出さない', () => {
        const game = newGame(1);
        expect(suggest(game, 1 - game.current)).toBeNull();
    });
});
