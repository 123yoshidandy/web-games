import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, isCpuTurn, infectionOdds } from '../public/js/cpu-player.js';
import { playMatch } from '../scripts/cpu-match.mjs';
import { LEVELS, ROLES, EVENT_BY_KEY } from '../public/js/cities.js';
import { players, snapshot, setHand, clearBoard, setCubes, C } from './helpers.js';

describe('CPU', () => {
    it('CPU だけの試合が、人数・難易度・シードを変えても最後まで進む', () => {
        [2, 3, 4].forEach(count => Object.keys(LEVELS).forEach(level => {
            for (let seed = 1; seed <= 4; seed++) {
                const game = playMatch({ count, level, seed: seed * 31 + count });
                expect(game.isOver(), `${count}人 ${level} ${seed}`).toBe(true);
            }
        }));
    });

    it('どの役割でも最後まで進む', () => {
        const keys = ROLES.map(r => r.key);
        for (let i = 0; i < keys.length; i++) {
            const roles = [keys[i], keys[(i + 1) % keys.length], keys[(i + 3) % keys.length]];
            const game = playMatch({ count: 3, level: 'standard', seed: 100 + i, roles });
            expect(game.isOver(), roles.join(',')).toBe(true);
        }
    });

    it('同じ状態なら同じ手を打ち、CPU の試合も記録から再現できる', () => {
        const a = playMatch({ count: 3, level: 'intro', seed: 77 });
        const b = playMatch({ count: 3, level: 'intro', seed: 77 });
        expect(snapshot(a)).toBe(snapshot(b));
        const saved = JSON.parse(JSON.stringify(a.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(a));
    });

    it('人の席は CPU が動かさない。席を指定すれば代わりに1手打つ', () => {
        const game = new Game(players(2), { seed: 3 });
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(false);
        expect(runCpuStep(game, game.current)).toBe(true);
        expect(game.commands).toHaveLength(1);
    });

    it('治療薬を作れる手札で研究所にいれば、発見する', () => {
        const game = new Game(players(2, true), { seed: 4, roles: ['researcher', 'medic'] });
        game.current = 0;
        clearBoard(game);
        setHand(game, 0, ['Paris', 'London', 'Madrid', 'Essen', 'Milan']);
        runCpuStep(game);
        expect(game.cures[0]).toBeGreaterThan(0);
    });

    it('同じ都市にいる仲間に、集めている色のカードを渡す', () => {
        const game = new Game(players(2, true), { seed: 4, roles: ['researcher', 'scientist'] });
        game.current = 0;
        clearBoard(game);
        setHand(game, 0, ['Atlanta', 'Tokyo']);
        setHand(game, 1, ['Chicago', 'Montreal', 'New York']);
        runCpuStep(game);
        expect(game.players[1].hand).toContain(C('Atlanta'));
    });

    it('次に出る都市が3個なら、その都市を治療しに行く', () => {
        const game = new Game(players(2, true), { seed: 4, roles: ['medic', 'scientist'] });
        game.current = 0;
        clearBoard(game);
        setHand(game, 0, []);
        setCubes(game, { Miami: 3 });
        game.known = [[C('Miami')]];
        expect(infectionOdds(game)[C('Miami')]).toBe(1);
        for (let i = 0; i < 4 && game.phase === 'actions'; i++) runCpuStep(game);
        expect(game.cubes[C('Miami')][1]).toBe(0);
    });

    it('危ないときは静かな夜を使う', () => {
        const game = new Game(players(2, true), { seed: 4, roles: ['medic', 'scientist'] });
        game.current = 0;
        clearBoard(game);
        setHand(game, 1, [EVENT_BY_KEY.quiet.id]);
        setCubes(game, { Sydney: 3, Lima: 3 });
        game.known = [['Sydney', 'Lima'].map(C)];
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'draw' });
        if (game.phase === 'discard') return;
        runCpuStep(game);
        expect(game.quiet || game.players[1].hand.length === 0).toBe(true);
    });
});
