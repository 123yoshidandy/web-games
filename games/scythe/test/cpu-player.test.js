import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, decide, PROFILES } from '../public/js/cpu-player.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';
import { snapshot } from './helpers.js';

describe('CPU', () => {
    it('人数とシードを変えても、CPU だけの試合が6つの星で最後まで終わり、記録から再現できる', () => {
        [[2, 1], [3, 2], [4, 3], [5, 4], [2, 5], [3, 6]].forEach(([count, seed]) => {
            const profiles = Array.from({ length: count }, (_, i) => (i % 2 ? 'easy' : 'normal'));
            const game = playMatch({ profiles, seed });
            expect(game.isOver(), `${count}人・シード${seed}`).toBe(true);
            expect(game.endReason).toContain('6つ目の星');
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        });
    });

    it('CPU の判断でゲームの乱数を使わない（判断の前後で乱数の状態が変わらない）', () => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 9 });
        for (let i = 0; i < 40; i++) {
            const rng = game.rng;
            const seat = cpuActors(game)[0];
            decide(game, seat, PROFILES.normal);
            expect(game.rng).toBe(rng);
            runCpuStep(game, seat);
        }
    });

    it('戦闘で、相手より強ければ勝てるだけの力を選び、持っている以上は選ばない', () => {
        const game = new Game([{ name: 'A', isCPU: true, faction: 'crimea', mat: 'industrial' }, { name: 'B', isCPU: true, faction: 'saxony', mat: 'engineering' }], { seed: 3 });
        game.units = game.units.filter(u => u.kind !== 'char');
        const a = game.addUnit(0, 'char', 30);
        game.addUnit(1, 'char', 30);
        game.combat = { hex: a.hex, attacker: 0, defender: 1, choices: {} };
        game.step = 'combat';
        game.players[1].power = 0;
        game.players[1].cards = [];
        const choice = decide(game, 0, PROFILES.normal);
        expect(choice.power).toBeGreaterThanOrEqual(0);
        expect(choice.power).toBeLessThanOrEqual(Math.min(7, game.players[0].power));
        expect(game.applyCommand(0, choice)).toBe(true);
    });

    // CPU は時間で打ち切らず、判断もシードだけで決まるので、勝敗は毎回同じになる。
    // 1試合が手元で約1.6秒かかり、CI は2倍ほど遅いので、試合数は10に抑え、時間にも余裕を持たせる。
    // 先手の有利で結果がゆがまないよう、席を入れ替えて半分ずつ戦う。
    it('ふつうは、やさしいより多く勝つ', () => {
        const first = runMatches({ games: 5, profiles: ['normal', 'easy'], seedBase: 100 });
        const second = runMatches({ games: 5, profiles: ['easy', 'normal'], seedBase: 100 });
        expect(first.finished + second.finished).toBe(10);
        expect(first.wins[0] + second.wins[1]).toBeGreaterThanOrEqual(7);
    }, 120000);
});
