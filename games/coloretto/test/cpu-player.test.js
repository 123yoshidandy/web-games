import { describe, it, expect } from 'vitest';
import Game, { JOKER, PLUS2, ROW_LIMIT } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, gainOf, PROFILES } from '../public/js/cpu-player.js';
import { players, setup, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

describe('CPU', () => {
    it.each([3, 4, 5])('全員 CPU の%i人戦が、20シードとも最後まで進み、記録から再現できる', (n) => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game(players(n, true), { seed });
            let steps = 0;
            while (!game.isOver() && steps++ < 5000) expect(runCpuStep(game)).toBe(true);
            expect(game.isOver()).toBe(true);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('どの強さでも、通る手を選ぶ', () => {
        Object.values(PROFILES).forEach(profile => {
            const game = new Game(players(4, true), { seed: 5 });
            for (let i = 0; i < 400 && !game.isOver(); i++) {
                const command = chooseCpuCommand(game, game.current, profile);
                expect(game.applyCommand(game.current, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
            }
        });
    });

    it('山札の並びをのぞかない', () => {
        const a = new Game(players(4, true), { seed: 8 });
        const b = new Game(players(4, true), { seed: 8 });
        b.deck.reverse();
        expect(chooseCpuCommand(a, a.current, PROFILES.strong)).toEqual(chooseCpuCommand(b, b.current, PROFILES.strong));
    });

    it('得点の増え方：集めている色と +2 は得、4色目はマイナス', () => {
        const game = new Game(players(4, true), { seed: 2 });
        const p = game.players[0];
        Object.assign(p.counts, { red: 3, blue: 3, green: 3, yellow: 0, orange: 0, purple: 0, brown: 0 });
        expect(gainOf(p, ['red'], 'brown')).toBe(4);
        expect(gainOf(p, [PLUS2], 'brown')).toBe(2);
        expect(gainOf(p, ['yellow'], 'brown')).toBe(-1);
        expect(gainOf(p, [JOKER], 'brown')).toBe(4);
    });

    it('3枚そろった得な列は取る。置ける列がなければ必ず取る', () => {
        const game = new Game(players(3, true), { seed: 2 });
        const color = game.colors[0];
        Object.assign(game.players[0].counts, { [color]: 3 });
        setup(game, { rows: [[color, color, PLUS2], [], []] });
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual({ type: 'take', row: 0 });
        setup(game, { rows: [Array(ROW_LIMIT).fill(game.colors[1]), Array(ROW_LIMIT).fill(game.colors[2]), { cards: [], taken: true }] });
        expect(chooseCpuCommand(game, 0, PROFILES.strong).type).toBe('take');
    });

    it('でたらめに打つ CPU には勝ち越し、揺れのない CPU には負け越す（強すぎない）', () => {
        const easy = runMatches({ games: 100, profiles: ['normal', 'random', 'random', 'random'] });
        expect(easy.wins[0] / easy.finished).toBeGreaterThan(0.5);
        const hard = runMatches({ games: 100, profiles: ['normal', 'strong', 'strong', 'strong'] });
        expect(hard.wins[0] / hard.finished).toBeLessThan(0.25);
    });
});

describe('ファズ（ランダムな操作）', () => {
    it.each([3, 4, 5])('%i人：ランダムな操作でも、列は3枚まで・カードの総数が保たれ、断った操作で状態が変わらない', (n) => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = new Game(players(n), { seed });
            const total = game.colors.length * 9 + 3 + 10 + 1;
            let x = seed * 7919;
            const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
            for (let step = 0; step < 2000 && !game.isOver(); step++) {
                const seat = rand() < 0.9 ? game.current : Math.floor(rand() * n);
                const command = rand() < 0.4 ? { type: 'draw' } : { type: rand() < 0.5 ? 'place' : 'take', row: Math.floor(rand() * (n + 1)) };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) {
                    expect(snapshot(game)).toBe(before);
                    if (rand() < 0.3) runCpuStep(game);
                }
                game.rows.forEach(row => expect(row.cards.length).toBeLessThanOrEqual(ROW_LIMIT));
                const held = game.players.reduce((s, p) => s + Object.values(p.counts).reduce((a, b) => a + b, 0) + p.jokers + p.plus2, 0);
                // 取られた列のカードは、表示のために列にも残しているので数えない
                const onRows = game.rows.reduce((s, r) => s + (r.taken ? 0 : r.cards.length), 0);
                expect(held + onRows + game.deck.length + (game.pending ? 1 : 0) + (game.lastRound ? 1 : 0)).toBe(total);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
