import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, decide, runCpuStep, cpuActors } from '../public/js/cpu-player.js';
import { players } from './helpers.js';

const snapshot = (game) => JSON.stringify(game.persist());

describe('ヒント（suggest）', () => {
    it('人が操作する番に、CPU（ふつう）と同じ手をすすめ、その手が通る（ゲームの終わりまで）', () => {
        const game = new Game(players(3), { seed: 8 });
        game.players[0].cpuLevel = undefined;
        let suggested = 0;
        for (let i = 0; i < 5000 && game.season !== 'end'; i++) {
            if (game.actors().includes(0)) {
                const before = snapshot(game);
                const command = suggest(game, 0);
                expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
                expect(command).toEqual(decide(game, 0));
                if (game.applyCommand(0, command)) suggested++;
                else {
                    game.players[0].isCPU = true;
                    runCpuStep(game, 0);
                    game.players[0].isCPU = false;
                }
            } else runCpuStep(game, cpuActors(game)[0]);
        }
        expect(game.season).toBe('end');
        expect(suggested).toBeGreaterThan(20);
    });

    it('操作する番でなければ null', () => {
        const game = new Game(players(3), { seed: 8 });
        for (let i = 0; i < 50 && game.actors().includes(0); i++) game.applyCommand(0, suggest(game, 0));
        expect(game.actors().includes(0)).toBe(false);
        expect(suggest(game, 0)).toBe(null);
    });
});
