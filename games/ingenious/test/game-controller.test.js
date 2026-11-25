import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { legalMoves } from '../public/js/cpu-player.js';

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
        expect(controller.game.commands.length).toBeGreaterThanOrEqual(2);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('人の操作を受け、断った操作は伝える', () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController(setup(0), { onError: (m) => errors.push(m) });
        expect(controller.send({ type: 'place', tile: ['red', 'red'], cells: [0, 1] })).toBe(false);
        expect(errors.length).toBe(1);
        const move = legalMoves(controller.getView())[0];
        expect(controller.send({ type: 'place', tile: move.tile, cells: move.cells })).toBe(true);
        if (controller.game.phase === 'swap') controller.send({ type: 'keep' });
        vi.advanceTimersByTime(60000);
        expect(controller.game.actors()).toEqual([0]);
        controller.stop();
    });

    it('1人用も動かせる', () => {
        const controller = new LocalGameController({ players: [{ name: 'あなた' }], options: { seed: 2, mode: 'solo' } });
        const move = legalMoves(controller.getView())[0];
        expect(controller.send({ type: 'place', tile: move.tile, cells: move.cells })).toBe(true);
        expect(controller.getView().players[0].hand.length).toBe(1);
        controller.stop();
    });
});
