import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCpuTurn, runCpuStep, PROFILES, evaluate, enumerateTurns } from '../public/js/cpu-player.js';
import { cellOf, stepKey, GODS } from '../public/js/rules.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const C = (x, y) => cellOf(x, y);
const cpuGame = (n, seed, gods = null) => new Game(Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true })), { seed, gods });
// 置き終えた盤を作る
function placed(game, workers, heights = {}) {
    const s = game.state;
    s.phase = 'turn';
    s.current = 0;
    s.workers = workers.map(list => list.map(([x, y]) => C(x, y)));
    Object.entries(heights).forEach(([c, h]) => { s.height[Number(c)] = h; });
    game.cachedSteps = null;
    return game;
}

describe('CPU', () => {
    it('2人でも3人でも、神があってもなくても、最後まで進む', () => {
        for (const [profiles, gods, games] of [[['normal', 'easy'], null, 4], [['easy', 'easy'], 'all', 10], [['normal', 'easy', 'easy'], null, 3]]) {
            const r = runMatches({ games, profiles, gods });
            expect(r.long + r.stuck).toBe(0);
        }
    });

    it('神ごとに、CPU が力を使っても最後まで進む', () => {
        for (const god of GODS) {
            const r = runMatches({ games: 2, profiles: ['easy', 'easy'], gods: [god, 'random'], seedBase: 40 });
            expect(r.long + r.stuck).toBe(0);
        }
    });

    it('選ぶ操作の列は、すべて通る', () => {
        const game = cpuGame(2, 11, ['demeter', 'artemis']);
        for (let i = 0; i < 30 && !game.isOver(); i++) {
            const seat = game.current;
            const plan = chooseCpuTurn(game, seat, PROFILES[i % 2 ? 'easy' : 'normal']);
            expect(plan.length).toBeGreaterThan(0);
            for (const step of plan) {
                if (game.current !== seat) break;
                const keys = game.legalSteps().map(stepKey);
                expect(keys).toContain(stepKey(step));
                expect(game.applyCommand(seat, step)).toBe(true);
            }
        }
    });

    it('すぐ勝てる手は見逃さない（やさしいでも）', () => {
        for (const level of ['easy', 'normal']) {
            for (let seed = 1; seed <= 5; seed++) {
                const game = placed(cpuGame(2, seed), [[[0, 0], [4, 4]], [[2, 4], [4, 0]]], { [C(0, 0)]: 2, [C(1, 1)]: 3 });
                const plan = chooseCpuTurn(game, 0, PROFILES[level]);
                expect(plan[0]).toEqual({ type: 'move', from: C(0, 0), to: C(1, 1) });
            }
        }
    });

    it('相手が次に勝てるなら、ふつうはふさぐ', () => {
        for (let seed = 1; seed <= 5; seed++) {
            const game = placed(cpuGame(2, seed), [[[0, 4], [4, 4]], [[2, 2], [4, 0]]], { [C(2, 2)]: 2, [C(3, 2)]: 3 });
            game.applyCommand(0, chooseCpuTurn(game, 0, PROFILES.normal)[0]);
            const plan = chooseCpuTurn(game, 0, PROFILES.normal);
            plan.forEach(step => game.applyCommand(0, step));
            // (3,2) にドームを建てたか、職人で立ちふさいだ
            const s = game.state;
            expect(s.dome[C(3, 2)] || s.workers[0].includes(C(3, 2))).toBe(true);
        }
    });

    it('同じ結果になる操作の列は1つにまとめる', () => {
        const game = placed(cpuGame(2, 3), [[[0, 0], [4, 4]], [[2, 2], [4, 0]]]);
        const turns = enumerateTurns(game.state);
        const keys = new Set(turns.map(t => JSON.stringify([t.state.workers, t.state.height, t.state.dome])));
        expect(keys.size).toBe(turns.length);
    });

    it('値打ちは、次に動く人の脅し（2段にいて隣に3段）を大きく見る', () => {
        const game = placed(cpuGame(2, 3), [[[0, 0], [4, 4]], [[2, 2], [4, 0]]], { [C(2, 2)]: 2, [C(3, 2)]: 3 });
        const s = game.state;
        s.current = 1;
        expect(evaluate(s, 0)).toBeLessThan(-1000);
        s.current = 0;
        expect(evaluate(s, 0)).toBeGreaterThan(-1000);
        expect(evaluate(s, 0, true)).toBe(evaluate({ ...s, current: 1 }, 0, true));
    });

    it('CPU の手はゲームの乱数を使わない（記録から同じに再現できる）', () => {
        const game = cpuGame(2, 21, ['apollo', 'random']);
        for (let i = 0; i < 16 && !game.isOver(); i++) runCpuStep(game, game.current, PROFILES.easy);
        const again = Game.replay(game.persist().players, game.options, game.commands);
        expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
        if (!game.isOver()) {
            expect(chooseCpuTurn(game, game.current, PROFILES.easy)).toEqual(chooseCpuTurn(again, again.current, PROFILES.easy));
        }
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 30, profiles: ['normal', 'easy'] });
        expect(r.wins[0]).toBeGreaterThan(r.wins[1]);
    });

    it('1手番の考える時間は1秒より短い（ヘルメスでも）', () => {
        // ヘルメスの手番は打ち切りの近くまで考えるので、1局でも十分に長い手番が出る（2局だと CI の時間切れに近づく）
        const r = runMatches({ games: 1, profiles: ['normal', 'normal'], gods: ['hermes', 'demeter'] });
        expect(r.slowest).toBeLessThan(1000);
    });
});
