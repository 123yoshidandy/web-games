import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, newGame, giveStorage, setDice } from './helpers.js';

describe('CPU どうしの試合', () => {
    it('人数（2〜4）・強さ・シードを変えても、最後まで進む', () => {
        for (const count of [2, 3, 4]) {
            for (const levels of [Array(count).fill('easy'), Array(count).fill('normal'), Array.from({ length: count }, (_, i) => (i % 2 ? 'normal' : 'easy'))]) {
                const r = runMatches({ games: 5, count, levels, seedBase: count * 100 });
                expect(r.stuck, `${count}人 ${levels.join(',')}`).toBe(0);
                expect(r.finished).toBe(5);
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人）', () => {
        const r = runMatches({ games: 120, count: 2, levels: ['easy', 'normal'] });
        expect(r.wins[1] / r.finished).toBeGreaterThan(0.6);
    });
});

describe('CPU の判断', () => {
    it('山の並びと先のフェーズの商品が変わっても、同じ手を選ぶ（のぞかない）', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const a = new Game(players(3, true).map(p => ({ ...p, cpuLevel: 'normal' })), { seed });
            let guard = 0;
            while (!a.isOver() && guard++ < 30 + seed * 9) {
                const seat = a.actors()[0];
                a.applyCommand(seat, chooseCommand(a, seat));
            }
            if (a.isOver()) continue;
            const seat = a.actors()[0];
            const b = Game.replay(a.persist().players, a.options, a.persist().commands);
            Object.values(b.supply).forEach(list => list.reverse());
            b.goodsPiles.forEach(pile => pile.reverse());
            expect(chooseCommand(b, seat)).toEqual(chooseCommand(a, seat));
        }
    });

    it('地域を埋めて点になるなら、置く', () => {
        const game = newGame(2);
        game.players[0].isCPU = true;
        game.players[0].cpuLevel = 'normal';
        setDice(game, 0, [3, 5]);
        const tower = giveStorage(game, 0, t => t.building === 'watchtower');
        const command = chooseCommand(game, 0);
        expect(command).toMatchObject({ type: 'place', die: 0, tile: tower });
    });
});
