import { describe, it, expect, vi } from 'vitest';
import Game from '../public/js/game.js';
import { createState, legalActions, applyAction, actionKey, neighbors } from '../public/js/rules.js';
import { chooseCpuCommand, runCpuStep, scoreActions, PROFILES, isCpuTurn, TIME_LIMIT_MS } from '../public/js/cpu-player.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';

const cpus = () => [{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }];

// 局面を作る（rules.test.js と同じ形）
function position(layout, current = 0) {
    const s = createState({ expansions: [] });
    layout.forEach(([cell, owner, kind], id) => {
        (s.board[cell] ??= []).push({ id, owner, kind });
        s.hands[owner][kind]--;
    });
    s.nextId = layout.length;
    s.current = current;
    s.turns = [6, 6];
    return s;
}

// ゲームに局面を差し込む（白が席0になるシードを探す）
function gameWith(state) {
    for (let seed = 1; ; seed++) {
        const g = new Game(cpus(), { seed, expansions: [] });
        if (g.first !== 0) continue;
        g.state = state;
        g.cachedActions = null;
        return g;
    }
}

describe('CPU', () => {
    it('やさしい・ふつうとも、CPU 同士で最後まで（または長引いても止まらずに）進む', () => {
        for (const profiles of [['easy', 'normal'], ['normal', 'easy']]) {
            const { game, plies } = playMatch({ profiles, seed: 3 });
            expect(game.isOver() || plies >= 300).toBe(true);
            const saved = game.persist();
            expect(Game.replay(saved.players, saved.options, saved.commands).state.board).toEqual(game.state.board);
        }
    });

    it('拡張の駒を入れても進む', () => {
        const { game, plies } = playMatch({ profiles: ['normal', 'easy'], seed: 5, expansions: ['L', 'M', 'P'] });
        expect(game.isOver() || plies >= 300).toBe(true);
    });

    it('選ぶ手は、いつも通る手', () => {
        const g = new Game(cpus(), { seed: 9, expansions: ['L', 'M', 'P'] });
        for (let i = 0; i < 30 && !g.isOver(); i++) {
            const command = chooseCpuCommand(g, g.current, i % 2 ? PROFILES.easy : PROFILES.normal);
            expect(legalActions(g.state).map(actionKey)).toContain(actionKey(command));
            expect(g.applyCommand(g.current, command)).toBe(true);
        }
    });

    it('すぐ勝てる手は、やさしいでも必ず選ぶ', () => {
        // 黒の女王蜂 (0,0) の5方向がふさがり、白のアリ (-1,2) が最後の (0,1) に入れる
        const around = neighbors('0,0').slice(0, 5).map((c, i) => [c, i % 2, ['A', 'G', 'S', 'B', 'G'][i]]);
        const s = position([['0,0', 1, 'Q'], ...around, ['2,-2', 0, 'Q'], ['-1,2', 0, 'A']]);
        for (let seed = 0; seed < 5; seed++) {
            const g = gameWith(s);
            g.options.seed = seed;
            const command = chooseCpuCommand(g, g.current, PROFILES.easy);
            expect(applyAction(s, command).result?.winner).toBe(0);
        }
    });

    it('ふつうは、次に相手に女王蜂を囲まれる手を避ける', () => {
        // 白の女王蜂 (0,0) の5方向がふさがり、黒のアリ (-1,2) が (0,1) に入れば白の負け。白はふさぐ・逃げるなどで防ぐ
        const around = neighbors('0,0').slice(0, 5).map((c, i) => [c, 1 - (i % 2), ['A', 'G', 'S', 'B', 'G'][i]]);
        const s = position([['0,0', 0, 'Q'], ...around, ['2,-2', 1, 'Q'], ['-1,2', 1, 'A'], ['3,-3', 0, 'A']]);
        const g = gameWith(s);
        const command = chooseCpuCommand(g, g.current, PROFILES.normal);
        const after = applyAction(s, command);
        const losing = legalActions(after).some(a => applyAction(after, a).result?.winner === 1);
        expect(losing).toBe(false);
    });

    it('同じ局面なら同じ手を選び、ゲームの状態を変えない', () => {
        const g = new Game(cpus(), { seed: 4 });
        for (let i = 0; i < 8; i++) runCpuStep(g, g.current, PROFILES.normal);
        const before = JSON.stringify(g.state);
        expect(chooseCpuCommand(g)).toEqual(chooseCpuCommand(g));
        expect(JSON.stringify(g.state)).toBe(before);
    });

    it('1手を考える時間は、上限の近くで打ち切る', () => {
        const g = new Game(cpus(), { seed: 12, expansions: ['L', 'M', 'P'] });
        for (let i = 0; i < 24 && !g.isOver(); i++) runCpuStep(g, g.current, PROFILES.easy);
        const started = Date.now();
        scoreActions(g.state, 2);
        expect(Date.now() - started).toBeLessThan(TIME_LIMIT_MS + 400);
    });

    it('手番でない席・終わったあとは進めない', () => {
        const g = new Game(cpus(), { seed: 4 });
        expect(runCpuStep(g, 1 - g.current)).toBe(false);
        expect(isCpuTurn(g)).toBe(true);
        g.state = { ...g.state, result: { winner: null, reason: 'both' } };
        expect(runCpuStep(g, 0)).toBe(false);
        expect(isCpuTurn(g)).toBe(false);
    });

    it('ふつうはやさしいに勝ち越し、やさしいはでたらめに勝ち越す', () => {
        // 考える時間の打ち切り（Date.now）で結果が変わらないように、時計を止めて2手先まで読み切らせる
        // （マシンの速さに左右されず、同じシードなら同じ対局になる）
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            const a = runMatches({ games: 6, profiles: ['normal', 'easy'] });
            expect(a.wins[0]).toBeGreaterThan(a.wins[1]);
            const b = runMatches({ games: 6, profiles: ['easy', 'random'] });
            expect(b.wins[0]).toBeGreaterThanOrEqual(5);
        } finally {
            vi.useRealTimers();
        }
    });
});
