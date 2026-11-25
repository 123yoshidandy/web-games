import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

// CPU だけで最後まで進めたゲーム
function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 5000) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 4]) {
            for (const seed of [1, 7, 99]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                const copy = Game.replay(saved.players, saved.options, saved.commands);
                expect(snapshot(copy)).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(3, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(2, 3);
        const saved = game.persist();
        saved.commands[0] = { playerId: (saved.commands[0].playerId + 1) % 2, command: { type: 'roll', dice: 1 } };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(players(3, true), { seed: 11 });
        const b = new Game(players(3, true), { seed: 11 });
        for (let i = 0; i < 300 && !a.isOver(); i++) {
            for (let k = 0; k < 3; k++) chooseCommand(a); // 何度考えても
            const command = runCpuStep(a);
            expect(b.applyCommand(b.current, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、記録から再現できる', () => {
        const kinds = ['roll', 'reroll', 'keep', 'tv', 'trade', 'skipTrade', 'build', 'pass', 'bogus'];
        const cards = ['wheat', 'cafe', 'stadium', 'tv', 'business', 'mine', 'station', 'mall', 'park', 'tower', 'x'];
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const n of [2, 3, 4]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            for (let i = 0; i < 3000 && !game.isOver(); i++) {
                const command = { type: kinds[rand(kinds.length)], dice: 1 + rand(3), target: rand(n + 1) - 1, card: cards[rand(cards.length)],
                    give: cards[rand(cards.length)], take: cards[rand(cards.length)] };
                const seat = rand(n);
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                // ときどき CPU に進めさせ、いろいろな場面を作る
                if (rand(4) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
