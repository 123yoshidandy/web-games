import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, chooseCommand, runCpuStep } from '../public/js/cpu.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

describe('ヒント（suggest）', () => {
    it('番の人には CPU と同じ手をすすめ、その手が通る（最後まで）', () => {
        const game = new Game(players(3), { seed: 4, mission: 3 });
        for (let i = 0; i < 300 && !game.isOver; i++) {
            const seat = game.current;
            const command = suggest(game, seat);
            expect(command).toEqual(chooseCommand(game, seat, 'normal'));
            if (!game.applyCommand(seat, command)) {
                game.players[seat].isCPU = true;
                runCpuStep(game);
                game.players[seat].isCPU = false;
            }
        }
        expect(game.isOver).toBe(true);
    });

    it('番でない人と、終わったゲームでは null', () => {
        const game = new Game(players(3), { seed: 4 });
        expect(suggest(game, (game.current + 1) % 3)).toBe(null);
        game.phase = 'end';
        expect(suggest(game, 0)).toBe(null);
    });

    it('2人のとき、JARVIS の番は指揮官にすすめる', () => {
        const game = new Game(players(2), { seed: 9 });
        for (let i = 0; i < 200 && !game.isOver; i++) {
            const seat = game.current;
            if (game.phase === 'play' && game.players[game.turnSeat()].jarvis) {
                expect(seat).toBe(game.commander);
                expect(suggest(game, seat)?.type).toBe('play');
                return;
            }
            game.players.forEach(p => { p.isCPU = true; });
            runCpuStep(game);
        }
    });
});
