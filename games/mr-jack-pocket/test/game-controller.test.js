import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { chooseCommand } from '../public/js/cpu-player.js';
import { JACK, DETECTIVE } from '../public/js/game.js';

afterEach(() => vi.useRealTimers());

describe('ローカル対戦のコントローラー', () => {
    it('あなたがジャック側：CPU（刑事側）の番は間を置いて進め、あなたの番で止まる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController({ players: [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: 'normal' }], options: { seed: 3 } });
        expect(controller.humanSeat).toBe(JACK);
        controller.scheduleCpu();
        vi.advanceTimersByTime(10000);
        expect(controller.game.commands.length).toBe(1); // 奇数ラウンドは刑事側から1枚
        expect(controller.game.actors()).toEqual([JACK]);
        controller.stop();
    });

    it('あなたが刑事側：操作を受け、断った操作は伝える', () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController({ players: [{ name: 'CPU', isCPU: true, cpuLevel: 'easy' }, { name: 'あなた' }], options: { seed: 4 } }, { onError: (m) => errors.push(m) });
        expect(controller.humanSeat).toBe(DETECTIVE);
        expect(controller.send({ type: 'move', who: 'holmes', steps: 7 })).toBe(false);
        expect(errors.length).toBe(1);
        expect(controller.send(chooseCommand(controller.getView(), 'normal', () => 0.5))).toBe(true);
        vi.advanceTimersByTime(10000);
        expect(controller.game.actors()).toEqual([DETECTIVE]);
        expect(controller.game.commands.length).toBe(3);
        controller.stop();
    });
});
