import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { chooseCommand } from '../public/js/cpu-player.js';

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
        vi.advanceTimersByTime(120000);
        expect(controller.game.commands.length).toBeGreaterThanOrEqual(4);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('人の操作を受け、断った操作は伝える', () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController(setup(0), { onError: (m) => errors.push(m) });
        expect(controller.send({ type: 'tile', color: 'red', cell: -5 })).toBe(false);
        expect(errors.length).toBe(1);
        for (let i = 0; i < 2; i++) {
            const view = controller.getView();
            if (!view.answering.includes(0)) break;
            expect(controller.send(chooseCommand(view, 'normal', () => 0.5))).toBe(true);
        }
        vi.advanceTimersByTime(120000);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });
});
