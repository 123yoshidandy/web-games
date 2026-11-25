import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

function playOut(game, limit = 3000) {
    let steps = 0;
    while (!game.isOver() && steps++ < limit) {
        const before = game.commands.length;
        runCpuStep(game);
        if (game.commands.length === before) break;
    }
    return game;
}

describe('CPU', () => {
    it('CPU だけの試合が、2〜5人・いろいろなシードで最後まで進む', () => {
        [2, 3, 4, 5].forEach(n => {
            [1, 2, 3].forEach(seed => {
                const game = playOut(new Game(players(n, true), { seed: seed * 31 + n }));
                expect(game.isOver(), `${n}人 シード${seed}`).toBe(true);
                expect(game.results).toHaveLength(n);
            });
        });
    });

    it('やさしい CPU どうしでも最後まで進む', () => {
        [2, 4].forEach(n => {
            const game = playOut(new Game(players(n, true).map(p => ({ ...p, cpuLevel: 'easy' })), { seed: 77 + n }));
            expect(game.isOver()).toBe(true);
        });
    });

    it('CPU の試合は、記録から同じ結果を再現できる', () => {
        const game = playOut(new Game(players(3, true), { seed: 12 }));
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const copy = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(copy)).toBe(snapshot(game));
    });

    it('同じ局面なら同じ手を選ぶ（ゲームの乱数を使わない）', () => {
        const a = new Game(players(3, true), { seed: 5 });
        const b = new Game(players(3, true), { seed: 5 });
        for (let i = 0; i < 30; i++) {
            runCpuStep(a);
            runCpuStep(b);
        }
        expect(JSON.stringify(a.commands)).toBe(JSON.stringify(b.commands));
    });

    it('強さの設定は やさしい・ふつう の2つ', () => {
        expect(Object.keys(PROFILES).sort()).toEqual(['easy', 'normal']);
    });
});
