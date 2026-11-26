import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuRound } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('選ぶ番には通る手を返し、選び終えたら返さない。ヒントを見ても記録は変わらない', () => {
        for (const count of [2, 4]) {
            const players = [{ name: 'あなた', isCPU: false }, ...Array.from({ length: count - 1 }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }))];
            const c = new LocalGameController({ players, options: { seed: 11 + count } });
            c.stop();
            let hints = 0;
            for (let step = 0; step < 200 && !c.game.isOver(); step++) {
                const before = c.game.commands.length;
                const move = c.hint();
                expect(c.game.commands.length).toBe(before);
                if (move) {
                    hints++;
                    expect(c.send(move)).toBe(true);
                    c.stop();
                    expect(c.hint()).toBeNull();
                } else {
                    runCpuRound(c.game);
                }
            }
            expect(c.game.isOver()).toBe(true);
            // 2 人のときは箱に戻す番もある
            expect(hints).toBeGreaterThanOrEqual(12);
        }
    });
});
