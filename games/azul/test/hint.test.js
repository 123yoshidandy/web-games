import { describe, it, expect, vi } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む。CPU の番には出さない', () => {
        vi.useFakeTimers();
        const c = new LocalGameController({ players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }, { name: 'C2', isCPU: true }], seed: 11 });
        let steps = 0;
        while (!c.game.isOver && steps++ < 500) {
            if (c.game.current === c.humanSeat) {
                const before = c.game.commands.length;
                const move = c.hint();
                expect(c.game.commands.length).toBe(before);
                expect(c.send(move)).toBe(true);
            } else {
                expect(c.hint()).toBeNull();
                runCpuStep(c.game);
            }
        }
        expect(c.game.isOver).toBe(true);
        c.stop?.();
        vi.useRealTimers();
    });
});
