import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, chooseCpuCommand, PROFILES } from '../public/js/cpu-player.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot } from './helpers.js';

describe('CPU', () => {
    it('2〜5人・3つの並びで、CPU だけの試合が最後まで進み、記録から同じ結果を再現できる', () => {
        for (let n = 2; n <= 5; n++) {
            ['short', 'order', 'random'].forEach((layout, i) => {
                const profiles = Array.from({ length: n }, (_, k) => (k % 2 ? 'easy' : 'hard'));
                const game = playMatch({ profiles, seed: n * 10 + i, layout });
                expect(game.isOver(), `${n}人 ${layout}`).toBe(true);
                expect(Math.max(...game.players.map(p => p.rubies))).toBeGreaterThanOrEqual(game.rubyTarget());
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            });
        }
    });

    it('手を決めても、ゲームの状態（乱数を含む）を変えない', () => {
        const game = new Game(players(3, true), { seed: 9 });
        for (let i = 0; i < 30; i++) {
            const seat = cpuActors(game)[0];
            const before = snapshot(game);
            chooseCpuCommand(game, seat, PROFILES.hard);
            expect(snapshot(game)).toBe(before);
            runCpuStep(game, seat, PROFILES.hard);
        }
    });

    it('強さの順になる（つよい ＞ やさしい ＞ でたらめ）', () => {
        const r = runMatches({ games: 12, profiles: ['hard', 'easy', 'random'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[0]).toBeGreaterThan(r.wins[1]);
        expect(r.wins[1]).toBeGreaterThanOrEqual(r.wins[2]);
    });
});
