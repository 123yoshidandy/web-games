import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人の番には通る手を返し、CPU の番には返さない。ヒントを見ても記録は変わらない', () => {
        for (const layout of ['standard', 'belgian']) {
            const c = new LocalGameController({ players: [{ name: 'あなた' }, { name: 'CPU', isCPU: true }], options: { seed: 7, layout } });
            for (let turn = 0; turn < 12 && !c.game.isOver(); turn++) {
                if (c.game.current === c.humanSeat) {
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
