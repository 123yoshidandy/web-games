import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { players, snapshot, totalCards } from './helpers.js';

function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 2000) {
        runCpuStep(game);
        expect(totalCards(game)).toBe(108);
    }
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 4, 5]) {
            for (const seed of [1, 7, 99]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
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

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(players(4, true), { seed: 11 });
        const b = new Game(players(4, true), { seed: 11 });
        while (!a.isOver()) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 3; k++) chooseCommand(a, seat);
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、札が108枚のままで再現できる', () => {
        const cards = ['tempura', 'sashimi', 'dumpling', 'maki1', 'maki2', 'maki3', 'egg', 'salmon', 'squid', 'wasabi', 'pudding', 'chopsticks', 'x'];
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const n of [2, 3, 5]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            for (let i = 0; i < 5000 && !game.isOver(); i++) {
                const command = { type: rand(5) ? 'pick' : 'bogus', card: cards[rand(cards.length)] };
                if (rand(3) === 0) command.second = cards[rand(cards.length)];
                const before = snapshot(game);
                if (!game.applyCommand(rand(n), command)) expect(snapshot(game)).toBe(before);
                expect(totalCards(game)).toBe(108);
                if (rand(4) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
