import { describe, it, expect } from 'vitest';
import { suggest, chooseCommand, runCpuStep } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { makeGame } from './helpers.js';

const snapshot = (game) => JSON.stringify(game.persist());

describe('ヒント（suggest）', () => {
    it('CPU（ふつう）と同じ手をすすめ、その手が通る（ゲームの終わりまで）', () => {
        const game = makeGame(2, 3);
        let suggested = 0;
        for (let i = 0; i < 3000 && game.phase !== 'end'; i++) {
            const seat = game.actors()[0];
            const view = createGameView(game, seat);
            const before = snapshot(game);
            const command = suggest(view);
            expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
            expect(command).toEqual(chooseCommand(view, 'normal'));
            if (game.applyCommand(seat, command)) suggested++;
            else {
                game.players[seat].isCPU = true;
                runCpuStep(game, 'normal', seat);
                game.players[seat].isCPU = false;
            }
        }
        expect(game.phase).toBe('end');
        expect(suggested).toBeGreaterThan(30);
    });

    it('自分の番でなければ null', () => {
        const game = makeGame(2, 3);
        for (let i = 0; i < 20 && game.actors().includes(0); i++) game.applyCommand(0, suggest(createGameView(game, 0)));
        expect(game.actors().includes(0)).toBe(false);
        expect(suggest(createGameView(game, 0))).toBe(null);
    });
});
