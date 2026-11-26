import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep, cpuActors } from '../public/js/cpu-player.js';

const MAX_STEPS = 20000;
const FACTIONS = ['marquise', 'eyrie', 'alliance', 'vagabond'];

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        FACTIONS.forEach((faction, k) => {
            const order = [faction, ...FACTIONS.filter(f => f !== faction)];
            const game = new Game(order.map((f, i) => ({ name: `P${i}`, faction: f, isCPU: i > 0 })), { seed: k + 1 });
            for (let step = 0; step < MAX_STEPS && !game.isOver(); step++) {
                if (game.actors().includes(0)) {
                    const command = suggest(game, 0);
                    expect(command, faction).toBeTruthy();
                    expect(game.applyCommand(0, command), `${faction} ${JSON.stringify(command)}`).toBe(true);
                } else runCpuStep(game, cpuActors(game)[0]);
            }
            expect(game.isOver(), faction).toBe(true);
        });
    });

    it('人の番でなければ出さない', () => {
        const game = new Game(FACTIONS.map((f, i) => ({ name: `P${i}`, faction: f, isCPU: i > 0 })), { seed: 1 });
        const waiting = [0, 1, 2, 3].find(seat => !game.actors().includes(seat));
        expect(suggest(game, waiting)).toBeNull();
    });
});
