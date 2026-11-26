import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

const newGame = (seed) => new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: 'normal' }], { seed });

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = newGame(seed);
            for (let step = 0; step < 1000 && !game.isOver(); step++) {
                if (game.actors().includes(0)) {
                    const command = suggest(game, 0);
                    expect(command).toBeTruthy();
                    expect(game.applyCommand(0, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
                } else runCpuStep(game);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('人の番でなければ出さない', () => {
        const game = newGame(1);
        const waiting = [0, 1].find(seat => !game.actors().includes(seat));
        expect(suggest(game, waiting)).toBeNull();
    });
});
