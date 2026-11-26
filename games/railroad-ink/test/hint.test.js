import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

const newGame = (seed) => new Game([{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true }], { seed, level: 'normal' });

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        for (let seed = 1; seed <= 4; seed++) {
            const game = newGame(seed);
            for (let step = 0; step < 500 && !game.isOver(); step++) {
                if (game.actors().includes(0)) {
                    const command = suggest(game, 0);
                    expect(command).toBeTruthy();
                    expect(game.applyCommand(0, command), JSON.stringify(command)).toBe(true);
                } else runCpuStep(game);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('ゲームが終わったら出さない', () => {
        const game = newGame(1);
        game.phase = 'end';
        expect(suggest(game, 0)).toBeNull();
    });
});
