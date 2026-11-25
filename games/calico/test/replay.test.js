import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat, cpuRandom } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { TILES } from '../public/js/data.js';
import { players, snapshot, totalTiles } from './helpers.js';

// CPU だけで最後まで進めたゲーム
function playOut(n, seed, setup = 'standard', levels = ['easy', 'normal']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed, setup });
    let steps = 0;
    while (!game.isOver() && steps++ < 300) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [1, 2, 3, 4]) {
            for (const [seed, setup] of [[1, 'standard'], [7, 'beginner']]) {
                const game = playOut(n, seed, setup, ['easy']);
                expect(game.isOver(), `${n}人 seed ${seed}`).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                const copy = Game.replay(saved.players, saved.options, saved.commands);
                expect(snapshot(copy)).toBe(snapshot(game));
                expect(copy.result).toEqual(game.result);
            }
        }
    });

    it('途中までの記録から再現し、続きの手で同じ結果になる', () => {
        const game = playOut(3, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(2, 3, 'beginner', ['easy']);
        const saved = game.persist();
        saved.commands[0] = { ...saved.commands[0], playerId: (saved.commands[0].playerId + 1) % 2 };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('同じシードなら同じ袋・盤・猫・目標になり、シードが違えば変わる', () => {
        const a = new Game(players(3), { seed: 9 });
        const b = new Game(players(3), { seed: 9 });
        const c = new Game(players(3), { seed: 10 });
        expect(snapshot(a)).toBe(snapshot(b));
        expect(JSON.stringify(c.bag)).not.toBe(JSON.stringify(a.bag));
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(players(3, true), { seed: 11 });
        const b = new Game(players(3, true), { seed: 11 });
        for (let i = 0; i < 16 && !a.isOver(); i++) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 2; k++) chooseCommand(createGameView(a, seat), 'normal', cpuRandom(a, seat)); // 何度考えても
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、パッチの数が保たれ、記録から再現できる', () => {
        const types = ['goals', 'place', 'take', 'bogus'];
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        const pickOf = () => [rand(5) - 1, rand(5) - 1, rand(5) - 1];
        const junk = () => [undefined, null, '1', 1.5, -1, 99, [0]][rand(7)];
        for (const n of [1, 2, 3, 4]) {
            const game = new Game(players(n, true), { seed: n * 31, setup: n % 2 ? 'standard' : 'beginner' });
            for (let i = 0; i < 2500 && !game.isOver(); i++) {
                const command = rand(6) === 0 ? junk() : {
                    type: types[rand(types.length)],
                    pick: rand(4) ? pickOf() : junk(),
                    hand: rand(5) ? rand(4) - 1 : junk(),
                    cell: rand(5) ? rand(52) - 1 : junk(),
                    market: rand(5) ? rand(5) - 1 : junk()
                };
                const seat = rand(n + 1); // ときどき、いない席から送る
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                expect(totalTiles(game)).toBe(game.tileCount);
                if (rand(3) === 0) runCpuStep(game, game.actors()[0] ?? null, 'easy');
            }
            expect(game.isOver(), `${n}人`).toBe(true);
            // 記録には決まった項目だけが残る
            game.commands.forEach(({ command }) => {
                const keys = Object.keys(command).sort();
                expect(['hand,cell,type', 'pick,type', 'market,type'].map(k => k.split(',').sort().join(','))).toContain(keys.join(','));
            });
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
