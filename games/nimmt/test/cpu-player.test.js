import { describe, it, expect } from 'vitest';
import Game, { CARD_COUNT } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, cpuActors, chooseRow, PROFILES } from '../public/js/cpu-player.js';
import { players, setup, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const playOut = (game) => {
    let steps = 0;
    while (!game.isOver() && steps++ < 20000) expect(runCpuStep(game, cpuActors(game)[0])).toBe(true);
    return game;
};

describe('CPU', () => {
    it.each([2, 3, 6, 10])('全員 CPU の%i人戦が、10シードとも最後まで進み、記録から再現できる', (n) => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = playOut(new Game(players(n, true), { seed }));
            expect(game.isOver()).toBe(true);
            expect(game.players.some(p => p.score >= 66)).toBe(true);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('ほかの人が先に選んだカードで、手を変えない（のぞかない）', () => {
        const a = new Game(players(3, true), { seed: 7 });
        const b = new Game(players(3, true), { seed: 7 });
        a.applyCommand(1, { type: 'play', card: a.players[1].hand[0] });
        b.applyCommand(1, { type: 'play', card: b.players[1].hand[9] });
        // 手数をそろえて、判断の乱数を同じにする
        expect(chooseCpuCommand(a, 0)).toEqual(chooseCpuCommand(b, 0));
        expect(chooseCpuCommand(a, 0, PROFILES.strong)).toEqual(chooseCpuCommand(b, 0, PROFILES.strong));
    });

    it('引き取る列は、牛のいちばん少ない列', () => {
        expect(chooseRow([[55], [10, 20], [1, 2, 3], [11]])).toBe(2);
    });

    it('引き取らずに置ける安全なカードがあれば、それを出す', () => {
        const game = new Game(players(2, true), { seed: 3 });
        setup(game, { hands: [[26, 3, 4, 5, 6, 7, 8, 9, 2, 1], [80, 81, 82, 83, 84, 85, 86, 87, 88, 89]], rows: [[10, 11, 15, 20, 25], [50], [60], [70]] });
        // 26 は6枚目（牛15頭）。1〜9 はどこにも置けないが、牛1頭の列を引き取るだけで済む
        const command = chooseCpuCommand(game, 0, PROFILES.strong);
        expect(command.card).not.toBe(26);
        setup(game, { hands: [[26, 51, 3, 4, 5, 6, 7, 8, 9, 2]] });
        expect(chooseCpuCommand(game, 0, PROFILES.strong).card).toBe(51);
    });

    it('人間らしい揺れのある CPU は、でたらめに出す CPU には大きく勝ち越す', () => {
        const r = runMatches({ games: 100, profiles: ['normal', 'random', 'random', 'random'] });
        expect(r.finished).toBe(100);
        expect(r.wins[0] / r.finished).toBeGreaterThan(0.7);
    });

    it('見えていないカードを数える CPU に、勝ち越さない（強すぎない）', () => {
        const r = runMatches({ games: 200, profiles: ['normal', 'normal', 'normal', 'strong'] });
        const normal = (r.wins[0] + r.wins[1] + r.wins[2]) / 3;
        expect(normal).toBeLessThanOrEqual(r.wins[3]);
    });
});

describe('ファズ（ランダムな操作）', () => {
    it.each([2, 4, 10])('%i人：ランダムな操作でも、カードは104枚のまま重ならず、断った操作で状態が変わらない', (n) => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = new Game(players(n), { seed });
            let x = seed * 7919;
            const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
            for (let step = 0; step < 600 && !game.isOver(); step++) {
                const seat = Math.floor(rand() * n);
                const command = rand() < 0.7
                    ? { type: 'play', card: rand() < 0.9 ? game.players[seat].hand[Math.floor(rand() * 10)] : Math.floor(rand() * 120) }
                    : { type: 'takeRow', row: Math.floor(rand() * 5) };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                // 1ラウンドの中では、手札・列・引き取ったカード・公開待ちのカードで全部
                const all = [...game.players.flatMap(p => [...p.hand, ...p.taken]), ...game.rows.flat(), ...game.pending.map(p => p.card)];
                expect(new Set(all).size).toBe(all.length);
                expect(all.length).toBe(n * 10 + 4);
                game.rows.forEach(row => {
                    expect(row.length).toBeLessThanOrEqual(5);
                    expect([...row].sort((a, b) => a - b)).toEqual(row);
                });
                all.forEach(c => expect(c >= 1 && c <= CARD_COUNT).toBe(true));
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
