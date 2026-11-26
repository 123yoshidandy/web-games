import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの手だけを指しても、合法手で進む（先手・後手）', () => {
        for (const human of [0, 1]) {
            const players = [0, 1].map(i => (i === human ? { name: 'あなた' } : { name: 'CPU', isCPU: true, cpuLevel: 'easy' }));
            const game = new Game(players, {});
            for (let step = 0; step < 120 && !game.isOver(); step++) {
                if (game.current === human) {
                    const command = suggest(game, human);
                    expect(command).toBeTruthy();
                    expect(game.applyCommand(human, command), JSON.stringify(command)).toBe(true);
                } else runCpuStep(game);
            }
            expect(game.ply).toBeGreaterThan(20);
        }
    });

    it('人の番でなければ出さない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], {});
        expect(suggest(game, 1 - game.current)).toBeNull();
    });
});
