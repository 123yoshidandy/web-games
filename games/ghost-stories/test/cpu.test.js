import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, isCpuTurn } from '../public/js/cpu-player.js';
import { playMatch } from '../scripts/cpu-match.mjs';
import { LEVELS } from '../public/js/data.js';
import { players, snapshot } from './helpers.js';

describe('CPU', () => {
    it('CPU だけの試合が、難易度とシードを変えても最後まで進む', () => {
        Object.keys(LEVELS).forEach(level => {
            for (let seed = 1; seed <= 15; seed++) {
                const game = playMatch({ level, seed: seed * 37 });
                expect(game.isOver(), `${level} ${seed}`).toBe(true);
            }
        });
    });

    it('同じ状態なら同じ手を打ち、CPU の試合も記録から再現できる', () => {
        const a = playMatch({ level: 'normal', seed: 77 });
        const b = playMatch({ level: 'normal', seed: 77 });
        expect(snapshot(a)).toBe(snapshot(b));
        const saved = JSON.parse(JSON.stringify(a.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(a));
    });

    it('人の席は CPU が動かさない。席を指定すれば代わりに1手打つ', () => {
        const game = new Game(players(4), { seed: 3 });
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(false);
        expect(runCpuStep(game, game.current)).toBe(true);
        expect(game.commands).toHaveLength(1);
    });

    it('入門は標準より、標準は悪夢より勝ちやすい', () => {
        const rate = (level) => {
            let wins = 0;
            for (let seed = 1; seed <= 60; seed++) if (playMatch({ level, seed: 9000 + seed }).result.won) wins++;
            return wins;
        };
        const [a, b, c] = ['initiation', 'normal', 'nightmare'].map(rate);
        expect(a).toBeGreaterThan(b);
        expect(b).toBeGreaterThan(c);
    });
});
