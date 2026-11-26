import { describe, it, expect } from 'vitest';
import { createGameView } from '../public/js/game-view.js';
import { suggest, decide, runCpuStep } from '../public/js/cpu-player.js';
import { newGame } from './helpers.js';

const snapshot = (game) => JSON.stringify(game.persist());

describe('ヒント（suggest）', () => {
    it('人の番に、CPU（ふつう）と同じ手をすすめ、その手が通る（ゲームの終わりまで）', () => {
        const game = newGame(3, 6);
        let suggested = 0;
        for (let i = 0; i < 500 && !game.isOver(); i++) {
            const view = createGameView(game, 0);
            if (game.current === 0 && game.players[0].alive) {
                const before = snapshot(game);
                const command = suggest(view);
                expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
                expect(command).toEqual(decide(view, 'normal'));
                expect(game.applyCommand(0, command)).toBe(true);
                suggested++;
            } else expect(suggest(view)).toBe(null);
            if (!game.isOver() && game.players[game.current].isCPU) runCpuStep(game);
        }
        expect(game.isOver()).toBe(true);
        expect(suggested).toBeGreaterThan(1);
    });
});
