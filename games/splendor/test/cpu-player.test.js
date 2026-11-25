import { describe, it, expect } from 'vitest';
import Game, { COLORS, GOLD, countTokens } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES } from '../public/js/cpu-player.js';
import { players, tokens, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const playOut = (game, limit = 3000) => {
    let steps = 0;
    while (!game.isOver() && steps < limit) {
        expect(runCpuStep(game)).toBe(true);
        steps++;
    }
    return game;
};

describe('CPU', () => {
    it.each([2, 3, 4])('全員 CPU の%i人戦が、20シードとも最後まで進む', (n) => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = playOut(new Game(players(n, true), { seed }));
            expect(game.isOver()).toBe(true);
            expect(game.winners.length).toBeGreaterThan(0);
            expect(game.endReason).toBe('points');
            // 記録から同じ結果を再現できる（CPU の判断がゲームの乱数を使っていない）
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('同じ場面では同じ手を選ぶ', () => {
        const a = new Game(players(3, true), { seed: 7 });
        const b = new Game(players(3, true), { seed: 7 });
        expect(chooseCpuCommand(a)).toEqual(chooseCpuCommand(b));
    });

    it('山札の並びや、ほかの人が伏せて予約したカードをのぞかない', () => {
        const base = new Game(players(2, true), { seed: 11 });
        base.applyCommand(base.current, { type: 'reserve', level: 3 });
        const other = new Game(players(2, true), { seed: 11 });
        other.applyCommand(other.current, { type: 'reserve', level: 3 });
        // 隠れた情報だけを入れ替える：山札の並びと、伏せたカードの中身
        [1, 2, 3].forEach(level => other.decks[level].reverse());
        const hidden = other.players[other.startPlayer].reserved[0];
        hidden.id = other.decks[3].pop();
        expect(chooseCpuCommand(other)).toEqual(chooseCpuCommand(base));
    });

    it('10個を超えたら宝石を返し、貴族が複数なら選ぶ', () => {
        const game = new Game(players(2, true), { seed: 3, startPlayer: 0 });
        game.players[0].tokens = tokens({ white: 3, blue: 3, green: 3 });
        game.applyCommand(0, { type: 'take', tokens: { red: 1, black: 1, white: 1 } });
        expect(game.phase).toBe('discard');
        expect(runCpuStep(game)).toBe(true);
        expect(countTokens(game.players[0].tokens)).toBe(10);
    });

    it('取れる宝石がなく、何も買えず、予約も一杯ならパスする', () => {
        const game = new Game(players(2, true), { seed: 3, startPlayer: 0 });
        game.bank = tokens({ gold: 5 });
        game.players[0].reserved = [0, 1, 2].map(() => ({ id: game.decks[1].pop(), hidden: false }));
        expect(chooseCpuCommand(game)).toEqual({ type: 'pass' });
    });

    it('人間らしい見落としのある CPU は、見落としのない CPU に負け越す（強すぎない）', () => {
        const r = runMatches({ games: 200, count: 2, profiles: ['normal', 'strong'] });
        expect(r.finished).toBe(200);
        expect(r.wins[0] / r.finished).toBeLessThan(0.45);
        expect(r.wins[0] / r.finished).toBeGreaterThan(0.15);
    });

    it('CPU 同士の試合は、人間どうしと同じくらいの巡の数で終わる', () => {
        const r = runMatches({ games: 100, count: 2, profiles: ['normal', 'normal'] });
        const avg = r.rounds.reduce((s, v) => s + v, 0) / r.rounds.length;
        expect(avg).toBeGreaterThan(20);
        expect(avg).toBeLessThan(36);
        expect(Math.max(...r.rounds)).toBeLessThan(60);
    });

    it('どの強さの設定でも、通る手を選ぶ', () => {
        Object.values(PROFILES).forEach(profile => {
            const game = new Game(players(4, true), { seed: 21 });
            for (let i = 0; i < 200 && !game.isOver(); i++) {
                const command = chooseCpuCommand(game, game.current, profile);
                expect(game.applyCommand(game.current, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
            }
        });
    });
});

describe('ファズ（ランダムな操作）', () => {
    // 全部の宝石とカードの数は、どこにあっても変わらない
    const checkInvariants = (game, n) => {
        const gems = { 2: 4, 3: 5, 4: 7 }[n];
        COLORS.forEach(c => {
            const total = game.bank[c] + game.players.reduce((s, p) => s + p.tokens[c], 0);
            expect(total).toBe(gems);
            expect(game.bank[c]).toBeGreaterThanOrEqual(0);
        });
        expect(game.bank[GOLD] + game.players.reduce((s, p) => s + p.tokens[GOLD], 0)).toBe(5);
        const cards = [1, 2, 3].flatMap(l => [...game.decks[l], ...game.board[l].filter(id => id !== null)]);
        game.players.forEach(p => cards.push(...p.cards, ...p.reserved.map(r => r.id)));
        expect(cards.length).toBe(90);
        expect(new Set(cards).size).toBe(90);
        game.players.forEach(p => {
            expect(p.reserved.length).toBeLessThanOrEqual(3);
            if (game.phase !== 'discard' || p.id !== game.current) expect(countTokens(p.tokens)).toBeLessThanOrEqual(10);
        });
    };

    it.each([2, 3, 4])('%i人：ランダムな操作でも、宝石とカードの数が保たれ、断った操作で状態が変わらない', (n) => {
        for (let seed = 1; seed <= 15; seed++) {
            const game = new Game(players(n), { seed });
            let x = seed * 7919;
            const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
            for (let step = 0; step < 400 && !game.isOver(); step++) {
                const seat = game.current;
                const pick = (list) => list[Math.floor(rand() * list.length)];
                const color = () => pick(COLORS);
                const candidates = [
                    { type: 'take', tokens: { [color()]: 1, [color()]: 1, [color()]: 1 } },
                    { type: 'take', tokens: { [color()]: 2 } },
                    { type: 'reserve', level: pick([1, 2, 3]) },
                    { type: 'reserve', card: pick(game.board[pick([1, 2, 3])]) },
                    { type: 'buy', card: pick([...game.boardCards(), ...game.players[seat].reserved.map(r => r.id)]) },
                    { type: 'discard', tokens: { [pick([...COLORS, GOLD])]: 1 } },
                    { type: 'noble', noble: pick(game.nobleChoices.length ? game.nobleChoices : [0]) },
                    { type: 'pass' }
                ];
                const command = pick(candidates);
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) {
                    expect(snapshot(game)).toBe(before);
                    // 進まないときは CPU に任せる
                    if (rand() < 0.5) runCpuStep(game, seat);
                }
                checkInvariants(game, n);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
