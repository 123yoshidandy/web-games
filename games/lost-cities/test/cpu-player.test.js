import { describe, it, expect } from 'vitest';
import Game, { CARDS, COLORS, HAND_SIZE } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES } from '../public/js/cpu-player.js';
import { players, card, setup, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const all = (game) => [...game.deck, ...COLORS.flatMap(c => game.discards[c]), ...game.players.flatMap(p => [...p.hand, ...COLORS.flatMap(c => p.expeditions[c])])];

describe('CPU', () => {
    it('全員 CPU の試合が、30シードとも最後まで進み、記録から再現できる', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const game = new Game(players(true), { seed });
            let steps = 0;
            while (!game.isOver() && steps++ < 5000) expect(runCpuStep(game)).toBe(true);
            expect(game.isOver()).toBe(true);
            expect(game.history).toHaveLength(3);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('どの強さでも、通る手を選ぶ', () => {
        Object.values(PROFILES).forEach(profile => {
            const game = new Game(players(true), { seed: 5 });
            for (let i = 0; i < 400 && !game.isOver(); i++) {
                const command = chooseCpuCommand(game, game.current, profile);
                expect(game.applyCommand(game.current, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
            }
        });
    });

    it('相手の手札と山札の並びをのぞかない', () => {
        const a = new Game(players(true), { seed: 8 });
        const b = new Game(players(true), { seed: 8 });
        const other = 1 - a.current;
        // 相手の手札と山札の中身を入れ替える（見えない情報だけ）
        const swapped = [...b.deck.slice(0, HAND_SIZE)];
        b.deck.splice(0, HAND_SIZE, ...b.players[other].hand);
        b.players[other].hand = swapped;
        expect(chooseCpuCommand(a, a.current, PROFILES.strong)).toEqual(chooseCpuCommand(b, b.current, PROFILES.strong));
    });

    it('始めた探検には、続きの小さい数字を出す', () => {
        const game = new Game(players(true), { seed: 2 });
        setup(game, { hands: [[card('red', 6), card('red', 9), card('blue', 2), card('green', 3), card('white', 4), card('yellow', 5), card('yellow', 7), card('blue', 10)], []], expeditions: [{ red: [card('red', 4), card('red', 5)] }, {}] });
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual({ type: 'play', card: card('red', 6), to: 'expedition' });
    });

    it('相手の探検に役立つカードは、なるべく捨てない', () => {
        const game = new Game(players(true), { seed: 2 });
        // 出せるものがなく、捨てるしかない場面
        const hand = [card('blue', 9), card('green', 2)];
        setup(game, { hands: [hand, []], expeditions: [{ blue: [card('blue', 10)], green: [card('green', 4)] }, { blue: [card('blue', 3)] }] });
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual({ type: 'play', card: card('green', 2), to: 'discard' });
    });

    it('でたらめに打つ CPU には大きく勝ち越し、揺れのない CPU には負け越す（強すぎない）', () => {
        const easy = runMatches({ games: 100, profiles: ['normal', 'random'] });
        expect(easy.wins[0] / easy.finished).toBeGreaterThan(0.9);
        const hard = runMatches({ games: 200, profiles: ['normal', 'strong'] });
        expect(hard.wins[0] / hard.finished).toBeLessThan(0.48);
    });
});

describe('ファズ（ランダムな操作）', () => {
    it('ランダムな操作でも、カード60枚・手札8枚・探検の並びが保たれ、断った操作で状態が変わらない', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game(players(), { seed, rounds: 1 + (seed % 2) * 2 });
            let x = seed * 7919;
            const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
            const pick = (list) => list[Math.floor(rand() * list.length)];
            for (let step = 0; step < 1500 && !game.isOver(); step++) {
                const seat = rand() < 0.9 ? game.current : 1 - game.current;
                const command = rand() < 0.5
                    ? { type: 'play', card: rand() < 0.9 ? pick(game.players[seat].hand) : Math.floor(rand() * 70), to: pick(['expedition', 'discard', 'x']) }
                    : { type: 'draw', from: pick(['deck', ...COLORS, 'purple']) };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) {
                    expect(snapshot(game)).toBe(before);
                    if (rand() < 0.3) runCpuStep(game);
                }
                const cards = all(game);
                expect(cards).toHaveLength(60);
                expect(new Set(cards).size).toBe(60);
                game.players.forEach(p => {
                    expect(p.hand.length).toBeLessThanOrEqual(HAND_SIZE);
                    COLORS.forEach(c => {
                        const values = p.expeditions[c].map(id => CARDS[id].value);
                        values.forEach((v, i) => { if (i > 0) expect(v === 0 ? values[i - 1] === 0 : v > values[i - 1]).toBe(true); });
                    });
                });
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
