import { describe, it, expect } from 'vitest';
import Game, { CAMEL, GOODS, HAND_LIMIT } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES } from '../public/js/cpu-player.js';
import { players, setup, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const D = 'diamond', C = 'cloth', P = 'spice', L = 'leather', K = CAMEL;

describe('CPU', () => {
    it('全員 CPU の試合が、30シードとも最後まで進み、記録から再現できる', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const game = new Game(players(true), { seed });
            let steps = 0;
            while (!game.isOver() && steps++ < 5000) expect(runCpuStep(game)).toBe(true);
            expect(game.isOver()).toBe(true);
            expect(game.players[game.winner].seals).toBe(2);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('どの強さでも、通る手を選ぶ', () => {
        Object.values(PROFILES).forEach(profile => {
            const game = new Game(players(true), { seed: 5 });
            for (let i = 0; i < 300 && !game.isOver(); i++) {
                const command = chooseCpuCommand(game, game.current, profile);
                expect(game.applyCommand(game.current, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
            }
        });
    });

    it('相手の手札をのぞかない（相手の手札だけを変えても、同じ手を選ぶ）', () => {
        const a = new Game(players(true), { seed: 8 });
        const b = new Game(players(true), { seed: 8 });
        const other = 1 - a.current;
        b.players[other].hand = [L, L, L, P];
        expect(chooseCpuCommand(a, a.current, PROFILES.strong)).toEqual(chooseCpuCommand(b, b.current, PROFILES.strong));
    });

    it('ダイヤが4枚そろっていたら売る', () => {
        const game = new Game(players(true), { seed: 2 });
        setup(game, { hands: [[D, D, D, D, C, P, L]], market: [K, K, C, P, L] });
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual({ type: 'sell', good: D, count: 4 });
    });

    it('手札が7枚でも、通る手を選ぶ', () => {
        const game = new Game(players(true), { seed: 2 });
        setup(game, { hands: [[D, 'gold', 'silver', C, P, L, L]], herds: [0, 0], market: [D, 'gold', 'silver', C, P] });
        const command = chooseCpuCommand(game, 0, PROFILES.strong);
        expect(game.applyCommand(0, command)).toBe(true);
        expect(game.players[0].hand.length).toBeLessThanOrEqual(HAND_LIMIT);
    });

    it('でたらめに打つ CPU には大きく勝ち越し、見落としのない CPU には負け越す（強すぎない）', () => {
        const easy = runMatches({ games: 100, profiles: ['normal', 'random'] });
        expect(easy.wins[0] / easy.finished).toBeGreaterThan(0.85);
        const hard = runMatches({ games: 200, profiles: ['normal', 'strong'] });
        expect(hard.wins[0] / hard.finished).toBeLessThan(0.48);
    });
});

describe('ファズ（ランダムな操作）', () => {
    it('ランダムな操作でも、カード55枚と手札7枚以内が保たれ、断った操作で状態が変わらない', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game(players(), { seed });
            let x = seed * 7919;
            const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
            const pick = (list) => list[Math.floor(rand() * list.length)];
            for (let step = 0; step < 800 && !game.isOver(); step++) {
                const seat = rand() < 0.9 ? game.current : 1 - game.current;
                const type = pick(['take', 'camels', 'exchange', 'sell', 'sell']);
                const command = type === 'take' ? { type, index: Math.floor(rand() * 6) }
                    : type === 'exchange' ? { type, take: [0, 1, 2, 3, 4].filter(() => rand() < 0.4), give: { [pick([...GOODS, K])]: 1 + Math.floor(rand() * 3), [pick([...GOODS, K])]: Math.floor(rand() * 2) } }
                        : type === 'sell' ? { type, good: pick(GOODS), count: 1 + Math.floor(rand() * 4) } : { type };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) {
                    expect(snapshot(game)).toBe(before);
                    if (rand() < 0.3) runCpuStep(game);
                }
                const cards = [...game.deck, ...game.market.filter(c => c !== null), ...game.players.flatMap(p => [...p.hand, ...Array(p.herd).fill(K)])];
                const sold = game.players.reduce((s, p) => s + p.tokens.length, 0);
                expect(cards.length).toBeLessThanOrEqual(55);
                game.players.forEach(p => expect(p.hand.length).toBeLessThanOrEqual(HAND_LIMIT));
                expect(sold).toBeGreaterThanOrEqual(0);
                if (!game.isOver()) expect(game.market.every(c => c !== null)).toBe(true);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
