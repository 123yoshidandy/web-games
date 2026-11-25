import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, simplestCommand, atLeast, probability } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { STAR } from '../public/js/bids.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { newGame, setDice } from './helpers.js';

describe('CPU', () => {
    it('二項分布の確率', () => {
        expect(atLeast(3, 0.5, 0)).toBe(1);
        expect(atLeast(3, 0.5, 4)).toBe(0);
        expect(atLeast(3, 0.5, 3)).toBeCloseTo(0.125);
        expect(atLeast(2, 1 / 3, 1)).toBeCloseTo(5 / 9);
    });

    it('宣言が当たる確率：自分のダイスと見えているダイスは確か、カップの中は 1/3（星は 1/6）', () => {
        const game = newGame(2, 1);
        setDice(game, 0, [3, 3, STAR, 1, 2]);
        const view = createGameView(game, 0);
        expect(probability(view, { qty: 3, face: 3 })).toBe(1);
        expect(probability(view, { qty: 4, face: 3 })).toBeCloseTo(atLeast(5, 1 / 3, 1));
        expect(probability(view, { qty: 2, face: STAR })).toBeCloseTo(atLeast(5, 1 / 6, 1));
    });

    it('CPU どうしの試合が、人数（2〜6）・強さ・設定・シードを変えても止まらずに終わる', () => {
        for (const n of [2, 3, 4, 5, 6]) {
            for (const levels of [Array(n).fill('normal'), Array(n).fill('easy'), Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal'))]) {
                for (const lossOne of [false, true]) {
                    const r = runMatches({ games: 5, levels, seedBase: n * 100, lossOne });
                    expect(r.stuck).toBe(0);
                    expect(r.finished).toBe(5);
                }
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人・4人）', () => {
        const two = runMatches({ games: 150, levels: ['normal', 'easy'], seedBase: 7 });
        expect(two.wins.normal / two.finished).toBeGreaterThan(0.75);
        const four = runMatches({ games: 120, levels: ['normal', 'easy', 'easy', 'easy'], seedBase: 7 });
        expect(four.wins.normal / four.finished).toBeGreaterThan(0.45);
    });

    it('CPU の手は、そのままゲームに受け付けられる', () => {
        let rerolls = 0;
        for (const seed of [1, 2, 3]) {
            const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true, cpuLevel: 'easy' }, { name: 'c', isCPU: true }], { seed });
            let steps = 0;
            while (!game.isOver() && steps++ < 5000) {
                const seat = game.actors()[0];
                const command = chooseCommand(game, seat);
                if (command.reveal) rerolls++;
                expect(game.applyCommand(seat, command), JSON.stringify(command) + game.lastError).toBe(true);
            }
            expect(game.isOver()).toBe(true);
        }
        // ふつうは、ときどき振り直す（3試合のどこかで）
        expect(rerolls).toBeGreaterThan(0);
    });

    it('CPU はビューだけを見て決める（ほかの人のカップの中を入れ替えても、手が変わらない）', () => {
        const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }, { name: 'c', isCPU: true, cpuLevel: 'easy' }], { seed: 21 });
        let steps = 0;
        while (!game.isOver() && steps++ < 5000) {
            const seat = game.actors()[0];
            const command = chooseCommand(game, seat);
            const saved = game.players.map(p => p.dice.map(d => ({ ...d })));
            game.players.forEach(p => { if (p.id !== seat) p.dice.forEach(d => { if (!d.shown) d.value = (d.value % 6) + 1; }); });
            expect(chooseCommand(game, seat)).toEqual(command);
            game.players.forEach((p, i) => { p.dice = saved[i]; });
            expect(game.applyCommand(seat, command)).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('ありえない宣言は疑う', () => {
        const game = newGame(2, 3);
        game.players.forEach(p => { p.isCPU = true; });
        game.turn = 0;
        game.bid = { qty: 10, face: 2, seat: 1 };
        expect(chooseCommand(game, 0)).toEqual({ type: 'challenge' });
    });

    it('いちばん単純な答えでも、必ず受け付けられる', () => {
        const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }], { seed: 4 });
        let steps = 0;
        while (!game.isOver() && steps++ < 5000) {
            const seat = game.actors()[0];
            expect(game.applyCommand(seat, simplestCommand(game))).toBe(true);
        }
        expect(game.isOver()).toBe(true);
        expect(runCpuStep(game)).toBe(null);
    });
});
