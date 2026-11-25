import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES, evaluateBoard } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { makeGame, setCard, snapshot, fullBoard, cell } from './helpers.js';

describe('CPU', () => {
    it('人数と強さを変えても、最後まで終わり、手が断られない', () => {
        for (const profiles of [['easy'], ['normal', 'easy'], ['normal', 'normal', 'easy'], ['easy', 'normal', 'normal', 'easy']]) {
            const r = runMatches({ games: 6, profiles, seedBase: 40 });
            expect(r.finished).toBe(6);
            expect(r.stuck).toBe(0);
            expect(r.fallbacks).toBe(0);
        }
    });

    it('CPU の試合は記録から再現できる（CPU はゲームの乱数を使わない）', () => {
        const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'easy' }, { name: 'B', isCPU: true }], { seed: 77 });
        let steps = 0;
        while (!game.isOver() && steps++ < 2000) runCpuStep(game, game.pending[0]);
        expect(game.isOver()).toBe(true);
        const saved = game.persist();
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('手を決めるだけでは状態を変えず、同じ場面では同じ手を選ぶ', () => {
        const game = makeGame(2, 12);
        const before = snapshot(game);
        const a = chooseCpuCommand(game, 0);
        expect(snapshot(game)).toBe(before);
        expect(chooseCpuCommand(game, 0)).toEqual(a);
        expect(game.applyCommand(0, a)).toBe(true);
    });

    it('1×1 しか描けないときは、山と異形以外の地形で描く', () => {
        const game = makeGame(1, 3);
        setCard(game, 'fishing');
        game.players[0].board = fullBoard('farm', [cell(0, 0), cell(5, 0)]);
        const command = chooseCpuCommand(game, 0);
        expect(command.fallback).toBe(true);
        expect(['forest', 'village', 'farm', 'water']).toContain(command.terrain);
    });

    it('異形を描く場所は、相手の評価が下がるところ', () => {
        const game = makeGame(2, 2);
        game.card = { kind: 'ambush', id: 'kobold' };
        game.phase = 'ambush';
        game.targets = [1, 0];
        game.pending = [0];
        const owner = game.players[1];
        const ctx = { edicts: game.edicts, weights: [1, 1, 1, 1], remaining: 1 };
        const command = chooseCpuCommand(game, 0, PROFILES.strong);
        const after = [...owner.board];
        command.cells.forEach(c => { after[c] = 'monster'; });
        expect(evaluateBoard(after, ctx)).toBeLessThanOrEqual(evaluateBoard(owner.board, ctx));
    });

    it('強さの順（やさしい＜ふつう＜つよい）になっている', () => {
        const easy = runMatches({ games: 30, profiles: ['easy', 'normal'], seedBase: 500 });
        expect(easy.wins[1]).toBeGreaterThan(easy.wins[0]);
        const normal = runMatches({ games: 30, profiles: ['normal', 'strong'], seedBase: 500 });
        expect(normal.wins[1]).toBeGreaterThan(normal.wins[0]);
    });
});
