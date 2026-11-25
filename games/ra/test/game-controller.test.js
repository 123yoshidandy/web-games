import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';

afterEach(() => vi.useRealTimers());

const setup = (seed) => ({
    players: [{ name: 'あなた' }, { name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'easy' }],
    options: { seed }
});

describe('ローカル対戦のコントローラー', () => {
    it('CPU は間を置いて進め、人の番で止まる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(4));
        controller.scheduleCpu();
        vi.advanceTimersByTime(60000);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('人の操作は記録され、断られた操作は onError で知らせる', () => {
        const errors = [];
        const controller = new LocalGameController(setup(4), { onError: (m) => errors.push(m) });
        const game = controller.game;
        game.current = 0;
        expect(controller.send({ type: 'pass' })).toBe(false);
        expect(errors).toHaveLength(1);
        expect(controller.send({ type: 'draw' })).toBe(true);
        controller.stop();
    });

    it('保存した記録から、同じ状態で再開できる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(9));
        controller.scheduleCpu();
        vi.advanceTimersByTime(30000);
        controller.stop();
        const saved = JSON.parse(JSON.stringify(controller.game.persist()));
        const resumed = new LocalGameController(saved);
        expect(JSON.stringify(resumed.getView())).toBe(JSON.stringify(controller.getView()));
        resumed.stop();
    });
});
