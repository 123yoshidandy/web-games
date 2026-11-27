import { describe, it, expect, vi } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, decide, applyDecision, isCpuTurn, CPU_LEVELS } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, newGame, at, mv } from './helpers.js';

describe('CPU', () => {
    it('強さは やさしい・ふつう・つよい', () => {
        expect(CPU_LEVELS).toEqual(['easy', 'normal', 'strong']);
    });

    // 15路のつよいどうしは長い対局になる（100手を超える）ので、cpu-match で確かめる
    // 遅い端末では、つよいが毎手、時間の上限（2.5秒）まで読んで長くなるので、Date を止めて、ノード数だけで読ませる
    it('CPU どうしで、どの強さも最後まで打ち切る（10路と、15路のやさしい・ふつう）', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            for (const size of [10, 15]) {
                for (const level of size === 15 ? ['easy', 'normal'] : CPU_LEVELS) {
                    const game = new Game(players([true, true], level), { size, seed: 3 });
                    let steps = 0;
                    while (!game.isOver() && steps < size * size + 2) {
                        expect(runCpuStep(game)).toBe(true);
                        steps++;
                    }
                    expect(game.isOver()).toBe(true);
                }
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('人の番では動かない', () => {
        const game = newGame([false, true]);
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(false);
        game.applyCommand(0, mv(at(15, 7, 7)));
        expect(runCpuStep(game)).toBe(true);
        expect(game.current).toBe(0);
    });

    it('手番でないビューでは決めない', () => {
        const game = newGame([false, true]);
        expect(decide(createGameView(game, 1))).toBe(null);
    });

    it('断られた答えのかわりに、空いている点に置く', () => {
        const game = newGame([true, true]);
        game.applyCommand(0, mv(0));
        expect(applyDecision(game, 1, mv(0))).toBe(true);
        expect(game.board[1]).toBe(2);
    });

    // 読みはノード数と時間（ふつう 1.5秒・つよい 2.5秒）の早いほうで打ち切る。遅い端末で時間で打ち切られて結果が変わらないように、
    // Date を止めて、ノード数だけで読ませる（端末の速さによらず、毎回同じ対局になる）
    it('強いほど勝つ（15路で、黒白を入れ替えて）', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            const a = runMatches({ games: 4, a: 'normal', b: 'easy', size: 15 });
            expect(a.stuck).toBe(0);
            expect(a.winsA).toBeGreaterThan(a.winsB);
            const b = runMatches({ games: 4, a: 'strong', b: 'normal', size: 15 });
            expect(b.stuck).toBe(0);
            expect(b.winsA).toBeGreaterThan(b.winsB);
        } finally {
            vi.useRealTimers();
        }
    }, 60000);
});
