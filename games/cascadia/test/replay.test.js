import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat, cpuRandom } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, snapshot, totalTokens } from './helpers.js';

// CPU だけで最後まで進めたゲーム（やさしいと、ふつうを交互の席に）
function playOut(n, seed, cards, levels = ['easy', 'normal']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed, cards });
    let steps = 0;
    while (!game.isOver() && steps++ < 300) {
        // ときどき流し直しも混ぜる（記録に残る操作の種類を増やす）
        if (game.canReplace3() && steps % 2) game.applyCommand(game.current, { type: 'replace3' });
        if (game.players[game.current].nature > 0 && steps % 5 === 0) game.applyCommand(game.current, { type: 'wipe', slots: [steps % 4] });
        runCpuStep(game);
    }
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [1, 2, 3, 4]) {
            for (const seed of [1, 7]) {
                const game = playOut(n, seed, seed === 7 ? { bear: 'B', elk: 'D', salmon: 'C', hawk: 'D', fox: 'D' } : undefined, ['easy']);
                expect(game.isOver(), `${n}人 seed ${seed}`).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                const copy = Game.replay(saved.players, saved.options, saved.commands);
                expect(snapshot(copy)).toBe(snapshot(game));
                expect(copy.result).toEqual(game.result);
            }
        }
    });

    it('流し直しを含む記録も再現でき、途中から同じ手で同じ結果になる', () => {
        const game = playOut(3, 5);
        expect(game.commands.some(c => c.command.type !== 'place')).toBe(true);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(2, 3, undefined, ['easy']);
        const saved = game.persist();
        saved.commands[0] = { ...saved.commands[0], playerId: (saved.commands[0].playerId + 1) % 2 };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(players(3, true), { seed: 11 });
        const b = new Game(players(3, true), { seed: 11 });
        for (let i = 0; i < 12 && !a.isOver(); i++) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 2; k++) chooseCommand(createGameView(a, seat), 'normal', cpuRandom(a, seat)); // 何度考えても
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、トークンの数が保たれ、記録から再現できる', () => {
        const types = ['place', 'replace3', 'wipe', 'bogus'];
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const n of [2, 3, 4]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            for (let i = 0; i < 1500 && !game.isOver(); i++) {
                const command = {
                    type: types[rand(types.length)], tile: rand(6) - 1, token: rand(6) - 1, q: rand(7) - 3, r: rand(7) - 3, rot: rand(8) - 1,
                    at: rand(3) ? [rand(7) - 3, rand(7) - 3] : null, slots: rand(2) ? [rand(5)] : [rand(4), rand(4)]
                };
                const seat = rand(n);
                if (rand(5) === 0) game.players[seat].nature += 0; // 状態は外から変えない
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                expect(totalTokens(game)).toBe(100);
                if (rand(4) === 0) runCpuStep(game, game.current, 'easy');
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
