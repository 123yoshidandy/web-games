import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { cellOf } from '../public/js/board.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { tileOf } from './helpers.js';

const two = () => [{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }];

describe('CPU どうしの試合', () => {
    for (const count of [1, 2, 3, 4]) {
        it(`${count}人：強さ・準備・シードを変えても、止まらずに最後まで進む`, () => {
            const cases = [[['easy'], 'standard', 4], [['easy', 'normal'], 'beginner', 2], [['normal'], 'standard', 1]];
            for (const [mix, setup, seeds] of cases) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= seeds; seed++) {
                    const game = playMatch({ count, levels, seed, setup });
                    expect(game.isOver(), `${count}人 ${levels} ${setup} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                    game.players.forEach(p => expect(p.quilt.filter(t => t != null).length).toBe(22));
                }
            }
        });
    }

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 8, count: 2, levels: ['easy', 'normal'] });
        expect(r.finished).toBe(8);
        expect(r.wins[1]).toBeGreaterThanOrEqual(7);
    });
});

describe('CPU の判断', () => {
    it('ビュー（JSON にしたもの）だけで決め、袋の順とほかの人の手札を使わない', () => {
        const game = new Game(two(), { seed: 4, startPlayer: 0, setup: 'beginner' });
        const view = JSON.parse(JSON.stringify(createGameView(game, 0)));
        const command = chooseCommand(view, 'normal', () => 0.5);
        expect(game.applyCommand(0, command)).toBe(true);
        // 袋の順と相手の手札を入れ替えても、同じ手を選ぶ
        const other = new Game(two(), { seed: 4, startPlayer: 0, setup: 'beginner' });
        other.bag.reverse();
        other.players[1].hand = [other.bag.pop(), other.bag.pop()];
        expect(chooseCommand(createGameView(other, 0), 'normal', () => 0.5)).toEqual(command);
    });

    it('すぐ取れる猫を取る：好きな模様が2枚並んだとなりに、同じ模様を置いてミリーを呼ぶ', () => {
        const game = new Game(two(), { seed: 2, startPlayer: 0, setup: 'beginner' });
        const millie = game.cats.find(c => c.id === 'millie');
        const pattern = millie.patterns[0];
        const p = game.players[0];
        const a = cellOf(3, 2);
        const b = cellOf(3, 3);
        p.quilt[a] = tileOf('yellow', pattern, 0);
        p.quilt[b] = tileOf('pink', pattern, 0);
        // 手札：同じ模様の1枚と、ほかの模様の1枚（色もほかと離す）
        const otherPattern = game.cats.find(c => c.id !== 'millie').patterns[0];
        p.hand = [tileOf('navy', otherPattern, 0), tileOf('green', pattern, 0)];
        game.bag = game.bag.filter(t => !p.hand.includes(t) && t !== p.quilt[a] && t !== p.quilt[b]);
        p.placed = 2;
        const command = chooseCommand(createGameView(game, 0), 'normal', () => 0);
        expect(command.hand).toBe(1);
        expect(game.applyCommand(0, command)).toBe(true);
        expect(p.cats.map(c => c.cat)).toContain('millie');
    });

    it('やさしいも、受け付けられる手を返す', () => {
        const game = new Game(two(), { seed: 3, startPlayer: 0 });
        for (const x of [0, 0.3, 0.7, 0.99]) {
            const copy = Game.replay(game.persist().players, game.persist().options, []);
            expect(copy.applyCommand(0, chooseCommand(createGameView(copy, 0), 'easy', () => x))).toBe(true);
            const place = chooseCommand(createGameView(copy, copy.current), 'easy', () => x);
            if (place) expect(copy.applyCommand(copy.current, place)).toBe(true);
        }
    });

    it('目標タイルは、配られた4枚から3枚を選ぶ', () => {
        const game = new Game(two(), { seed: 8 });
        const command = chooseCommand(createGameView(game, 1), 'normal', () => 0.5);
        expect(command.type).toBe('goals');
        expect(new Set(command.pick).size).toBe(3);
        expect(game.applyCommand(1, command)).toBe(true);
    });
});
