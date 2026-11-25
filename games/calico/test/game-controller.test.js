import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { OPEN_CELLS } from '../public/js/board.js';

afterEach(() => vi.useRealTimers());

const setup = (startPlayer) => ({
    players: [{ name: 'あなた' }, { name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'easy' }],
    options: { seed: 3, startPlayer, setup: 'beginner' }
});

describe('ローカル対戦のコントローラー', () => {
    it('CPU の番は間を置いて進め、人の番で止まる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(1));
        controller.scheduleCpu();
        vi.advanceTimersByTime(60000);
        expect(controller.game.commands.length).toBe(4); // CPU 2人が置いて取る
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('目標を選ぶ間は、CPU が先に選び、人を待つ', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController({ ...setup(0), options: { seed: 3, startPlayer: 0, setup: 'standard' } });
        controller.scheduleCpu();
        vi.advanceTimersByTime(60000);
        expect(controller.game.phase).toBe('goals');
        expect(controller.game.actors()).toEqual([0]);
        expect(controller.send({ type: 'goals', pick: [0, 1, 3] })).toBe(true);
        expect(controller.game.phase).toBe('place');
        controller.stop();
    });

    it('人の操作を受け、断った操作は伝える', () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController(setup(0), { onError: (m) => errors.push(m) });
        expect(controller.send({ type: 'place', hand: 0, cell: 0 })).toBe(false);
        expect(errors.length).toBe(1);
        expect(controller.send({ type: 'place', hand: 0, cell: OPEN_CELLS[0] })).toBe(true);
        expect(controller.send({ type: 'take', market: 1 })).toBe(true);
        vi.advanceTimersByTime(60000);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('1人用も動かせる', () => {
        const controller = new LocalGameController({ players: [{ name: 'あなた' }], options: { seed: 2, setup: 'beginner' } });
        expect(controller.send({ type: 'place', hand: 1, cell: OPEN_CELLS[3] })).toBe(true);
        expect(controller.send({ type: 'take', market: 0 })).toBe(true);
        expect(controller.getView().players[0].placed).toBe(1);
        controller.stop();
    });

    it('保存した記録から続きを再開できる', () => {
        const store = new Map();
        vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });
        try {
            const controller = new LocalGameController(setup(0));
            controller.send({ type: 'place', hand: 0, cell: OPEN_CELLS[0] });
            controller.stop();
            const saved = JSON.parse(store.get('calico.save'));
            expect(saved.commands.length).toBe(1);
            const resumed = new LocalGameController(saved);
            expect(resumed.getView().players[0].placed).toBe(1);
            expect(resumed.getView().phase).toBe('take');
            resumed.stop();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
