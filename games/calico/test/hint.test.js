import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest, runCpuStep, nextCpuSeat } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの操作だけを選んでも、操作が通って最後まで進む。操作する番でないときは出さない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'C1', isCPU: true }, { name: 'C2', isCPU: true }], { seed: 8 });
        for (let step = 0; step < 3000 && !game.isOver(); step++) {
            const view = createGameView(game, 0);
            if (game.actors().includes(0)) {
                const command = suggest(view);
                expect(game.applyCommand(0, command), game.lastError).toBe(true);
            } else {
                expect(suggest(view)).toBeNull();
                runCpuStep(game, nextCpuSeat(game));
            }
        }
        expect(game.isOver()).toBe(true);
    });
});
