import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, evaluate } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, board, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

function playAll(n, seed, level) {
    const game = new Game(players(n, true), { seed, level });
    let steps = 0;
    while (!game.isOver() && steps++ < 2000) {
        if (!runCpuStep(game)) break;
    }
    return game;
}

describe('CPU 同士の対戦', () => {
    it('1〜6人・ふつうとやさしい・いくつかのシードで、必ず最後まで進み、記録から再現できる', () => {
        for (let n = 1; n <= 6; n++) {
            for (const level of ['normal', 'easy']) {
                for (let seed = 1; seed <= 3; seed++) {
                    const game = playAll(n, seed * 17 + n, level);
                    expect(game.isOver()).toBe(true);
                    expect(game.round).toBe(7);
                    game.players.forEach(p => expect(p.specialsUsed.length).toBeLessThanOrEqual(3));
                    const saved = game.persist();
                    expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
                }
            }
        }
    });

    it('同じシードなら同じ展開になる（CPU はゲームの乱数を使わない）', () => {
        expect(snapshot(playAll(3, 77, 'normal'))).toBe(snapshot(playAll(3, 77, 'normal')));
    });

    it('ふつうは、やさしいより得点が高く、多く勝つ', () => {
        const r = runMatches({ games: 30, count: 2, level: 'mixed' });
        expect(r.stuck).toBe(0);
        const n = r.byLevel.normal;
        const e = r.byLevel.easy;
        expect(n.total / n.n).toBeGreaterThan(e.total / e.n);
        expect(n.wins).toBeGreaterThan(e.wins);
    });
});

describe('CPU の判断', () => {
    it('出口と出口をつなぐ描き方を高く見る', () => {
        const half = board(Array.from({ length: 6 }, (_, y) => [1, y, 'road-straight', 0]));
        const done = board(Array.from({ length: 7 }, (_, y) => [1, y, 'road-straight', 0]));
        expect(evaluate(done, 3)).toBeGreaterThan(evaluate(half, 3));
    });

    it('描ける目があれば描き、なければラウンドを終える', () => {
        const game = new Game(players(1, true), { seed: 3 });
        const view = createGameView(game, 0);
        expect(chooseCommand(view, 'normal', () => 0.5).type).toBe('place');
        game.players[0].cells = game.players[0].cells.map(() => ({ kind: 's3', o: 0, round: 0 }));
        expect(chooseCommand(createGameView(game, 0), 'normal', () => 0.5).type).toBe('end');
    });
});
