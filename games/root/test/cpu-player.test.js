import { describe, it, expect } from 'vitest';
import { runMatches } from '../scripts/cpu-match.mjs';
import { chooseCpuCommand, runCpuStep, cpuActors } from '../public/js/cpu-player.js';
import Game from '../public/js/game.js';
import { finishSetup, makeGame, snapshot } from './helpers.js';

const SETS = [
    ['marquise', 'eyrie', 'alliance', 'vagabond'],
    ['marquise', 'eyrie'], ['marquise', 'alliance'], ['marquise', 'vagabond'],
    ['eyrie', 'alliance'], ['eyrie', 'vagabond'], ['alliance', 'vagabond'],
    ['marquise', 'eyrie', 'alliance'], ['eyrie', 'alliance', 'vagabond'], ['marquise', 'alliance', 'vagabond']
];

describe('CPU', () => {
    it.each(SETS.map(s => [s.join('・'), s]))('CPU だけの試合が最後まで進む（%s）', (name, factions) => {
        const r = runMatches({ games: 12, factions, seedBase: 100 });
        expect(r.stuck).toBe(0);
        expect(r.finished).toBe(12);
    });

    it('CPU の判断はゲームの状態を変えない', () => {
        const game = finishSetup(makeGame());
        const before = snapshot(game);
        chooseCpuCommand(game, game.actors()[0]);
        expect(snapshot(game)).toBe(before);
    });
});

describe('CPU の強さ', () => {
    it('やさしいでも最後まで進み、強さは記録に残って同じに再現できる', () => {
        const game = new Game(['marquise', 'eyrie', 'alliance', 'vagabond'].map((faction, i) => ({ name: `P${i}`, faction, isCPU: true })), { seed: 3, level: 'easy' });
        let steps = 0;
        while (!game.isOver() && steps++ < 20000) runCpuStep(game, cpuActors(game)[0]);
        expect(game.isOver()).toBe(true);
        const saved = game.persist();
        expect(saved.options.level).toBe('easy');
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});
