import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { players, snapshot, totalCards, TOTAL_CARDS } from './helpers.js';

function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 3000) {
        runCpuStep(game);
        expect(totalCards(game)).toBe(TOTAL_CARDS);
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
        const a = new Game(players(3, true), { seed: 11 });
        const b = new Game(players(3, true), { seed: 11 });
        while (!a.isOver()) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 3; k++) chooseCommand(a, seat);
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、札の数が変わらず、再現できる', () => {
        const values = [0, 1, 2, 3, 5, 14, 27, 54, -1, null, 'x', 'koma', 'dango:1', 'kuge:1', 'sea', 'paddy', 'kinko', 'hiroshige'];
        const types = ['choose', 'move', 'buy', 'donate', 'encounter', 'panorama', 'meal', 'bogus'];
        let r = 12345;
        // 線形合同法の下位ビットは周期が短いので、上位ビットを使う
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 16) % k; };
        for (const n of [2, 3, 5]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            for (let i = 0; i < 6000 && !game.isOver(); i++) {
                const v = values[rand(values.length)];
                const command = { type: types[rand(types.length)], traveler: v, to: v, cards: rand(2) ? [v] : [], amount: v, card: v, kind: v };
                const before = snapshot(game);
                if (!game.applyCommand(rand(n), command)) expect(snapshot(game)).toBe(before);
                expect(totalCards(game)).toBe(TOTAL_CARDS);
                if (rand(3) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
