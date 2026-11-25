import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';

afterEach(() => vi.useRealTimers());

const setup = (startPlayer) => ({
    players: [{ name: 'あなた' }, { name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'easy' }],
    options: { seed: 3, startPlayer }
});

describe('ローカル対戦のコントローラー', () => {
    it('CPU の番は間を置いて進め、人の番で止まる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(1));
        controller.scheduleCpu();
        vi.advanceTimersByTime(30000);
        expect(controller.game.commands.length).toBe(2); // CPU 2人が置いた
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('人の操作を受け、断った操作は伝える', () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController(setup(0), { onError: (m) => errors.push(m) });
        expect(controller.send({ type: 'place', cell: controller.game.fish.indexOf(3) })).toBe(false);
        expect(errors.length).toBe(1);
        expect(controller.send({ type: 'place', cell: controller.game.placeable()[0] })).toBe(true);
        vi.advanceTimersByTime(5000);
        expect(controller.game.commands.length).toBe(3);
        controller.stop();
    });
});
