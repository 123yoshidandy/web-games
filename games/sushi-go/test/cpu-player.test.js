import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, isCpuTurn } from '../public/js/cpu-player.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { setHand, setTableau } from './helpers.js';

const cpuGame = (n) => new Game([{ name: 'A' }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: 'normal' }))], { seed: 1 });

describe('CPU どうしの試合', () => {
    it('人数・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 2; count <= 5; count++) {
            for (const mix of [['normal'], ['easy'], ['easy', 'normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 20; seed++) {
                    const game = playMatch({ count, levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 200, count: 2, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(140);
    });
});

describe('CPU の判断', () => {
    it('天ぷらの2枚目・刺身の3枚目をそろえる', () => {
        const game = cpuGame(3);
        setTableau(game, 1, ['tempura']);
        setHand(game, 1, ['tempura', 'egg', 'maki1', 'chopsticks']);
        expect(chooseCommand(game, 1, 'normal')).toEqual({ type: 'pick', card: 'tempura' });
        setTableau(game, 1, ['sashimi', 'sashimi']);
        setHand(game, 1, ['sashimi', 'salmon', 'dumpling']);
        expect(chooseCommand(game, 1, 'normal')).toEqual({ type: 'pick', card: 'sashimi' });
    });

    it('わさびがあれば、イカにぎりを載せる', () => {
        const game = cpuGame(3);
        setTableau(game, 1, ['wasabi']);
        setHand(game, 1, ['squid', 'tempura', 'dumpling', 'maki2']);
        expect(chooseCommand(game, 1, 'normal').card).toBe('squid');
    });

    it('箸があれば、よい2枚を取る', () => {
        const game = cpuGame(3);
        setTableau(game, 1, ['chopsticks', 'tempura', 'sashimi', 'sashimi']);
        setHand(game, 1, ['tempura', 'sashimi', 'egg']);
        const command = chooseCommand(game, 1, 'normal');
        expect([command.card, command.second].sort()).toEqual(['sashimi', 'tempura']);
        expect(game.applyCommand(1, command)).toBe(true);
    });

    it('人がまだ選んでいなくても、CPU は選べる（同時に選ぶ）', () => {
        const game = cpuGame(3);
        expect(isCpuTurn(game)).toBe(true);
        expect(game.actors()).toEqual([0, 1, 2]);
    });
});
