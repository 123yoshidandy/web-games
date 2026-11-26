import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの操作だけを選んでも、操作が通って最後まで進む。番でないときは出さない', () => {
        for (const seed of [1, 2, 3]) {
            const game = new Game([{ name: 'あなた' }, ...[1, 2, 3].map(i => ({ name: `C${i}`, isCPU: true }))], { seed });
            for (let step = 0; step < 3000 && !game.isOver(); step++) {
                const view = createGameView(game, 0);
                if (game.actors().includes(0)) {
                    const command = suggest(view);
                    expect(game.applyCommand(0, command), game.lastError).toBe(true);
                } else {
                    expect(suggest(view)).toBeNull();
                    runCpuStep(game);
                }
            }
            expect(game.isOver()).toBe(true);
        }
    });
});
