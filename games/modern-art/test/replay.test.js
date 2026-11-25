import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CARDS } from '../public/js/cards.js';
import { runCpuStep, nextCpuSeat } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

// カードは山・手札・買った絵・競り中・使い終わり（過去の回に出た分）のどこかに1枚ずつ
function checkInvariants(game) {
    const where = [...game.deck, ...game.players.flatMap(p => [...p.hand, ...p.won]), ...(game.lot?.cards ?? [])];
    expect(new Set(where).size).toBe(where.length);
    const used = game.history.reduce((s, h) => s + h.counts.reduce((a, b) => a + b, 0), 0);
    expect(where.length + used).toBe(CARDS.length);
    game.players.forEach(p => expect(p.money).toBeGreaterThanOrEqual(0));
}

export function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 6000) {
        expect(runCpuStep(game)).toBe(true);
        checkInvariants(game);
    }
    return game;
}

describe('CPU どうしの試合と記録からの再現', () => {
    it('3〜5人・いろいろなシードで、CPU どうしの試合が4回まで進み、記録から同じ状態を作り直せる（JSON を通しても）', () => {
        for (const n of [3, 4, 5]) {
            for (const seed of [1, 2, 3, 7, 11, 19]) {
                const game = playOut(n, seed, seed % 2 ? ['normal', 'easy'] : ['easy', 'normal']);
                expect(game.isOver()).toBe(true);
                expect(game.history).toHaveLength(4);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(4, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('競りの5種類とダブルの足し方が、実際に使われる', () => {
        const kinds = new Set();
        for (let seed = 1; seed <= 10; seed++) {
            const game = playOut(4, seed);
            game.commands.forEach(({ command }) => kinds.add(command.type === 'play' ? CARDS[command.card].type : command.type));
        }
        ['open', 'once', 'sealed', 'fixed', 'double', 'second', 'bid', 'pass', 'price', 'buy'].forEach(k => expect(kinds.has(k), k).toBe(true));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、カードの数を保って再現できる', () => {
        let r = 4242;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % k; };
        const randomCommand = (game, seat) => {
            const hand = game.players[seat]?.hand ?? [];
            switch (rand(8)) {
                case 0: return { type: 'play', card: hand.length && rand(3) ? hand[rand(hand.length)] : rand(72) - 1 };
                case 1: return { type: 'second', card: hand.length && rand(2) ? hand[rand(hand.length)] : null };
                case 2: return { type: 'bid', amount: rand(4) ? (game.auction?.high ?? 0) + rand(12) : rand(300) - 10 };
                case 3: return { type: 'price', amount: rand(120) - 5 };
                case 4: return { type: 'buy' };
                case 5: return { type: 'pass' };
                case 6: return { type: 'bid', amount: '5' };
                default: return null;
            }
        };
        for (const n of [3, 4, 5]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            let accepted = 0;
            for (let i = 0; i < 8000 && !game.isOver(); i++) {
                const seat = rand(2) ? (game.actors()[0] ?? 0) : rand(n + 1);
                const before = snapshot(game);
                if (game.applyCommand(seat, randomCommand(game, seat))) accepted++;
                else expect(snapshot(game)).toBe(before);
                checkInvariants(game);
                if (rand(5) === 0 && nextCpuSeat(game) !== null) runCpuStep(game);
            }
            expect(accepted).toBeGreaterThan(30);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
