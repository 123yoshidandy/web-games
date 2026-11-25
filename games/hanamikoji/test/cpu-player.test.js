import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, isCpuTurn, PROFILES, candidateActions } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, makeGame, setup, snapshot } from './helpers.js';

describe('CPU', () => {
    it('CPU だけの試合が、どの強さでも必ず終わる。選んだ手は必ず通る', () => {
        ['easy', 'normal', 'strong', 'random'].forEach(level => {
            for (let seed = 1; seed <= 40; seed++) {
                const game = new Game(players(true), { seed });
                let steps = 0;
                while (!game.isOver() && steps++ < 500) {
                    const seat = game.actor();
                    const command = chooseCpuCommand(game, seat, PROFILES[level]);
                    expect(game.applyCommand(seat, command)).toBe(true);
                }
                expect(game.isOver()).toBe(true);
            }
        });
    });

    it('同じシードなら同じ手を選び、ゲームの乱数を使わない', () => {
        const a = makeGame(7);
        const b = makeGame(7);
        const before = snapshot(a);
        expect(chooseCpuCommand(a)).toEqual(chooseCpuCommand(b));
        expect(snapshot(a)).toBe(before);
        expect(a.random()).toBe(b.random());
    });

    it('相手の手札・秘密・山札・除いたカードをのぞかない', () => {
        const game = makeGame(3);
        setup(game, { hands: [[0, 2, 4, 5, 6, 6, 3], [1, 1, 2, 3, 4, 5]], deck: [0, 3, 4, 5, 6, 6, 6] });
        game.removed = 1;
        const first = chooseCpuCommand(game, 0, PROFILES.strong);
        // 見えないところの並びを変えても、同じ手を選ぶ
        setup(game, { hands: [[0, 2, 4, 5, 6, 6, 3], [6, 6, 6, 5, 5, 4]], deck: [0, 1, 1, 2, 3, 3, 4] });
        game.removed = 5;
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual(first);
    });

    it('贈り物と競争から選ぶ側に回っても、選んで進める', () => {
        const game = makeGame(2);
        setup(game, { hands: [[0, 1, 2, 3, 4, 5, 6], [0]], deck: [6] });
        game.players[1].isCPU = true;
        expect(game.applyCommand(0, { type: 'gift', cards: [6, 0, 1] })).toBe(true);
        expect(isCpuTurn(game)).toBe(true);
        // 桜（5点）がいちばん欲しいはず
        const view = createGameView(game, 1);
        const best = candidateActions(view, 1).sort((x, y) => y.score - x.score)[0];
        expect(best.command).toEqual({ type: 'pick', index: 2 });
        expect(runCpuStep(game, 1, PROFILES.strong)).toBe(true);
        expect(game.players[1].placed[6]).toBe(1);
    });

    it('強さの順に勝ちやすい（席を入れ替えて100試合ずつ）', () => {
        const normalVsEasy = runMatches({ games: 100, a: 'normal', b: 'easy' });
        const easyVsRandom = runMatches({ games: 100, a: 'easy', b: 'random' });
        expect(normalVsEasy.stuck + easyVsRandom.stuck).toBe(0);
        expect(normalVsEasy.wins[0]).toBeGreaterThan(normalVsEasy.wins[1]);
        expect(easyVsRandom.wins[0]).toBeGreaterThan(easyVsRandom.wins[1]);
    });
});
