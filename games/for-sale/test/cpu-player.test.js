import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCpuCommand, runCpuStep, cpuActors, decideBid, decideSale, PROFILES } from '../public/js/cpu-player.js';
import { players, setup, auction, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const playOut = (game, profile) => {
    let steps = 0;
    while (!game.isOver() && steps++ < 5000) expect(runCpuStep(game, cpuActors(game)[0], profile)).toBe(true);
    return game;
};
const fixed = () => 0.5; // 揺れのない乱数（noise は0、jump・careless の判定は 0.5）

describe('CPU', () => {
    it.each([3, 4, 5, 6])('全員 CPU の%i人戦が、どの強さでも20シードとも最後まで進み、記録から再現できる', (n) => {
        for (const profile of [PROFILES.easy, PROFILES.normal, PROFILES.random]) {
            for (let seed = 1; seed <= 20; seed++) {
                const game = playOut(new Game(players(n, true), { seed }), profile);
                expect(game.isOver()).toBe(true);
                const saved = game.persist();
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('山札の並びや、後半にほかの人が先に出した物件で、手を変えない（のぞかない）', () => {
        const a = new Game(players(3, true), { seed: 7 });
        const b = new Game(players(3, true), { seed: 7 });
        b.propDeck.reverse();
        b.removedProps = [...b.removedProps].reverse();
        for (const profile of Object.values(PROFILES)) {
            expect(chooseCpuCommand(a, a.turn, profile)).toEqual(chooseCpuCommand(b, b.turn, profile));
        }
        const c = new Game(players(3, true), { seed: 8 });
        const d = new Game(players(3, true), { seed: 8 });
        [c, d].forEach(game => { while (game.phase === 'bid') runCpuStep(game, game.turn); });
        c.applyCommand(1, { type: 'sell', card: c.players[1].hand[0] });
        d.applyCommand(1, { type: 'sell', card: d.players[1].hand.at(-1) });
        for (const profile of Object.values(PROFILES)) {
            expect(chooseCpuCommand(c, 0, profile)).toEqual(chooseCpuCommand(d, 0, profile));
        }
    });

    it('物件の差が小さい競りは降り、差が大きい競りは上げる', () => {
        const game = new Game(players(4, true), { seed: 1 });
        setup(game, { market: [10, 11, 12, 13], turn: 3 });
        auction(game, [1]);
        expect(decideBid(createGameView(game, 0), fixed, PROFILES.normal)).toEqual({ type: 'pass' });
        setup(game, { market: [2, 11, 20, 29], turn: 0 });
        expect(decideBid(createGameView(game, 0), fixed, PROFILES.normal).type).toBe('bid');
        // 差の値打ちより高くなったら降りる
        auction(game, [11]);
        game.turn = 0;
        expect(decideBid(createGameView(game, 0), fixed, PROFILES.normal)).toEqual({ type: 'pass' });
    });

    it('売り：小切手の差が大きいときは強い物件、0 しか取れそうにないときは弱い物件を出す', () => {
        const game = new Game(players(3, true), { seed: 1 });
        setup(game, { propDeck: [], market: [28, 29, 30] });
        auction(game, ['p', 'p']);
        setup(game, { hands: [[2, 29, 30], [10, 12, 14], [11, 13, 15]] });
        game.checkMarket = [15, 14, 0];
        expect(decideSale(createGameView(game, 0), fixed, PROFILES.strong).card).toBe(29);
        setup(game, { hands: [[2, 8, 30], [10, 12, 14], [11, 13, 15]] });
        game.checkMarket = [3, 2, 0];
        expect(decideSale(createGameView(game, 0), fixed, PROFILES.strong).card).toBe(2);
    });

    it('強さの順：ふつうは、やさしいに勝ち越し、やさしいは、でたらめに勝ち越す', () => {
        const a = runMatches({ games: 300, profiles: ['normal', 'easy', 'easy', 'easy'] });
        expect(a.finished).toBe(300);
        expect(a.wins[0] / a.finished).toBeGreaterThan(0.33);
        const b = runMatches({ games: 200, profiles: ['easy', 'random', 'random', 'random'] });
        expect(b.wins[0] / b.finished).toBeGreaterThan(0.5);
    });
});
