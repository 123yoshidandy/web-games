import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand } from '../public/js/cpu-player.js';
import { players } from './helpers.js';

describe('CPU の乱数', () => {
    it('乱数を渡さなくても、同じ局面なら同じ手を選ぶ（Math.random を使わない）', () => {
        const game = new Game(players(2, true), { seed: 5 });
        const seat = game.actors()[0];
        const command = chooseCommand(createGameView(game, seat));
        expect(command).toBeTruthy();
        expect(chooseCommand(createGameView(game, seat))).toEqual(command);
    });
});
