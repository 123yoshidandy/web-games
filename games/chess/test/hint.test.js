import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの手を指すと、手が通って対局が進む。番でないときは出さない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: 'easy' }]);
        for (let step = 0; step < 40 && !game.isOver(); step++) {
            const view = createGameView(game, 0);
            if (game.actors().includes(0)) {
                const command = suggest(view);
                expect(command?.type).toBe('move');
                expect(game.applyCommand(0, command), game.lastError).toBe(true);
            } else {
                expect(suggest(view)).toBeNull();
                expect(runCpuStep(game)).toBe(true);
            }
        }
        expect(game.commands.length).toBeGreaterThan(20);
    });
});
