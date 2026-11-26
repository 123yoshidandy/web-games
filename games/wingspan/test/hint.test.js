import { describe, it, expect } from 'vitest';
import { suggest, chooseCpuCommand, runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';
import { makeGame, snapshot } from './helpers.js';

describe('ヒント（suggest）', () => {
    it('人が答える番に、CPU（ふつう）と同じ手をすすめ、その手が通る（ゲームの終わりまで）', () => {
        const game = makeGame(2, 6);
        game.players[1].isCPU = true;
        let suggested = 0;
        for (let i = 0; i < 3000 && game.phase !== 'end'; i++) {
            if (game.actors().includes(0)) {
                const before = snapshot(game);
                const command = suggest(game, 0);
                expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
                expect(command).toEqual(chooseCpuCommand(game, 0, PROFILES.normal));
                if (game.applyCommand(0, command)) suggested++;
                else runCpuStep(game, 0);
            } else runCpuStep(game, cpuActors(game)[0]);
        }
        expect(game.phase).toBe('end');
        expect(suggested).toBeGreaterThan(20);
    });

    it('答える番でなければ null', () => {
        const game = makeGame(2, 6);
        game.players[1].isCPU = true;
        for (let i = 0; i < 200 && game.actors().includes(0); i++) game.applyCommand(0, suggest(game, 0));
        expect(game.actors().includes(0)).toBe(false);
        expect(suggest(game, 0)).toBe(null);
    });
});
