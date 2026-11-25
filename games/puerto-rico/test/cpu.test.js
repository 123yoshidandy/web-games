import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, runCpuStep, isCpuToAct, arrangeColonists, LEVELS } from '../public/js/cpu-player.js';
import { newGame, setCity, setIsland } from './helpers.js';

const cpus = n => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true }));

function playOut(game, levelOf) {
    let rejected = 0;
    const apply = game.applyCommand.bind(game);
    game.applyCommand = (seat, command) => {
        const result = apply(seat, command);
        if (!result) rejected++;
        return result;
    };
    let steps = 0;
    while (!game.isOver()) {
        if (!isCpuToAct(game) || ++steps > 5000) throw new Error('止まった');
        expect(runCpuStep(game, levelOf)).toBe(true);
    }
    return rejected;
}

describe('CPU', () => {
    it('3〜5 人で、CPU だけで最後まで進み、手を断られない', () => {
        for (const n of [3, 4, 5]) {
            for (const seed of [1, 2]) {
                const game = new Game(cpus(n), { seed });
                expect(playOut(game, s => (s % 2 ? 'easy' : 'normal'))).toBe(0);
                expect(game.scores.length).toBe(n);
            }
        }
    });

    it('ビューだけを見て選ぶ（同じビューなら同じ手）', () => {
        const game = newGame(3);
        const view = createGameView(game, game.decision.seat);
        expect(JSON.stringify(chooseCommand(view, LEVELS.normal))).toBe(JSON.stringify(chooseCommand(structuredClone(view), LEVELS.normal)));
    });

    it('入植者は、生産の組（農園と建物）を先に埋める', () => {
        const game = newGame(3);
        setIsland(game, 0, [['coffee', false], ['corn', false], ['indigo', false]]);
        setCity(game, 0, [['coffeeRoaster', 0], ['smallMarket', 0]]);
        const command = arrangeColonists(game.players[0], 2);
        expect(command.island).toEqual([true, false, false]);
        expect(command.city).toEqual([1, 0]);
    });

    it('ふつうは無作為に選ぶ相手に大きく勝ち越す', () => {
        let wins = 0;
        for (let seed = 0; seed < 12; seed++) {
            const game = new Game(cpus(3), { seed });
            const me = seed % 3;
            playOut(game, s => (s === me ? 'normal' : 'random'));
            if (game.winners.includes(me)) wins++;
        }
        expect(wins).toBeGreaterThanOrEqual(10);
    });
});
