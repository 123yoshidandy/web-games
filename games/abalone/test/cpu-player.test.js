import { describe, it, expect, vi } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES, evaluate } from '../public/js/cpu-player.js';
import { createState, cellAt, moveKey, BLACK, WHITE, EMPTY } from '../public/js/rules.js';
import { runMatches, playMatch } from '../scripts/cpu-match.mjs';

const cpuGame = (seed, layout) => new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed, layout });
const EMPTY_ROWS = ['.....', '......', '.......', '........', '.........', '........', '.......', '......', '.....'];
function setBoard(game, rows, captured = {}) {
    const s = game.state;
    s.board = [];
    EMPTY_ROWS.map((e, i) => rows[i] ?? e).forEach(row => [...row].forEach(ch => s.board.push(ch === 'B' ? BLACK : ch === 'W' ? WHITE : EMPTY)));
    s.current = BLACK;
    Object.assign(s.captured, captured);
    game.cachedMoves = null;
    return game;
}

describe('CPU', () => {
    it('どの並べ方でも、どの強さでも手が通り、試合が進む', () => {
        for (const layout of ['standard', 'belgian', 'german']) {
            const r = runMatches({ games: 2, profiles: ['normal', 'easy'], layout });
            expect(r.stuck).toBe(0);
        }
    });

    it('やさしい同士・やさしいとでたらめは最後まで終わる', () => {
        const r = runMatches({ games: 6, profiles: ['easy', 'random'] });
        expect(r.long + r.stuck).toBe(0);
        expect(r.wins[0]).toBe(6);
    });

    it('選ぶ手は必ず通る手', () => {
        const game = cpuGame(11);
        for (let i = 0; i < 30 && !game.isOver(); i++) {
            const command = chooseCpuCommand(game, game.current, PROFILES[i % 2 ? 'easy' : 'normal']);
            expect(game.legalMoves().map(moveKey)).toContain(moveKey(command));
            expect(game.applyCommand(game.current, command)).toBe(true);
        }
    });

    it('すぐ勝てる手（6個目の押し出し）は見逃さない（やさしいでも）', () => {
        for (const level of ['easy', 'normal']) {
            for (let seed = 1; seed <= 4; seed++) {
                // 黒が5個押し出していて、右端の白を2対1で押し出せば勝ち
                const game = setBoard(cpuGame(seed), { 4: '......BBW', 8: 'B...W' }, { [BLACK]: 5 });
                const command = chooseCpuCommand(game, game.seatOf(BLACK), PROFILES[level]);
                expect(command).toEqual({ type: 'move', cells: [cellAt(4, 6), cellAt(4, 7)], dir: 0 });
            }
        }
    });

    it('値打ちは、押し出した数を重く見る', () => {
        const s = createState();
        expect(evaluate(s, BLACK)).toBe(0);
        s.captured[BLACK] = 1;
        expect(evaluate(s, BLACK)).toBeGreaterThan(100);
        expect(evaluate(s, WHITE)).toBeLessThan(-100);
    });

    it('CPU の手はゲームの乱数を使わない（記録から同じに再現できる）', () => {
        const game = cpuGame(21, 'belgian');
        for (let i = 0; i < 20 && !game.isOver(); i++) runCpuStep(game, game.current, PROFILES.easy);
        const again = Game.replay(game.persist().players, game.options, game.commands);
        expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
        expect(chooseCpuCommand(game, game.current, PROFILES.normal)).toEqual(chooseCpuCommand(again, again.current, PROFILES.normal));
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        // 読みは時間（TIME_LIMIT_MS）でも打ち切るので、遅いマシンでは浅くなり、勝ち負けが変わりうる。
        // 時計を止めて時間切れを起こさず、調べる局面の数（NODE_BUDGET）だけで打ち切る（マシンの速さによらず同じ結果になる）
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            const r = runMatches({ games: 10, profiles: ['normal', 'easy'] });
            expect(r.wins[0]).toBeGreaterThan(r.wins[1]);
            expect(r.captures[0]).toBeGreaterThan(r.captures[1]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('1手の考える時間は1秒より短い', () => {
        const { slowest } = playMatch({ profiles: ['normal', 'normal'], seed: 5, layout: 'german' });
        expect(slowest).toBeLessThan(1000);
    });
});
