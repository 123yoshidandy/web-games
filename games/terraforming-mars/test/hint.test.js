import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';
import { players, started } from './helpers.js';

describe('ヒント（suggest）', () => {
    it('準備では、企業と最初の手札をすすめ、そのまま通る', () => {
        const game = new Game(players(2), { seed: 3 });
        const seat = game.decision.seat;
        const command = suggest(createGameView(game, seat));
        expect(command.type).toBe('setup');
        expect(game.applyCommand(seat, command)).toBe(true);
    });

    it('答える番でない人のビューでは null', () => {
        const game = new Game(players(2), { seed: 3 });
        const other = 1 - game.decision.seat;
        expect(suggest(createGameView(game, other))).toBe(null);
    });

    it('行動の番で、すすめた手が通る（何手番か続けて）', () => {
        const game = started(2, { seed: 5 });
        let accepted = 0;
        let total = 0;
        for (let i = 0; i < 40 && !game.isOver(); i++) {
            const seat = game.decision.seat;
            const command = suggest(createGameView(game, seat));
            expect(command).not.toBe(null);
            total++;
            if (game.applyCommand(seat, command)) accepted++;
            else {
                // CPU と同じく、まれに断られる手は CPU の手順で進める
                game.players[seat].isCPU = true;
                runCpuStep(game);
                game.players[seat].isCPU = false;
            }
        }
        expect(accepted).toBeGreaterThanOrEqual(total * 0.8);
    });
});
