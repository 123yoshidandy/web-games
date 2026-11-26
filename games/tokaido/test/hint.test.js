import { describe, it, expect } from 'vitest';
import { suggest, chooseCommand, runCpuStep, nextCpuSeat } from '../public/js/cpu-player.js';
import { newGame } from './helpers.js';

const snapshot = (game) => JSON.stringify(game.persist());

describe('ヒント（suggest）', () => {
    it('人が操作する番に、CPU（ふつう）と同じ手をすすめ、その手が通る（旅の終わりまで）', () => {
        const game = newGame(3, 4);
        let suggested = 0;
        for (let i = 0; i < 3000 && game.phase !== 'end'; i++) {
            if (game.actors().includes(0)) {
                const before = snapshot(game);
                const command = suggest(game, 0);
                expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
                expect(command).toEqual(chooseCommand(game, 0, 'normal'));
                expect(game.applyCommand(0, command)).toBe(true);
                suggested++;
            } else runCpuStep(game, nextCpuSeat(game));
        }
        expect(game.phase).toBe('end');
        expect(suggested).toBeGreaterThan(10);
    });

    it('操作する番でなければ null', () => {
        const game = newGame(3, 4);
        for (let i = 0; i < 200 && game.actors().includes(0); i++) game.applyCommand(0, suggest(game, 0));
        expect(game.actors().includes(0)).toBe(false);
        expect(suggest(game, 0)).toBe(null);
    });
});
