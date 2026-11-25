import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES, evaluate, candidateActions } from '../public/js/cpu-player.js';
import { createState, cellOf, legalActions, actionKey, SLOTS } from '../public/js/rules.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const cpuGame = (n, seed) => new Game(Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true })), { seed });

describe('CPU', () => {
    it('2人でも4人でも、どの強さでも最後まで進む', () => {
        for (const profiles of [['normal', 'easy'], ['easy', 'easy'], ['normal', 'easy', 'easy', 'normal']]) {
            const r = runMatches({ games: profiles.length === 2 ? 6 : 4, profiles });
            expect(r.long + r.stuck).toBe(0);
        }
    });

    it('選ぶ手は必ず通る手', () => {
        const game = cpuGame(4, 11);
        for (let i = 0; i < 40 && !game.isOver(); i++) {
            const command = chooseCpuCommand(game, game.current, PROFILES[i % 2 ? 'easy' : 'normal']);
            const keys = game.legalActions().map(actionKey);
            expect(keys).toContain(actionKey(command));
            expect(game.applyCommand(game.current, command)).toBe(true);
        }
    });

    it('すぐ勝てる手は見逃さない（やさしいでも）', () => {
        for (const level of ['easy', 'normal']) {
            for (let seed = 1; seed <= 5; seed++) {
                const game = cpuGame(2, seed);
                game.state = createState({ players: 2, first: 0 });
                game.state.pawns = [cellOf(2, 1), cellOf(6, 6)];
                game.cachedActions = null;
                expect(chooseCpuCommand(game, 0, PROFILES[level])).toEqual({ type: 'move', x: 2, y: 0 });
            }
        }
    });

    it('相手がすぐ勝つなら、ふつうは壁でふさぐ', () => {
        const game = cpuGame(2, 4);
        game.state = createState({ players: 2, first: 0 });
        // 相手（席1）はあと1歩でゴール（下の辺）。自分はまだ遠い
        game.state.pawns = [cellOf(4, 8), cellOf(1, 7)];
        game.cachedActions = null;
        const command = chooseCpuCommand(game, 0, PROFILES.normal);
        expect(command.type).toBe('wall');
    });

    it('候補の壁は、相手の最短の道を切るものだけ', () => {
        const s = createState({ players: 2 });
        const walls = candidateActions(s).filter(a => a.type === 'wall');
        // 相手は (4,0) からまっすぐ下へ8歩。その道の8本の辺を切る横の壁
        expect(walls.length).toBeGreaterThan(0);
        expect(walls.every(w => w.o === 'h' && (w.x === 3 || w.x === 4))).toBe(true);
        expect(walls.length).toBeLessThan(legalActions(s).length);
    });

    it('値打ちは、相手の歩数 − 自分の歩数 ＋ 壁の差', () => {
        const s = createState({ players: 2 });
        expect(evaluate(s, 0)).toBe(0);
        s.walls = [10, 8];
        expect(evaluate(s, 0, 0.5)).toBeCloseTo(1);
        s.pawns[1] = cellOf(0, 0);
        s.h[7 * SLOTS + 4] = 1; // 自分の前だけをふさぐ
        expect(evaluate(s, 0, 0)).toBe(-1);
    });

    it('CPU の手はゲームの乱数を使わない（記録から同じに再現できる）', () => {
        const game = cpuGame(2, 21);
        for (let i = 0; i < 30 && !game.isOver(); i++) runCpuStep(game, game.current, PROFILES.easy);
        const again = Game.replay(game.persist().players, game.options, game.commands);
        expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
        // 同じ局面からは同じ手を選ぶ
        expect(chooseCpuCommand(game, game.current, PROFILES.easy)).toEqual(chooseCpuCommand(again, again.current, PROFILES.easy));
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 20, profiles: ['normal', 'easy'] });
        expect(r.wins[0]).toBeGreaterThan(r.wins[1]);
    });

    it('1手の考える時間は1秒より短い', () => {
        const r = runMatches({ games: 2, profiles: ['normal', 'normal', 'normal', 'normal'] });
        expect(r.slowest).toBeLessThan(1000);
    });
});
