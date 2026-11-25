import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, simplestCommand, evaluate } from '../public/js/cpu-player.js';
import { PATTERNS } from '../public/js/data.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { startPlay, setPool, die, windowOf } from './helpers.js';

describe('CPU', () => {
    it('CPU どうしの試合が、人数（1〜4）・強さ・シードを変えても止まらずに終わる', () => {
        for (const n of [1, 2, 3, 4]) {
            for (const levels of [Array(n).fill('normal'), Array(n).fill('easy'), Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal'))]) {
                const r = runMatches({ games: 6, levels, seedBase: n * 100, soloTools: 1 + (n % 5) });
                expect(r.stuck).toBe(0);
                expect(r.finished).toBe(6);
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人・3人）', () => {
        const two = runMatches({ games: 80, levels: ['normal', 'easy'], seedBase: 7 });
        expect(two.wins.normal / two.finished).toBeGreaterThan(0.6);
        const three = runMatches({ games: 60, levels: ['normal', 'easy', 'easy'], seedBase: 7 });
        expect(three.wins.normal / three.finished).toBeGreaterThan(0.4);
    });

    it('CPU の手は、そのままゲームに受け付けられる（いちばん単純な答えに頼らない）', () => {
        for (const seed of [1, 2]) {
            const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }, { name: 'c', isCPU: true, cpuLevel: 'easy' }], { seed });
            game.tools = ['grozing', 'grinding', 'cork'].map(id => ({ id, tokens: 0, used: false }));
            let steps = 0;
            let tools = 0;
            while (!game.isOver() && steps++ < 2000) {
                const seat = game.actors()[0];
                const command = chooseCommand(game, seat);
                if (command.type === 'tool') tools++;
                expect(game.applyCommand(seat, command), JSON.stringify(command) + game.lastError).toBe(true);
            }
            expect(game.isOver()).toBe(true);
            expect(tools).toBeGreaterThan(0);
        }
    });

    it('CPU はビューだけを見て決める（袋の中身やほかの人の個人の目標を入れ替えても、手が変わらない）', () => {
        const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }, { name: 'c', isCPU: true, cpuLevel: 'easy' }], { seed: 21 });
        let steps = 0;
        while (!game.isOver() && steps++ < 2000) {
            const seat = game.actors()[0];
            const command = chooseCommand(game, seat);
            const privates = game.players.map(p => [...p.privates]);
            const offers = game.players.map(p => [...p.offers]);
            const random = game.random;
            game.players.forEach(p => { if (p.id !== seat) { p.privates = ['red']; p.offers = [0, 1, 2, 3]; } });
            game.random = () => 0.5;
            expect(chooseCommand(game, seat)).toEqual(command);
            game.players.forEach((p, i) => { p.privates = privates[i]; p.offers = offers[i]; });
            game.random = random;
            expect(game.applyCommand(seat, command)).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('置ける場所を残す：同じ色や目の制約のマスの隣をふさがない', () => {
        // 制約なしの窓で、赤の制約マスの隣に赤を置くより、離して置く方を高く見る
        const pattern = { ...PATTERNS[0], cells: Array(20).fill(null) };
        pattern.cells[1] = { color: 'red' };
        const ctx = { objectives: [], privates: ['blue'] };
        const nextToRed = Array(20).fill(null);
        nextToRed[0] = die('red', 3);
        const away = Array(20).fill(null);
        away[4] = die('red', 3);
        expect(evaluate(away, pattern, ctx)).toBeGreaterThan(evaluate(nextToRed, pattern, ctx));
    });

    it('置けるなら置き、置いたら番を終える', () => {
        const game = startPlay(2, [], 5);
        game.players.forEach(p => { p.isCPU = true; });
        const seat = game.turn.seat;
        setPool(game, [die('red', 3), die('blue', 4)]);
        const command = chooseCommand(game, seat);
        expect(['draft', 'tool']).toContain(command.type);
        runCpuStep(game, seat);
        if (game.turn?.seat === seat) expect(chooseCommand(game, seat)).toEqual({ type: 'end' });
        void windowOf;
    });

    it('いちばん単純な答えでも、必ず受け付けられる', () => {
        const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }], { seed: 4 });
        let steps = 0;
        while (!game.isOver() && steps++ < 2000) {
            const seat = game.actors()[0];
            expect(game.applyCommand(seat, simplestCommand(game, seat))).toBe(true);
        }
        expect(game.isOver()).toBe(true);
        expect(runCpuStep(game)).toBe(null);
    });
});
