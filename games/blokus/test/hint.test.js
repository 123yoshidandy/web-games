import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの置き方だけを選んでも、手が通って最後まで進む。CPU の番には出さない', () => {
        const c = new LocalGameController({ players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }], options: { seed: 9 } });
        for (let step = 0; step < 400 && !c.game.isOver(); step++) {
            if (c.game.actors().includes(c.humanSeat)) {
                const command = c.hint();
                expect(command).toBeTruthy();
                expect(c.send(command), c.game.lastError).toBe(true);
            } else {
                expect(c.hint()).toBeNull();
                runCpuStep(c.game);
            }
        }
        expect(c.game.isOver()).toBe(true);
        c.stop();
    });
});
