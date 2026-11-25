import { describe, it, expect } from 'vitest';
import { runMatches } from '../scripts/cpu-match.mjs';
import { chooseCpuCommand } from '../public/js/cpu-player.js';
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
