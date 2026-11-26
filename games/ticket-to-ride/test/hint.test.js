import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, snapshot } from './helpers.js';

describe('ヒント（suggest）', () => {
    it('人の番にすすめた手が通り、ゲームの終わりまで進められる', () => {
        const game = new Game(players(3), { seed: 2, level: 'normal' });
        let accepted = 0;
        for (let i = 0; i < 2000 && game.phase !== 'end'; i++) {
            const seat = game.actors()[0];
            const before = snapshot(game);
            const command = suggest(createGameView(game, seat));
            expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
            if (game.applyCommand(seat, command)) accepted++;
            else {
                game.players[seat].isCPU = true;
                runCpuStep(game, 'normal', seat);
                game.players[seat].isCPU = false;
            }
        }
        expect(game.phase).toBe('end');
        expect(accepted).toBeGreaterThan(50);
    });

    it('自分の番でなければ null', () => {
        const game = new Game(players(3), { seed: 2 });
        // 最初は全員が目的地を選ぶ。選び終えた人は、ほかの人を待つ
        const seat = game.actors()[0];
        game.applyCommand(seat, suggest(createGameView(game, seat)));
        expect(suggest(createGameView(game, seat))).toBe(null);
    });
});
