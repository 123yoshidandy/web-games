import { describe, it, expect } from 'vitest';
import { playMatch } from '../scripts/cpu-match.mjs';
import { makeGame, fixLayout, dryAll, place, setHand } from './helpers.js';
import { DRY, FLOODED, SUNK } from '../public/js/game.js';
import { runCpuStep, isCpuTurn } from '../public/js/cpu-player.js';

describe('CPU', () => {
    it.each([2, 3, 4])('%i人の CPU だけの試合が、難易度とシードを変えても最後まで進む', (count) => {
        for (const level of ['novice', 'normal', 'elite', 'legendary']) {
            for (let seed = 1; seed <= 2; seed++) {
                const game = playMatch({ count, level, seed });
                expect(game.isOver(), `${level} ${seed}`).toBe(true);
            }
        }
    });

    it('同じ状態なら同じ手を打つ（ゲームの乱数を使わない）', () => {
        const a = makeGame(3, { seed: 21 });
        const b = makeGame(3, { seed: 21 });
        a.players.forEach(p => { p.isCPU = true; });
        b.players.forEach(p => { p.isCPU = true; });
        for (let i = 0; i < 60; i++) {
            runCpuStep(a);
            runCpuStep(b);
        }
        expect(JSON.stringify(a.commands)).toBe(JSON.stringify(b.commands));
    });

    it('人の席だけなら、CPU は動かない', () => {
        const game = makeGame(2, { seed: 3 });
        expect(isCpuTurn(game)).toBe(false);
    });

    it('沈んだら逃げ先がない駒は、浸水の段階で土のうで足元を乾かす', () => {
        const game = makeGame(2, { seed: 3, roles: ['engineer', 'messenger'] });
        fixLayout(game);
        dryAll(game);
        game.players.forEach(p => { p.isCPU = true; });
        // 0 のとなりは 1 と 3。両方沈めて、0 を浸水させる
        game.tiles[1] = SUNK;
        game.tiles[3] = SUNK;
        game.tiles[0] = FLOODED;
        place(game, 1, 0);
        setHand(game, 1, ['sand']);
        game.phase = 'flood';
        game.floodLeft = 2;
        expect(runCpuStep(game)).toBe(true);
        expect(game.tiles[0]).toBe(DRY);
        expect(game.players[1].hand).toEqual([]);
    });

    it('脱出できるときは脱出する', () => {
        const game = makeGame(2, { seed: 3 });
        game.players.forEach(p => { p.isCPU = true; p.tile = 0; });
        game.players[1].hand = ['heli'];
        game.captured = [true, true, true, true];
        game.tiles[0] = 1;
        expect(runCpuStep(game)).toBe(true);
        expect(game.result).toEqual({ won: true, reason: 'won' });
    });
});
