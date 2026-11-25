import { describe, it, expect } from 'vitest';
import { chooseCommand, isCpuTurn, runCpuStep, plantValue } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { newGame, run } from './helpers.js';

const viewOf = (game, seat) => JSON.parse(JSON.stringify(createGameView(game, seat)));
const f = (type, n) => ({ type, n });

describe('CPU どうしの試合', () => {
    it('人数（3〜5）・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 3; count <= 5; count++) {
            for (const mix of [['normal'], ['easy'], ['easy', 'normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 10; seed++) {
                    const game = playMatch({ levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 90, levels: ['easy', 'normal', 'easy'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(45);
    });
});

describe('CPU の判断（ビューだけを見る）', () => {
    it('豆の価値：同じ種類の畑があれば良く、次の金額に届けばもっと良い。植える場所がなければ悪い', () => {
        expect(plantValue([f('red', 1), null], 'red')).toBeGreaterThan(plantValue([f('red', 1), null], 'soy'));
        expect(plantValue([f('stink', 2), null], 'stink')).toBeGreaterThan(plantValue([f('stink', 3), null], 'stink'));
        expect(plantValue([f('red', 1), f('soy', 1)], 'blue')).toBeLessThan(0);
        expect(plantValue([f('red', 1), null], 'blue', ['soy'])).toBeLessThan(0);
    });

    it('植える畑がなければ、金の多い畑を売ってから植える', () => {
        const game = newGame(4, { hands: [['blue', 'red']], fields: [[f('chili', 6), f('soy', 2)]] });
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'harvest', field: 0 });
    });

    it('いらない表の豆は、その豆の畑を持つ人に回す', () => {
        const game = newGame(4, {
            hands: [['red'], ['wax', 'soy'], ['soy'], ['soy']],
            fields: [[f('red', 2), f('soy', 3)], [f('blue', 2), null], [null, null], [null, null]],
            deck: ['blue', 'blue', 'green', 'green', 'green']
        });
        game.players.forEach(p => { p.isCPU = true; });
        run(game, [[0, { type: 'plant', field: 0 }]]);
        const command = chooseCommand(viewOf(game, 0), 'normal');
        expect(command).toMatchObject({ type: 'offer', to: 1, give: { faceUp: [0] } });
    });

    it('自分の畑の豆をもらえる取引は受け、損な取引は断る', () => {
        const game = newGame(4, {
            hands: [['red', 'chili'], ['blue', 'soy', 'garden'], ['soy'], ['soy']],
            fields: [[f('red', 2), null], [f('chili', 2), f('stink', 3)], [null, null], [null, null]],
            deck: ['wax', 'green', 'green', 'green', 'green']
        });
        run(game, [[0, { type: 'plant', field: 0 }, ], [0, { type: 'next' }], [0, { type: 'offer', to: 1, give: { hand: [0] }, want: { types: { soy: 1 } } }]]);
        expect(chooseCommand(viewOf(game, 1), 'normal')).toMatchObject({ type: 'respond', accept: true, hand: [1] });
        run(game, [[1, { type: 'respond', accept: false }], [0, { type: 'offer', to: 1, give: { faceUp: [0] }, want: { types: { blue: 1 } } }]]);
        expect(chooseCommand(viewOf(game, 1), 'normal')).toMatchObject({ type: 'respond', accept: false });
    });

    it('手番の CPU は、人がまだ提案できるあいだは取引を終えない', () => {
        const game = newGame(4, { hands: [['red'], ['soy'], ['soy'], ['soy']], fields: [[f('red', 1), null], [null, null], [null, null], [null, null]], deck: ['red', 'red', 'green', 'green', 'green'] });
        game.players[0].isCPU = true;
        game.players[1].isCPU = false;
        run(game, [[0, { type: 'plant', field: 0 }]]);
        expect(chooseCommand(viewOf(game, 0), 'normal')).toBe(null);
        run(game, [[1, { type: 'pass' }]]);
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'endTrade' });
    });

    it('人の番では CPU は動かない。CPU の番なら1手打つ', () => {
        const game = newGame(4);
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(null);
    });
});
