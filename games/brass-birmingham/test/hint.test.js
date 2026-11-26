import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep, cpuActors } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの操作だけを選んでも、操作が通って最後まで進む。CPU の番には出さない', () => {
        const c = new LocalGameController({ players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }], options: { seed: 2 } });
        for (let step = 0; step < 2000 && !c.game.isOver(); step++) {
            const cpu = cpuActors(c.game);
            if (cpu.length) {
                expect(c.hint()).toBeNull();
                runCpuStep(c.game, cpu[0]);
            } else {
                const command = c.hint();
                expect(command).toBeTruthy();
                expect(c.send(command), c.game.lastError).toBe(true);
            }
        }
        expect(c.game.isOver()).toBe(true);
        c.stop();
    }, 120000);
});
