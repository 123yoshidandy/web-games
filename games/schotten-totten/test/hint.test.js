import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

const newGame = (seed, tactics) => new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed, tactics });

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む（戦術カードありも）', () => {
        for (const tactics of [false, true]) {
            for (let seed = 1; seed <= 6; seed++) {
                const game = newGame(seed, tactics);
                for (let step = 0; step < 1000 && !game.isOver(); step++) {
                    if (game.actor() === 0) {
                        const command = suggest(game, 0);
                        expect(command).toBeTruthy();
                        expect(game.applyCommand(0, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
                    } else runCpuStep(game);
                }
                expect(game.isOver()).toBe(true);
            }
        }
    });

    it('人の番でなければ出さない', () => {
        const game = newGame(1, true);
        expect(suggest(game, 1 - game.actor())).toBeNull();
    });
});
