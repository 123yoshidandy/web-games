import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';
import { CARD_IDS, CELLS } from '../public/js/rules.js';
import { players, snapshot } from './helpers.js';

describe('記録からの再現', () => {
    it('CPU どうしの試合を、途中でも最後でも、記録から同じ状態に作り直せる', () => {
        [['easy', 'normal'], ['normal', 'easy'], ['easy', 'easy']].forEach(([a, b], k) => {
            for (let seed = 1; seed <= 6; seed++) {
                const game = new Game([{ name: 'A', isCPU: true, cpuLevel: a }, { name: 'B', isCPU: true, cpuLevel: b }], { seed: seed * 7 + k });
                let steps = 0;
                while (!game.isOver() && steps++ < 400) {
                    expect(runCpuStep(game)).toBe(true);
                    if (steps % 5 === 0) {
                        const saved = JSON.parse(JSON.stringify(game.persist()));
                        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
                    }
                }
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                const again = Game.replay(saved.players, saved.options, saved.commands);
                expect(snapshot(again)).toBe(snapshot(game));
                expect([again.winner, again.result]).toEqual([game.winner, game.result]);
            }
        });
    });

    it('でたらめな操作を浴びせても、断った操作で状態が変わらず、受け付けた操作だけで再現できる', () => {
        const random = createRandom(77);
        const pick = (n) => Math.floor(random() * n);
        for (let round = 0; round < 8; round++) {
            const game = new Game(players([false, false]), { seed: round + 1 });
            for (let i = 0; i < 4000 && !game.isOver(); i++) {
                const seat = random() < 0.85 ? game.current : 1 - game.current;
                const card = random() < 0.8 ? game.hands[seat][pick(2)] : CARD_IDS[pick(16)];
                const command = random() < 0.1 ? { type: 'pass', card } : { type: 'move', card, from: pick(CELLS + 1), to: pick(CELLS + 1) };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
            }
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('再現できない記録は、例外で知らせる', () => {
        const game = new Game(players(), { seed: 4 });
        const saved = game.persist();
        expect(() => Game.replay(saved.players, saved.options, [{ playerId: 1 - game.first, command: { type: 'pass', card: 'tiger' } }])).toThrow();
    });
});
