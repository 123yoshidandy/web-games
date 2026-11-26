import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, legalActions, answerPrompt } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2])('人がおすすめの手だけを選んでも、手が通る（シード %i）', (seed) => {
        const game = new Game(players(2), { seed });
        for (let i = 0; i < 40 && !game.isOver(); i++) {
            const prompt = game.prompt;
            if (prompt) {
                expect(game.applyCommand(prompt.player, { type: 'answer', id: prompt.id, values: answerPrompt(game, prompt.player, prompt) })).toBe(true);
                continue;
            }
            const seat = game.turn;
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(legalActions(game, seat).map(c => JSON.stringify(c))).toContain(JSON.stringify(command));
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
    });

    it('手番でない人には出さない', () => {
        const game = new Game(players(2), { seed: 3 });
        expect(suggest(game, 1 - game.turn)).toBe(null);
    });
});
