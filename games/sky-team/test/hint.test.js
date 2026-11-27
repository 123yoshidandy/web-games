import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

describe('ヒント', () => {
    it('人がおすすめの手だけを打っても、手が通って最後まで進む', () => {
        for (const airport of ['YUL', 'HND']) {
            for (let seed = 1; seed <= 3; seed++) {
                const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed, airport });
                for (let step = 0; step < 200 && !game.isOver(); step++) {
                    if (game.turn === 0) {
                        const command = suggest(game, 0);
                        expect(command).toBeTruthy();
                        expect(game.applyCommand(0, command), JSON.stringify(command)).toBe(true);
                    } else expect(runCpuStep(game, 1)).toBe(true);
                }
                expect(game.isOver()).toBe(true);
            }
        }
    });

    it('自分の番でなければ出さない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed: 2 });
        expect(suggest(game, 1)).toBeNull();
        expect(suggest(game, 0)).toBeTruthy();
    });

    it('相手のまだ置いていないダイスの目に左右されない（ビューだけを見る）', () => {
        const a = new Game([{ name: 'あなた' }, { name: 'CPU' }], { seed: 4 });
        const b = new Game([{ name: 'あなた' }, { name: 'CPU' }], { seed: 4 });
        b.dice[1] = b.dice[1].map(d => ({ ...d, value: 7 - d.value }));
        expect(suggest(a, 0)).toEqual(suggest(b, 0));
    });
});
