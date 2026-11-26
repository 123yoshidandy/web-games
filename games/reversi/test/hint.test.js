import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、合法手で最後まで進む', () => {
        for (const level of ['easy', 'normal']) {
            const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: level }]);
            for (let step = 0; step < 200 && !game.isOver(); step++) {
                if (game.current === 0) {
                    const command = suggest(game, 0);
                    expect(command).toBeTruthy();
                    expect(game.applyCommand(0, command), JSON.stringify(command)).toBe(true);
                } else runCpuStep(game);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('人の番でなければ出さない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }]);
        expect(suggest(game, 1 - game.current)).toBeNull();
    });
});
