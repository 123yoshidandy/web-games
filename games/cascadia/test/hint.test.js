import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest, runCpuStep, nextCpuSeat } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの置き方だけを選んでも、手が通って最後まで進む。番でないときは出さない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'C1', isCPU: true }, { name: 'C2', isCPU: true }], { seed: 12 });
        for (let step = 0; step < 1000 && !game.isOver(); step++) {
            const view = createGameView(game, 0);
            if (game.current === 0) {
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
