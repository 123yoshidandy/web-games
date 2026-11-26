import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの操作だけを選んでも、操作が通って最後まで進む。番でないときは出さない', () => {
        for (let round = 0; round < 5; round++) {
            const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed: 900 + round });
            game.setup();
            const me = game.players.find(p => !p.isCPU).id;
            for (let step = 0; step < 10000 && game.phase !== 'end'; step++) {
                const command = suggest(game, me);
                if (command) {
                    const before = game.commands.length;
                    const ok = game.applyCommand(me, command);
                    expect(ok, JSON.stringify(command) + game.lastError + game.phase).toBe(true);
                    expect(game.commands.length).toBe(before + 1);
                } else {
                    runCpuStep(game);
                }
            }
            expect(game.phase).toBe('end');
        }
    });
});
