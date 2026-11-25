import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';

afterEach(() => vi.useRealTimers());

describe('ローカル対戦のコントローラー', () => {
    it('人が答え待ちに入っていたら、CPU は人の答えを待ってから答える', () => {
        vi.useFakeTimers();
        const players = [{ name: 'あなた' }, { name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'normal' }];
        const controller = new LocalGameController({ players, options: { seed: 3, startPlayer: 1 } });
        const game = controller.game;
        // CPU（席1）に税を名乗らせ、人と席2が答え待ちになる
        game.applyCommand(1, { type: 'action', action: 'tax' });
        controller.scheduleCpu();
        vi.advanceTimersByTime(10000);
        expect(game.phase).toBe('challengeAction');
        expect(game.waiting).toEqual([0, 2]); // 席2の CPU も答えていない
        controller.send({ type: 'allow' });
        vi.advanceTimersByTime(2000);
        expect(game.commands.length).toBeGreaterThan(2); // 人が答えたあとに、CPU が答えて進んだ
        controller.stop();
    });

    it('人が答え待ちに入っていなければ、CPU は答える', () => {
        vi.useFakeTimers();
        const players = [{ name: 'あなた' }, { name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'normal' }];
        const controller = new LocalGameController({ players, options: { seed: 3, startPlayer: 0 } });
        controller.send({ type: 'action', action: 'tax' });
        vi.advanceTimersByTime(5000);
        expect(controller.game.commands.length).toBeGreaterThan(1);
        controller.stop();
    });
});
