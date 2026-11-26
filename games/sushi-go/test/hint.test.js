import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

const newGame = (count, seed) => new Game([{ name: 'あなた' },
    ...Array.from({ length: count - 1 }, (_, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: 'normal' }))], { seed });

describe('ヒント', () => {
    it('人がおすすめの手だけを選んでも、手が通って最後まで進む', () => {
        for (const count of [2, 4]) {
            for (let seed = 1; seed <= 5; seed++) {
                const game = newGame(count, seed);
                for (let step = 0; step < 2000 && !game.isOver(); step++) {
                    if (game.actors().includes(0)) {
                        const command = suggest(game, 0);
                        expect(command, `${count}人 seed ${seed}`).toBeTruthy();
                        expect(game.applyCommand(0, command), JSON.stringify(command)).toBe(true);
                    } else runCpuStep(game);
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
