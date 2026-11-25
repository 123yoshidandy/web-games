import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, nextCpuSeat, estimateValues } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot, newGame, card, run } from './helpers.js';

const KR = 4, YO = 1;

describe('CPU', () => {
    it('ビューだけで決め、同じビューなら同じ手を選び、ゲームの状態を変えない', () => {
        for (const level of ['easy', 'normal']) {
            const game = new Game(players(4, true).map(p => ({ ...p, cpuLevel: level })), { seed: 11 });
            let steps = 0;
            while (!game.isOver() && steps++ < 6000) {
                const seat = nextCpuSeat(game);
                const before = snapshot(game);
                const view = JSON.parse(JSON.stringify(createGameView(game, seat)));
                const a = chooseCommand(view, level);
                expect(chooseCommand(view, level)).toEqual(a);
                expect(snapshot(game)).toBe(before);
                if (!game.applyCommand(seat, a)) runCpuStep(game);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('入札では、ほかの人の握った額が見えない', () => {
        const game = newGame(3, { hands: [[card(KR, 'sealed')], [card(YO, 'open')], [card(YO, 'open', 1)]] });
        run(game, [[0, { type: 'play', card: card(KR, 'sealed') }], [1, { type: 'bid', amount: 33 }]]);
        const view = createGameView(game, 2);
        expect(JSON.stringify(view)).not.toContain('33');
        expect(view.auction.sealedDone).toEqual([false, true, false]);
        expect(createGameView(game, 1).auction.mySealed).toBe(33);
    });

    it('値打ちの見込み：この回にたくさん出ている画家と、これまでの値が高い画家ほど高い', () => {
        const game = newGame(4, { seed: 3 });
        game.counts = [0, 0, 3, 1, 0];
        game.tokens[0] = [30, 0, 0, 0, 0];
        const values = estimateValues(createGameView(game, 0));
        expect(values[2]).toBeGreaterThan(values[3]);
        expect(values[2]).toBeGreaterThan(values[4]);
        expect(Math.max(...values)).toBeLessThanOrEqual(60);
    });

    it('ふつうは、値打ちより高い値では買わない', () => {
        const game = newGame(3, { hands: [[card(KR, 'fixed')], [card(YO, 'open')], [card(YO, 'open', 1)]] });
        run(game, [[0, { type: 'play', card: card(KR, 'fixed') }], [0, { type: 'price', amount: 90 }]]);
        expect(chooseCommand(createGameView(game, 1), 'normal')).toEqual({ type: 'pass' });
    });

    it('ふつうは、やさしいに大きく勝ち越す（3人と5人）', () => {
        const three = runMatches({ games: 60, levels: ['easy', 'normal', 'easy'] });
        expect(three.finished).toBe(60);
        expect(three.wins[1] / three.finished).toBeGreaterThan(0.6);
        const five = runMatches({ games: 40, levels: ['easy', 'normal', 'easy', 'normal', 'easy'] });
        expect(five.finished).toBe(40);
        expect((five.wins[1] + five.wins[3]) / five.finished).toBeGreaterThan(0.6);
    });
});
