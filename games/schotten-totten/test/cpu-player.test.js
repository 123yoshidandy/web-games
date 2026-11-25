import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCpuCommand, PROFILES } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, makeGame, setup, snapshot, card } from './helpers.js';

describe('CPU', () => {
    [false, true].forEach(tactics => {
        it(`CPU だけの試合が、どの強さでも必ず終わる。選んだ手は必ず通る（戦術カード${tactics ? 'あり' : 'なし'}）`, () => {
            ['easy', 'normal', 'random'].forEach(level => {
                for (let seed = 1; seed <= 8; seed++) {
                    const game = new Game(players(true), { seed, tactics });
                    let steps = 0;
                    while (!game.isOver() && steps++ < 3000) {
                        const seat = game.actor();
                        const command = chooseCpuCommand(game, seat, PROFILES[level]);
                        expect(game.applyCommand(seat, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
                    }
                    expect(game.isOver()).toBe(true);
                }
            });
        });
    });

    it('同じシードなら同じ手を選び、ゲームの乱数を使わない', () => {
        const a = makeGame(7, true);
        const b = makeGame(7, true);
        const before = snapshot(a);
        expect(chooseCpuCommand(a)).toEqual(chooseCpuCommand(b));
        expect(snapshot(a)).toBe(before);
        expect(a.random()).toBe(b.random());
    });

    it('相手の手札と山札の並びをのぞかない', () => {
        const game = makeGame(3);
        setup(game, { hands: [['r7', 'r8', 'o2', 'g5', 'b1', 'p9'], ['y1', 'y2', 'y3', 'y4', 'y5', 'y6']], sides: { 0: [['r9'], ['o9']] } });
        const first = chooseCpuCommand(game, 0, PROFILES.strong);
        // 見えないところを入れ替えても、同じ手を選ぶ
        const hidden = [...game.players[1].hand, ...game.deck];
        game.players[1].hand = hidden.slice(-6);
        game.deck = hidden.slice(0, -6).reverse();
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual(first);
    });

    it('主張できる石があれば主張し、なければ引いて番を終える', () => {
        const game = makeGame();
        setup(game, { sides: { 4: [['r7', 'r8', 'r9'], ['o1', 'y2', 'g4']] }, phase: 'claim' });
        expect(chooseCpuCommand(game, 0)).toEqual({ type: 'claim', stone: 4 });
        game.applyCommand(0, { type: 'claim', stone: 4 });
        expect(chooseCpuCommand(game, 0).type).toBe('end');
    });

    it('同色の連番になるところに出す', () => {
        const game = makeGame();
        setup(game, { hands: [['r9', 'o1', 'y2', 'g3', 'b4', 'p6'], []], sides: { 5: [['r7', 'r8'], ['o5']] } });
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual({ type: 'play', card: card('r9'), stone: 5 });
    });

    it('強さの順に勝ちやすい（席を入れ替えて60試合）', () => {
        const r = runMatches({ games: 60, a: 'normal', b: 'easy' });
        expect(r.stuck).toBe(0);
        expect(r.wins[0]).toBeGreaterThan(r.wins[1]);
    });
});
