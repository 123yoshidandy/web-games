import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人の番には通る手を返し、CPU の番には返さない。ヒントを見ても記録は変わらない', () => {
        for (const human of [0, 1]) {
            const players = [{ name: 'CPU', isCPU: true, cpuLevel: 'easy' }, { name: 'CPU', isCPU: true, cpuLevel: 'easy' }];
            players[human] = { name: 'あなた' };
            const c = new LocalGameController({ players, options: { seed: 11 + human } });
            for (let step = 0; step < 12 && !c.game.isOver(); step++) {
                if (c.game.actors().includes(c.humanSeat)) {
                    const before = c.game.commands.length;
                    const move = c.hint();
                    expect(move).toBeTruthy();
                    expect(c.game.commands.length).toBe(before);
                    expect(c.send(move)).toBe(true);
                } else {
                    expect(c.hint()).toBeNull();
                    runCpuStep(c.game);
                }
            }
            c.stop();
        }
    });
});
