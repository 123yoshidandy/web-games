import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, suggest } from '../public/js/cpu-player.js';
import { players, setup, clearBoard, C } from './helpers.js';

describe('CPU', () => {
    it.each([2, 3, 4, 5, 6])('%i人の CPU だけの試合が、家族向けでも上級でも最後まで進む', (n) => {
        ['family', 'experienced'].forEach((mode, k) => {
            const game = new Game(players(n, true), { seed: 40 + n + k, mode, level: 'heroic' });
            let steps = 0;
            while (!game.isOver() && steps++ < 6000) expect(runCpuStep(game)).toBe(true);
            expect(game.isOver()).toBe(true);
        });
    });

    it('見つけた要救助者を運び、外へ出す', () => {
        const game = setup(new Game(players(2), { seed: 5 }), [C(3, 0), C(0, 9)]);
        clearBoard(game);
        game.pois.push({ id: 80, cell: C(3, 2), revealed: true, victim: true, treated: false });
        game.players[0].ap = 8; // 行き2AP・帰り4AP
        const seen = [];
        for (let i = 0; i < 8 && game.current === 0; i++) {
            const command = suggest(game, 0);
            seen.push(command.type);
            game.applyCommand(0, command);
            if (game.rescued) break;
        }
        expect(seen).toContain('carry');
        expect(game.rescued).toBe(1);
    });

    it('火のとなりの煙（必ず火に移るマス）で手番を終えない', () => {
        const game = setup(new Game(players(2), { seed: 6 }), [C(3, 0), C(0, 9)]);
        clearBoard(game);
        game.pois.push({ id: 81, cell: C(6, 8), revealed: false, victim: true, treated: false });
        game.fire[C(3, 1)] = 2;
        game.fire[C(3, 2)] = 2;
        for (let i = 0; i < 10 && game.current === 0; i++) game.applyCommand(0, suggest(game, 0));
        const cell = game.players[0].cell;
        expect(game.fire[cell] === 2 || (game.fire[cell] === 1 && [C(3, 1), C(3, 2)].some(c => game.fire[c] === 2))).toBe(false);
    });

    it('CPU の判断はゲームの乱数を使わない', () => {
        const game = setup(new Game(players(3, true), { seed: 8, mode: 'experienced' }));
        const before = game.random();
        const again = setup(new Game(players(3, true), { seed: 8, mode: 'experienced' }));
        suggest(again, again.current);
        expect(again.random()).toBe(before);
    });
});
