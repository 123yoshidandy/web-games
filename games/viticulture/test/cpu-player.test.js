import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, isCpuTurn, decide } from '../public/js/cpu-player.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { snapshot, toSummer, newGame, setHand, order } from './helpers.js';

describe('CPU どうしの試合', () => {
    it('人数・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 2; count <= 6; count++) {
            for (const mix of [['normal'], ['easy'], ['easy', 'normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 6; seed++) {
                    const game = playMatch({ levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.year, `${count}人 ${levels} seed ${seed}`).toBeLessThanOrEqual(20);
                }
            }
        }
    });

    it('ふつう同士の2人でも、ため込んで終わらない形にならない', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const game = playMatch({ levels: ['normal', 'normal'], seed });
            expect(game.isOver(), `seed ${seed}`).toBe(true);
            expect(game.year, `seed ${seed}`).toBeLessThanOrEqual(16);
        }
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 60, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(42);
    });

    it('CPU の試合も、操作の記録から同じ状態を再現できる', () => {
        for (const levels of [['easy', 'normal'], ['normal', 'easy', 'normal', 'easy']]) {
            const game = playMatch({ levels, seed: 7 });
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});

describe('CPU の判断', () => {
    it('判断で、ゲームの乱数と状態を変えない', () => {
        const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'easy' }], { seed: 4 });
        for (let i = 0; i < 80 && !game.isOver(); i++) {
            const before = snapshot(game);
            decide(game, game.actors()[0]);
            expect(snapshot(game)).toBe(before);
            runCpuStep(game);
        }
    });

    it('果たせる注文があれば、冬に注文の場所を選ぶ', () => {
        const game = toSummer(newGame(2));
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'pass' });
        while (game.pending) game.applyCommand(game.pending.seat, { type: 'choose', index: 0 });
        expect(game.season).toBe('winter');
        const seat = game.current;
        setHand(game, seat, [order('r4 w2')]);
        game.players[seat].structures.push('medium');
        game.players[seat].cellar.red = [5];
        game.players[seat].cellar.white = [3];
        expect(decide(game, seat)).toEqual({ type: 'place', action: 'fill', grande: false });
    });

    it('人間の番では動かない', () => {
        const game = newGame(2);
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(false);
    });
});
