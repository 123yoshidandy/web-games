import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの操作だけを選んでも、操作が通って最後まで進む。番でないときは出さない', () => {
        const c = new LocalGameController({ players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }, { name: 'C2', isCPU: true }], options: { seed: 4 } });
        for (let step = 0; step < 3000 && !c.game.isOver(); step++) {
            if (c.game.actors().includes(c.humanSeat)) {
                const before = c.game.commands.length;
                const command = c.hint();
                expect(c.game.commands.length).toBe(before);
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
