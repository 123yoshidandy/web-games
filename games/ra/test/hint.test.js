import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { players } from './helpers.js';

describe('ヒント', () => {
    it('人の番には通る手を返し、CPU の番には返さない。ヒントを見ても記録は変わらない', () => {
        const c = new LocalGameController({ players: players(3), options: { seed: 7 } });
        let checked = 0;
        for (let step = 0; step < 300 && !c.game.isOver() && checked < 20; step++) {
            if (c.game.actors().includes(c.humanSeat)) {
                const before = c.game.commands.length;
                const move = c.hint();
                expect(move).toBeTruthy();
                expect(c.game.commands.length).toBe(before);
                expect(c.send(move)).toBe(true);
                checked++;
            } else {
                expect(c.hint()).toBeNull();
                runCpuStep(c.game);
            }
        }
        expect(checked).toBe(20);
        c.stop();
    });
});
