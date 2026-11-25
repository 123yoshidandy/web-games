import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCpuCommand, runCpuStep, cpuActors, decide, PROFILES } from '../public/js/cpu-player.js';
import { players, setup, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const playOut = (game, profile) => {
    let steps = 0;
    while (!game.isOver() && steps++ < 5000) expect(runCpuStep(game, cpuActors(game)[0], profile)).toBe(true);
    return game;
};
const fixed = () => 0.5; // 揺れのない乱数（noise は0、blunder・milk の判定は 0.5）

describe('CPU', () => {
    it.each([3, 4, 5, 6, 7])('全員 CPU の%i人戦が、どの強さでも20シードとも最後まで進み、記録から再現できる', (n) => {
        for (const profile of [PROFILES.easy, PROFILES.normal, PROFILES.random]) {
            for (let seed = 1; seed <= 20; seed++) {
                const game = playOut(new Game(players(n, true), { seed }), profile);
                expect(game.isOver()).toBe(true);
                const saved = game.persist();
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('ほかの人のチップの数や山札の並びで、手を変えない（のぞかない）', () => {
        const a = new Game(players(4, true), { seed: 7 });
        const b = new Game(players(4, true), { seed: 7 });
        const others = [0, 1, 2, 3].filter(seat => seat !== a.turn);
        others.forEach(seat => { b.players[seat].chips = 1; });
        b.deck.reverse();
        b.removed = [...b.removed].reverse();
        for (const profile of Object.values(PROFILES)) {
            expect(chooseCpuCommand(a, a.turn, profile)).toEqual(chooseCpuCommand(b, b.turn, profile));
        }
    });

    it('チップがなければ取る', () => {
        const game = new Game(players(3, true), { seed: 1 });
        setup(game, { current: 35, pot: 0, turn: 0, chips: [0, 11, 11] });
        Object.values(PROFILES).forEach(profile => expect(chooseCpuCommand(game, 0, profile)).toEqual({ type: 'take' }));
    });

    it('大きなカードはチップなしでは取らず、チップが十分たまれば取る', () => {
        const game = new Game(players(4, true), { seed: 1 });
        setup(game, { current: 30, pot: 0, turn: 0, chips: [11, 11, 11, 11], cards: [[], [], [], []] });
        expect(decide(createGameView(game, 0), fixed, PROFILES.normal)).toEqual({ type: 'pass' });
        setup(game, { pot: 26 });
        expect(decide(createGameView(game, 0), fixed, PROFILES.normal)).toEqual({ type: 'take' });
    });

    it('チップが少ないほど、早めに取る', () => {
        const game = new Game(players(4, true), { seed: 1 });
        setup(game, { current: 20, pot: 8, turn: 0, cards: [[], [], [], []] });
        setup(game, { chips: [11, 11, 11, 11] });
        expect(decide(createGameView(game, 0), fixed, PROFILES.normal)).toEqual({ type: 'pass' });
        setup(game, { chips: [1, 11, 11, 11] });
        expect(decide(createGameView(game, 0), fixed, PROFILES.normal)).toEqual({ type: 'take' });
    });

    it('自分にだけつながるカードは、回してチップを集める。ほかの人にもつながるなら、すぐ取る', () => {
        const game = new Game(players(4, true), { seed: 1 });
        setup(game, { current: 27, pot: 0, turn: 0, chips: [8, 11, 11, 11], cards: [[26], [10], [12], [14]] });
        expect(decide(createGameView(game, 0), () => 0.1, PROFILES.strong)).toEqual({ type: 'pass' });
        setup(game, { cards: [[26], [28], [12], [14]] });
        expect(decide(createGameView(game, 0), () => 0.1, PROFILES.strong)).toEqual({ type: 'take' });
    });

    it('強さの順：ふつうは、やさしいに勝ち越し、やさしいは、でたらめに大きく勝ち越す', () => {
        const a = runMatches({ games: 300, profiles: ['normal', 'easy', 'easy', 'easy'] });
        expect(a.finished).toBe(300);
        expect(a.wins[0] / a.finished).toBeGreaterThan(0.3);
        const b = runMatches({ games: 200, profiles: ['easy', 'random', 'random', 'random'] });
        expect(b.wins[0] / b.finished).toBeGreaterThan(0.8);
    });
});
