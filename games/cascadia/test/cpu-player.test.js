import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, legalPlacements, bestRotation } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { TILES } from '../public/js/tiles.js';
import { scoreEnv } from '../public/js/scoring.js';
import { playMatch, runMatches, MAX_STEPS, cardsFor } from '../scripts/cpu-match.mjs';

describe('CPU どうしの試合', () => {
    for (const count of [1, 2, 3, 4]) {
        it(`${count}人：強さ・得点カード・シードを変えても、止まらずに最後まで進む`, () => {
            const cases = [[['easy'], 'A', 4], [['easy', 'normal'], 'random', 2], [['normal'], 'BCDBC', 1]];
            for (const [mix, cards, seeds] of cases) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= seeds; seed++) {
                    const game = playMatch({ count, levels, seed, cards: cardsFor(cards, seed) });
                    expect(game.isOver(), `${count}人 ${levels} ${cards} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        });
    }

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 10, count: 2, levels: ['easy', 'normal'] });
        expect(r.finished).toBe(10);
        expect(r.wins[1]).toBeGreaterThanOrEqual(9);
    });
});

describe('CPU の判断', () => {
    it('ビュー（JSON にしたもの）だけで決め、山と袋の順を使わない', () => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 4, startPlayer: 0 });
        const view = JSON.parse(JSON.stringify(createGameView(game, 0)));
        const command = chooseCommand(view, 'normal', () => 0.5);
        expect(game.applyCommand(0, command)).toBe(true);
        // 山と袋の中身を入れ替えても、同じ手を選ぶ
        const other = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 4, startPlayer: 0 });
        other.stack.reverse();
        other.bag.reverse();
        expect(chooseCommand(createGameView(other, 0), 'normal', () => 0.5)).toEqual(command);
    });

    it('点の上がる手を選ぶ：クマのとなりにクマを置いてペアにする', () => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 2, startPlayer: 0 });
        const env = game.players[0].env;
        // 地にクマの印のタイルを2枚並べ、片方にクマを置いておく
        const bearTiles = TILES.filter(t => !t.starter && !t.keystone && t.wildlife.includes('bear'));
        env['1,0'] = { tile: bearTiles[0].id, rot: 0, token: 'bear' };
        env['2,0'] = { tile: bearTiles[1].id, rot: 0, token: null };
        game.display.tokens = ['bear', 'elk', 'elk', 'hawk'];
        // 最後の手番（先の見込みを数えない）なら、すぐ4点になるクマのペアがいちばん
        game.players[0].turns = 19;
        const command = chooseCommand(createGameView(game, 0), 'normal', () => 0);
        expect(command.token).toBe(0);
        expect(game.applyCommand(0, command)).toBe(true);
        expect(scoreEnv(game.players[0].env, game.cards).wildlife.bear).toBe(4);
    });

    it('やさしいも、置ける手を返す', () => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 3, startPlayer: 0 });
        for (const x of [0, 0.3, 0.7, 0.99]) {
            const copy = Game.replay(game.persist().players, game.persist().options, []);
            expect(copy.applyCommand(0, chooseCommand(createGameView(copy, 0), 'easy', () => x))).toBe(true);
        }
    });

    it('置ける手の一覧はすべて受け付けられ、下書きの向きは地形がいちばんそろう向き', () => {
        const game = new Game([{ name: 'A' }, { name: 'B' }], { seed: 6, startPlayer: 0 });
        const moves = legalPlacements(createGameView(game, 0));
        expect(moves.length).toBeGreaterThan(50);
        moves.filter((_, i) => i % 37 === 0).forEach(m => {
            const copy = Game.replay(game.persist().players, game.persist().options, []);
            expect(copy.applyCommand(0, m), JSON.stringify(m)).toBe(true);
        });
        const env = game.players[0].env;
        const tile = TILES.find(t => t.habitats.length === 2 && !t.starter);
        const rot = bestRotation(env, tile, 1, 0);
        expect(rot).toBeGreaterThanOrEqual(0);
        expect(rot).toBeLessThan(6);
    });
});
