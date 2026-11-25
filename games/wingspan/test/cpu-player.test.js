import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, chooseCpuCommand, suggestSetup, PROFILES } from '../public/js/cpu-player.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot } from './helpers.js';

describe('CPU', () => {
    it('2〜5人の CPU だけの試合が、どのシードでも最後まで進む', () => {
        for (let n = 2; n <= 5; n++) {
            for (let seed = 1; seed <= 4; seed++) {
                const game = playMatch({ profiles: Array(n).fill(seed % 2 ? 'normal' : 'easy'), seed: seed * 31 + n });
                expect(game.isOver(), `${n}人 シード${seed}`).toBe(true);
            }
        }
    });

    it('でたらめな CPU でも最後まで進む', () => {
        const r = runMatches({ games: 10, profiles: ['random', 'random', 'random'], seedBase: 700 });
        expect(r.stuck).toBe(0);
    });

    it('CPU の手は記録から同じ試合を再現でき、判断にゲームの乱数を使わない', () => {
        const game = playMatch({ profiles: ['normal', 'easy', 'normal'], seed: 42 });
        const replayed = Game.replay(players(3, true).map((p, i) => ({ ...p, name: `${['normal', 'easy', 'normal'][i]}${i}` })), game.options, game.commands);
        expect(snapshot(replayed)).toBe(snapshot(game));
        // 判断の前後で、ゲームの状態（乱数を含む）が変わらない
        const g = new Game(players(2, true), { seed: 3 });
        const before = snapshot(g);
        chooseCpuCommand(g, 0, PROFILES.normal);
        expect(snapshot(g)).toBe(before);
    });

    it('準備では、鳥と餌を合わせて5つ残し、ボーナスカードを1枚選ぶ', () => {
        const g = new Game(players(2, true), { seed: 9 });
        const s = suggestSetup(g.players[0].offer);
        expect(s.birds.length + s.food.length).toBe(5);
        expect(g.players[0].offer.bonus).toContain(s.bonus);
        expect(runCpuStep(g, 0)).toBe(true);
        expect(g.players[0].offer).toBe(null);
    });

    it('ふつうは、やさしい2人に多く勝つ', () => {
        const r = runMatches({ games: 24, profiles: ['normal', 'easy', 'easy'], seedBase: 300 });
        expect(r.finished).toBe(24);
        expect(r.wins[0] / r.finished).toBeGreaterThan(0.6);
    });

    it('選択待ちがあれば、CPU は必ず受け付けられる手を返す', () => {
        const g = new Game(players(3, true), { seed: 77 });
        let steps = 0;
        while (!g.isOver() && steps++ < 3000) {
            const seat = cpuActors(g)[0];
            const cmd = chooseCpuCommand(g, seat, PROFILES.normal);
            expect(g.applyCommand(seat, cmd), `${JSON.stringify(cmd)} ${g.lastError}`).toBe(true);
        }
        expect(g.isOver()).toBe(true);
    });
});
