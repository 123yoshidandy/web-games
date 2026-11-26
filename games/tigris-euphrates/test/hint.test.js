import { describe, it, expect } from 'vitest';
import { suggest, chooseCommand, runCpuStep, nextCpuSeat } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { newGame, snapshot } from './helpers.js';

describe('ヒント（suggest）', () => {
    it('人が答える番に、CPU（ふつう）と同じ手をすすめ、その手が通る（ゲームの終わりまで）', () => {
        const game = newGame(3, 5);
        let suggested = 0;
        for (let i = 0; i < 4000 && !game.isOver(); i++) {
            if (game.actors().includes(0)) {
                const view = createGameView(game, 0);
                const before = snapshot(game);
                const command = suggest(view);
                expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
                expect(command).toEqual(chooseCommand(view, 'normal'));
                if (game.applyCommand(0, command)) suggested++;
                else {
                    game.players[0].isCPU = true;
                    runCpuStep(game, 0, 'normal');
                    game.players[0].isCPU = false;
                }
            } else runCpuStep(game, nextCpuSeat(game));
        }
        expect(game.isOver()).toBe(true);
        expect(suggested).toBeGreaterThan(20);
    });

    it('答える番でなければ null', () => {
        const game = newGame(3, 5);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'pass' });
        expect(game.actors().includes(0)).toBe(false);
        expect(suggest(createGameView(game, 0))).toBe(null);
    });
});
