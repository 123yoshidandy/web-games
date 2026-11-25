import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

// CPU だけで最後まで進めたゲーム
function playOut(seed, levels = ['normal', 'easy']) {
    const game = new Game(players(true).map((p, i) => ({ ...p, isCPU: true, cpuLevel: levels[i] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 1000) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const seed of [1, 7, 99, 1234]) {
            const game = playOut(seed);
            expect(game.isOver()).toBe(true);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            const copy = Game.replay(saved.players, saved.options, saved.commands);
            expect(snapshot(copy)).toBe(snapshot(game));
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('同じシードなら、同じ並び・同じ七不思議・同じ進歩トークン', () => {
        const a = new Game(players(), { seed: 42 });
        const b = new Game(players(), { seed: 42 });
        expect(snapshot(a)).toBe(snapshot(b));
        const c = new Game(players(), { seed: 43 });
        expect(JSON.stringify(c.decks)).not.toBe(JSON.stringify(a.decks));
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(3);
        const saved = game.persist();
        saved.commands[0] = { playerId: 1 - saved.commands[0].playerId, command: saved.commands[0].command };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const make = () => new Game(players(true).map(p => ({ ...p, isCPU: true, cpuLevel: 'easy' })), { seed: 11 });
        const a = make();
        const b = make();
        for (let i = 0; i < 400 && !a.isOver(); i++) {
            const seat = a.actors()[0];
            for (let k = 0; k < 3; k++) chooseCommand(a, seat); // 何度考えても
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、記録から再現できる', () => {
        const kinds = ['pickWonder', 'build', 'discard', 'wonder', 'progress', 'destroy', 'revive', 'starter', 'bogus'];
        const words = ['pyramids', 'sphinx', 'law', 'urbanism', 'tavern', 'press', 'quarry', 'x', null];
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const seed of [2, 3, 4]) {
            const game = new Game(players(true).map(p => ({ ...p, isCPU: true, cpuLevel: 'easy' })), { seed });
            for (let i = 0; i < 4000 && !game.isOver(); i++) {
                const word = words[rand(words.length)];
                const command = { type: kinds[rand(kinds.length)], slot: rand(22) - 1, wonder: word, token: word, card: word, seat: rand(3) };
                const seat = rand(2);
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                // ときどき CPU に進めさせ、いろいろな場面を作る
                if (rand(3) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
