import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, chooseCpuCommand, runCpuStep, cpuActor, PROFILES } from '../public/js/cpu-player.js';

const players = () => [0, 1, 2, 3].map(i => ({ name: `P${i}`, isCPU: i !== 0 }));
const snapshot = (game) => JSON.stringify(game.persist());

describe('ヒント（suggest）', () => {
    it('人の番には CPU と同じ手をすすめ、その手が通る（ゲームの終わりまで）', () => {
        const game = new Game(players(), { seed: 3, target: 200 });
        let suggested = 0;
        for (let i = 0; i < 3000 && !game.isOver(); i++) {
            if (game.actors().includes(0)) {
                const before = snapshot(game);
                const command = suggest(game, 0);
                expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
                expect(command).toEqual(chooseCpuCommand(game, 0, PROFILES.normal));
                expect(game.applyCommand(0, command)).toBe(true);
                suggested++;
            } else runCpuStep(game, cpuActor(game));
        }
        expect(game.isOver()).toBe(true);
        expect(suggested).toBeGreaterThan(10);
    });

    it('操作する番でない人と、終わったゲームでは null', () => {
        const game = new Game(players(), { seed: 3 });
        let checked = false;
        for (let i = 0; i < 500 && !checked; i++) {
            if (game.actors().includes(0)) game.applyCommand(0, suggest(game, 0));
            else {
                expect(suggest(game, 0)).toBe(null);
                checked = true;
            }
        }
        expect(checked).toBe(true);
        game.phase = 'end';
        expect(suggest(game, 0)).toBe(null);
    });
});
