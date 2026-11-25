import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, isCpuTurn } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { newGame, setRes, run, place, snapshot } from './helpers.js';

const cpus = (levels) => levels.map((level, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: level }));

describe('CPU', () => {
    it.each([2, 3, 4, 5])('%i人の CPU だけの試合が、最後まで進む', (n) => {
        for (let seed = 1; seed <= 4; seed++) {
            const game = new Game(cpus(Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal'))), { seed: seed * 13 + n });
            let steps = 0;
            while (!game.isOver() && steps++ < 3000) expect(runCpuStep(game)).toBe(true);
            expect(game.isOver()).toBe(true);
        }
    });

    it('CPU の手は記録から同じ状態に再現できる（ゲームの乱数を使わない）', () => {
        const game = new Game(cpus(['normal', 'easy', 'normal']), { seed: 99 });
        while (!game.isOver()) runCpuStep(game);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('同じ状態からは同じ手を選ぶ', () => {
        const a = new Game(cpus(['normal', 'normal']), { seed: 4 });
        const b = new Game(cpus(['normal', 'normal']), { seed: 4 });
        for (let i = 0; i < 30; i++) {
            const [seat] = a.actors();
            expect(chooseCommand(a, seat, 'normal')).toEqual(chooseCommand(b, seat, 'normal'));
            runCpuStep(a);
            runCpuStep(b);
        }
    });

    it('先読みしても、もとのゲームは変わらない', () => {
        const game = new Game(cpus(['normal', 'normal', 'normal']), { seed: 8 });
        const before = snapshot(game);
        chooseCommand(game, game.actors()[0], 'normal');
        expect(snapshot(game)).toBe(before);
    });

    it('達成できるクエストは達成する', () => {
        const game = newGame(2);
        game.players.forEach(p => { p.quests = []; p.intrigue = []; });
        game.players[1].quests = ['w03'];
        setRes(game, 1, { f: 1, w: 1 });
        run(game, [[0, place('shop')], [1, place('field')]]);
        expect(isCpuTurn(game)).toBe(true);
        runCpuStep(game);
        expect(game.players[1].completed).toEqual(['w03']);
    });

    it('人間の番では打たない', () => {
        const game = newGame(2);
        expect(isCpuTurn(game)).toBe(false);
    });

    it('ふつうは、やさしいより強い（2人で60試合）', () => {
        const r = runMatches({ games: 60, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(r.wins[0] * 2);
        expect(r.scores[1]).toBeGreaterThan(r.scores[0]);
    });
});
