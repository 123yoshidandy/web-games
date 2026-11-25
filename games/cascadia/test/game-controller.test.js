import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { legalPlacements } from '../public/js/cpu-player.js';

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
        vi.advanceTimersByTime(60000);
        expect(controller.game.commands.length).toBe(2);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('人の操作を受け、断った操作は伝える', () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController(setup(0), { onError: (m) => errors.push(m) });
        expect(controller.send({ type: 'place', tile: 0, token: 0, q: 9, r: 9, rot: 0, at: null })).toBe(false);
        expect(errors.length).toBe(1);
        const move = legalPlacements(controller.getView()).find(m => m.tile === m.token);
        expect(controller.send(move)).toBe(true);
        vi.advanceTimersByTime(60000);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('1人用も動かせる', () => {
        const controller = new LocalGameController({ players: [{ name: 'あなた' }], options: { seed: 2 } });
        const move = legalPlacements(controller.getView()).find(m => m.tile === m.token);
        expect(controller.send(move)).toBe(true);
        expect(controller.getView().players[0].turns).toBe(1);
        controller.stop();
    });

    it('保存した記録から続きを再開できる', () => {
        const store = new Map();
        vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });
        try {
            const controller = new LocalGameController(setup(0));
            const move = legalPlacements(controller.getView()).find(m => m.tile === m.token);
            controller.send(move);
            controller.stop();
            const saved = JSON.parse(store.get('cascadia.save'));
            expect(saved.commands.length).toBe(1);
            const resumed = new LocalGameController(saved);
            expect(resumed.getView().players[0].turns).toBe(1);
            resumed.stop();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
