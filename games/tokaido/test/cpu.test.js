import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, simplestCommand } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { startTravel, place, moveTo } from './helpers.js';

describe('CPU', () => {
    it('CPU どうしの試合が、人数（2〜5）・強さ・シードを変えても止まらずに終わる', () => {
        for (const n of [2, 3, 4, 5]) {
            for (const levels of [Array(n).fill('normal'), Array(n).fill('easy'), Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal'))]) {
                const r = runMatches({ games: 12, levels, seedBase: n * 100 });
                expect(r.stuck).toBe(0);
                expect(r.finished).toBe(12);
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人・3人）', () => {
        const two = runMatches({ games: 100, levels: ['normal', 'easy'], seedBase: 7 });
        expect(two.wins.normal / two.finished).toBeGreaterThan(0.65);
        const three = runMatches({ games: 90, levels: ['normal', 'easy', 'easy'], seedBase: 7 });
        expect(three.wins.normal / three.finished).toBeGreaterThan(0.45);
    });

    it('CPU の手は、そのままゲームに受け付けられる（いちばん単純な答えに頼らない）', () => {
        for (const seed of [1, 2, 3]) {
            const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }, { name: 'c', isCPU: true, cpuLevel: 'easy' }], { seed });
            let steps = 0;
            while (!game.isOver() && steps++ < 3000) {
                const seat = game.actors().find(s => game.players[s].isCPU);
                const command = chooseCommand(game, seat);
                expect(game.applyCommand(seat, command), JSON.stringify(command) + game.lastError).toBe(true);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('CPU はビューだけを見て決める（山の並びやほかの人の伏せた札を入れ替えても、手が変わらない）', () => {
        const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }, { name: 'c', isCPU: true, cpuLevel: 'easy' }], { seed: 21 });
        let steps = 0;
        let compared = 0;
        while (!game.isOver() && steps++ < 3000) {
            const seat = game.actors()[0];
            const command = chooseCommand(game, seat);
            // 伏せた情報だけを入れ替えた写しで、同じ手になるか
            const decks = structuredClone(game.decks);
            const offers = game.players.map(p => [...p.offers]);
            Object.values(game.decks).forEach(d => d.reverse());
            game.players.forEach(p => { if (p.id !== seat) p.offers.reverse(); });
            if (game.inn && game.tokens[seat].pos !== game.inn.pos) game.inn.meals.reverse();
            expect(chooseCommand(game, seat)).toEqual(command);
            game.decks = decks;
            game.players.forEach((p, i) => { p.offers = offers[i]; });
            if (game.inn && game.tokens[seat].pos !== game.inn.pos) game.inn.meals.reverse();
            compared++;
            expect(game.applyCommand(seat, command)).toBe(true);
        }
        expect(game.isOver()).toBe(true);
        expect(compared).toBeGreaterThan(50);
    });

    it('景色の最後の1枚で称号が取れるなら、そこへ進む', () => {
        const game = startTravel(3, ['kinko', 'zenemon', 'umegae']);
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        game.players[0].panoramas.sea = 4;
        place(game, [9, 20, 21]);
        expect(chooseCommand(game, 0)).toEqual({ type: 'move', to: 11 });
    });

    it('食事は、払えるうちで一番安いものを選び、ただで出たものがあればそれを選ぶ', () => {
        const game = startTravel(3, ['kinko', 'zenemon', 'umegae']);
        game.players.forEach(p => { p.isCPU = true; });
        place(game, [13, 20, 21]);
        game.decks.meal = ['unagi:1', 'tofu:1', 'dango:1', 'soba:1', ...game.decks.meal.slice(4)];
        game.tokens[1].pos = 14;
        game.tokens[2].pos = 14;
        moveTo(game, 14);
        expect(chooseCommand(game, 0)).toEqual({ type: 'meal', card: 'dango:1' });
    });

    it('いちばん単純な答えでも、必ず受け付けられる', () => {
        const game = new Game([{ name: 'a', isCPU: true }, { name: 'b', isCPU: true }], { seed: 4 });
        let steps = 0;
        while (!game.isOver() && steps++ < 3000) {
            const seat = game.actors()[0];
            expect(game.applyCommand(seat, simplestCommand(game, seat))).toBe(true);
        }
        expect(game.isOver()).toBe(true);
        expect(runCpuStep(game)).toBe(null);
    });
});
