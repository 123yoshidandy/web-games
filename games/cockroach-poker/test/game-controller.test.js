import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';

afterEach(() => vi.useRealTimers());

const setup = (startPlayer) => ({
    players: [{ name: 'あなた' }, { name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'easy' }],
    options: { seed: 3, startPlayer }
});

describe('ローカル対戦のコントローラー', () => {
    it('CPU が親なら、間を置いて渡し、人の答えを待つか、人が答えるまで進む', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(1));
        controller.scheduleCpu();
        vi.advanceTimersByTime(30000);
        const game = controller.game;
        expect(game.commands.length).toBeGreaterThan(0);
        // CPU だけで進むところまで進み、人の操作を待って止まっている
        expect(game.actors()).toEqual([0]);
        controller.stop();
    });

    it('人の操作を受け、断った操作は伝える', () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController(setup(0), { onError: (m) => errors.push(m) });
        expect(controller.send({ type: 'give', card: 'x', target: 1, claim: 'bat' })).toBe(false);
        expect(errors.length).toBe(1);
        const card = controller.game.players[0].hand[0];
        expect(controller.send({ type: 'give', card, target: 1, claim: 'bat' })).toBe(true);
        vi.advanceTimersByTime(5000);
        expect(controller.game.commands.length).toBeGreaterThan(1);
        controller.stop();
    });
});
