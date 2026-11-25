import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { players, snapshot, totalDice } from './helpers.js';

function playOut(n, seed, levels = ['normal', 'easy'], options = {}) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed, ...options });
    let steps = 0;
    let dice = totalDice(game);
    while (!game.isOver() && steps++ < 5000) {
        runCpuStep(game);
        // ダイスは増えない
        expect(totalDice(game)).toBeLessThanOrEqual(dice);
        dice = totalDice(game);
    }
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても。設定ごと）', () => {
        for (const n of [2, 3, 6]) {
            for (const options of [{}, { reroll: false }, { lossOne: true }]) {
                const game = playOut(n, n * 13, ['normal', 'easy'], options);
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

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、再現できる', () => {
        let r = 777;
        // 線形合同法の下位ビットは周期が短いので、上位ビットを使う
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 16) % k; };
        const values = [0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 21, -1, null, 'x', 2.5];
        for (const n of [2, 4, 6]) {
            const game = new Game(players(n, true), { seed: n * 7 });
            for (let i = 0; i < 6000 && !game.isOver(); i++) {
                const command = { type: ['bid', 'bid', 'bid', 'challenge', 'next', 'x'][rand(6)], qty: values[rand(values.length)], face: values[rand(values.length)] };
                if (rand(3) === 0) command.reveal = [rand(6), rand(6)].slice(0, 1 + rand(2));
                const before = snapshot(game);
                if (!game.applyCommand(rand(n), command)) expect(snapshot(game)).toBe(before);
                if (rand(3) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
