import { describe, it, expect } from 'vitest';
import { PROFILES, decide, chipWorth } from '../public/js/cpu-player.js';
import { createGameView, explodeRisk } from '../public/js/game-view.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { restartWith, makeGame, stack, act } from './helpers.js';

const fixed = (x = 0.5) => () => x;

describe('CPU', () => {
    it('人数と強さを変えても、最後まで進む', () => {
        [2, 3, 4].forEach(n => {
            ['easy', 'normal', 'random'].forEach(level => {
                const r = runMatches({ games: 6, profiles: Array(n).fill(level), seedBase: 100 * n });
                expect(r.stuck).toBe(0);
                expect(r.finished).toBe(6);
            });
        });
    });

    it('ふつうは、やさしいより強い（席を入れ替えても）', () => {
        const a = runMatches({ games: 60, profiles: ['normal', 'easy', 'normal', 'easy'], seedBase: 1 });
        const b = runMatches({ games: 60, profiles: ['easy', 'normal', 'easy', 'normal'], seedBase: 500 });
        const normal = (a.wins[0] + a.wins[2] + b.wins[1] + b.wins[3]) / 120;
        expect(normal).toBeGreaterThan(0.7);
    });

    it('爆発の危険がなければ引き、とても高ければ止める', () => {
        const game = restartWith(makeGame(2), 'rabbit');
        stack(game, 0, ['O1', 'W3', 'W3', 'W1']);
        let view = createGameView(game, 0);
        expect(view.me.risk).toBe(0);
        expect(decide(view, fixed(), PROFILES.normal)).toEqual({ type: 'draw' });
        game.players[0].brew.whites = 6;
        game.players[0].brew.pos = 20; // 失うものが大きい
        view = createGameView(game, 0);
        expect(view.me.risk).toBeCloseTo(2 / 4); // 白3の2つ
        expect(decide(view, fixed(), PROFILES.normal)).toEqual({ type: 'stop' });
        expect(decide(view, fixed(), PROFILES.easy)).toEqual({ type: 'stop' });
    });

    it('マンドラゴラの白は戻し、カラスでは白を選ばない', () => {
        const game = restartWith(makeGame(2), 'rabbit');
        stack(game, 0, ['W2', 'Y1', 'B2', 'W1', 'R1']);
        game.players[0].flask = false;
        act(game, 0, 'draw', 'draw');
        expect(decide(createGameView(game, 0), fixed(), PROFILES.normal)).toEqual({ type: 'mandrake' });
        act(game, 0, 'mandrake', 'draw');
        expect(decide(createGameView(game, 0), fixed(), PROFILES.normal)).toEqual({ type: 'pick', index: 1 });
    });

    it('買い物は違う色を2つまで、お金の範囲で選ぶ', () => {
        const game = restartWith(makeGame(2), 'rabbit');
        stack(game, 0, Array(15).fill('O1'));
        act(game, 0, ...Array(15).fill('draw'), 'stop');
        act(game, 1, 'stop');
        ['easy', 'normal', 'random'].forEach(level => {
            const command = decide(createGameView(game, 0), fixed(0.3), PROFILES[level]);
            expect(command.type).toBe('shop');
            expect(game.applyCommand(0, command) || game.lastError).toBe(true);
            game.players[0].shopped = false;
            game.phase = 'shop';
        });
    });

    it('材料の値打ちは、後の回ほど下がる', () => {
        expect(chipWorth('B4', 2)).toBeGreaterThan(chipWorth('B4', 8));
        expect(chipWorth('R4', 3)).toBeGreaterThan(chipWorth('R1', 3));
    });

    it('爆発の確率は、袋の中で合計を7より大きくする白の割合', () => {
        expect(explodeRisk(['W1', 'W2', 'W3', 'O1'], 5, 7)).toBeCloseTo(1 / 4); // 5+2 は7で、まだ爆発しない
        expect(explodeRisk([], 5, 7)).toBe(0);
    });
});
