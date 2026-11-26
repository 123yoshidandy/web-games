import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';
import { players } from './helpers.js';

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        const game = new Game(players(3), { seed: 5 });
        for (let step = 0; step < 3000 && !game.isOver(); step++) {
            if (game.actors().includes(0)) {
                const command = suggest(createGameView(game, 0));
                expect(game.applyCommand(0, command), game.lastError).toBe(true);
            } else {
                expect(suggest(createGameView(game, 0))).toBeNull();
                runCpuStep(game);
            }
        }
        expect(game.isOver()).toBe(true);
    });
});
