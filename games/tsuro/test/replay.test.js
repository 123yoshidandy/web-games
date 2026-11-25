import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { players, snapshot, tileTotal } from './helpers.js';
import { TILE_COUNT } from '../public/js/tiles.js';
import { createRandom } from '../public/js/random.js';

// CPU だけで最後まで打ち、途中で何度も記録から再現して同じ状態になるかを見る
function playOut(n, seed, level) {
    const game = new Game(players(n, true).map(p => ({ ...p, cpuLevel: level })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 200) {
        expect(runCpuStep(game)).toBe(true);
        expect(tileTotal(game)).toBe(TILE_COUNT);
        if (steps % 7 === 0) {
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    }
    return game;
}

describe('記録からの再現', () => {
    it('人数・シード・強さを変えても、記録から同じ状態を作り直せる', () => {
        for (let n = 2; n <= 8; n++) {
            [1, 2].forEach(seed => {
                const game = playOut(n, seed * 31 + n, seed === 1 ? 'normal' : 'easy');
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                const again = Game.replay(saved.players, saved.options, saved.commands);
                expect(snapshot(again)).toBe(snapshot(game));
                expect(again.winners).toEqual(game.winners);
            });
        }
    });

    it('でたらめな操作を浴びせても、断った操作で状態が変わらず、受け付けた操作だけで再現できる', () => {
        const random = createRandom(123);
        const pick = (n) => Math.floor(random() * n);
        for (let round = 0; round < 6; round++) {
            const n = 2 + pick(7);
            const game = new Game(players(n), { seed: round + 1 });
            for (let i = 0; i < 3000 && !game.isOver(); i++) {
                const seat = random() < 0.8 ? game.current : pick(n);
                const command = random() < 0.5
                    ? { type: 'place', mark: pick(50) - 1 }
                    : { type: 'play', tile: random() < 0.7 ? (game.players[seat].hand[pick(3)] ?? 0) : pick(36), rotation: pick(5) };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
            }
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            expect(tileTotal(game)).toBe(TILE_COUNT);
        }
    });

    it('再現できない記録は、例外で知らせる', () => {
        const game = new Game(players(3), { seed: 4 });
        const saved = game.persist();
        expect(() => Game.replay(saved.players, saved.options, [{ playerId: (game.first + 1) % 3, command: { type: 'place', mark: 0 } }])).toThrow();
    });
});
