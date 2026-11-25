import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, evaluate, LEVELS } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { writeHouse } from '../public/js/sheet.js';
import { players, sheetOf, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

function playAll(n, seed, level) {
    const game = new Game(players(n, true), { seed, level });
    let steps = 0;
    while (!game.isOver() && steps++ < 5000) {
        if (!runCpuStep(game)) break;
    }
    return game;
}

describe('CPU 同士の対戦', () => {
    it('1〜6人・ふつうとやさしい・いくつかのシードで、必ず最後まで進み、記録から再現できる', () => {
        for (let n = 1; n <= 6; n++) {
            for (const level of ['normal', 'easy']) {
                for (let seed = 1; seed <= 2; seed++) {
                    const game = playAll(n, seed * 31 + n, level);
                    expect(game.isOver()).toBe(true);
                    expect(game.results.length).toBe(n);
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
        const r = runMatches({ games: 20, count: 2, level: 'mixed' });
        expect(r.stuck).toBe(0);
        const n = r.byLevel.normal;
        const e = r.byLevel.easy;
        expect(n.total / n.n).toBeGreaterThan(e.total / e.n);
        expect(n.wins).toBeGreaterThan(e.wins);
    });
});

describe('CPU の判断', () => {
    const ctx = { conf: LEVELS.normal, plans: [], solo: false, progress: 0.3 };

    it('埋まらなくなる空き家を作る書き方を低く見る', () => {
        const good = sheetOf([[1, null, null, null, 9]]);
        const bad = sheetOf([[1, 2, null, null, 3]]);
        expect(evaluate(good, ctx)).toBeGreaterThan(evaluate(bad, ctx));
    });

    it('完成した家並みと、そろった都市計画を高く見る', () => {
        const open = sheetOf([[1, 2, 3, null]]);
        const done = sheetOf([[1, 2, 3, null]], [[0, 2]]);
        expect(evaluate(done, ctx)).toBeGreaterThan(evaluate(open, ctx));
        const plan = { sizes: [3], points: [8, 4], claimed: false };
        expect(evaluate(done, { ...ctx, plans: [plan] })).toBeGreaterThan(evaluate(done, ctx) + 7);
    });

    it('建てられなければ断り、建てたら手を終える。そろった都市計画は達成する', () => {
        const game = new Game(players(2, true), { seed: 3 });
        const p = game.players[0];
        [0, 1, 2].forEach(s => writeHouse(p.sheet, s, p.sheet.houses[s].length - 1, 0));
        expect(chooseCommand(createGameView(game, 0), 'normal', () => 0.5).type).toBe('refuse');
        const view = createGameView(game, 1);
        expect(chooseCommand(view, 'normal', () => 0.5).type).toBe('build');
        game.plans = [0, 6, 12];
        const q = game.players[1];
        for (let h = 0; h < 6; h++) {
            writeHouse(q.sheet, 0, h, h + 1);
            q.sheet.fences[0][h] = true;
        }
        q.start = structuredClone(q.sheet);
        expect(runCpuStep(game, 'normal', 1)).toBe(true);
        let guard = 0;
        while (!game.players[1].done && guard++ < 5) runCpuStep(game, 'normal', 1);
        expect(game.players[1].turn.plans).toContain(0);
    });
});
