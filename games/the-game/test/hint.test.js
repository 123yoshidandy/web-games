import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, chooseMove, runCpuStep } from '../public/js/cpu.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 }));

describe('ヒント（suggest）', () => {
    it('番の人には、つよい CPU と同じ手をすすめ、その手が通る（最後まで）', () => {
        const game = new Game(players(3), { seed: 4 });
        for (let i = 0; i < 2000 && !game.isOver; i++) {
            if (game.current === 0 && !game.players.some(p => p.isCPU && runCpuStepWouldSignal(game))) {
                const command = suggest(game, 0);
                expect(command).toEqual(chooseMove(game, 0, 'strong'));
                expect(game.applyCommand(0, command)).toBe(true);
            } else {
                expect(runCpuStep(game)).toBe(true);
            }
        }
        expect(game.isOver).toBe(true);
    });

    it('番でない人と、終わったゲームでは null', () => {
        const game = new Game(players(3), { seed: 4 });
        expect(suggest(game, 1)).toBe(null);
        game.phase = 'end';
        expect(suggest(game, 0)).toBe(null);
    });

    it('決まった枚数を出したら、出さずに番を終える手もすすめる', () => {
        const game = new Game(players(3), { seed: 4 });
        let ended = false;
        for (let i = 0; i < 20 && game.current === 0; i++) {
            const command = suggest(game, 0);
            if (command.type === 'end') {
                expect(game.played).toBeGreaterThanOrEqual(2);
                ended = true;
            }
            game.applyCommand(0, command);
        }
        expect(ended).toBe(true);
    });
});

// 人の番でも、CPU の仲間が合図を置き直すことがある（runCpuStep はそれを先にする）
function runCpuStepWouldSignal(game) {
    const copy = Game.replay(game.players.map(p => ({ ...p })), { seed: game.seed }, game.commands);
    const before = copy.commands.length;
    if (!runCpuStep(copy)) return false;
    return copy.commands[before]?.command.type === 'signal';
}
