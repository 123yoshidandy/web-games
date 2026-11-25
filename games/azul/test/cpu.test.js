import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseMove, runCpuStep, isCpuTurn, CPU_STYLES } from '../public/js/cpu-player.js';
import { snapshot } from './helpers.js';

const CPUS = n => Array.from({ length: n }, (_, i) => ({ name: `C${i + 1}`, isCPU: true }));

describe('CPU', () => {
    for (const n of [2, 3, 4]) {
        for (const style of ['easy', 'normal']) {
            it(`${n}人・${style}：CPU だけの試合が最後まで進み、記録から再現できる`, () => {
                for (let seed = 1; seed <= 20; seed++) {
                    const game = new Game(CPUS(n), { seed: seed * 31 });
                    let steps = 0;
                    while (isCpuTurn(game)) {
                        expect(runCpuStep(game, CPU_STYLES[style])).toBe(true);
                        expect(++steps).toBeLessThan(500);
                    }
                    expect(game.isOver).toBe(true);
                    const replayed = Game.replay(CPUS(n), { seed: game.seed }, game.commands);
                    expect(snapshot(replayed)).toBe(snapshot(game));
                }
            });
        }
    }

    it('同じ状態なら同じ手を選ぶ', () => {
        const a = new Game(CPUS(3), { seed: 5 });
        const b = new Game(CPUS(3), { seed: 5 });
        for (let i = 0; i < 10; i++) {
            const m = chooseMove(a);
            expect(chooseMove(b)).toEqual(m);
            a.applyCommand(a.current, m);
            b.applyCommand(b.current, m);
        }
    });

    it('ゲームの乱数を使わない（考えさせても、その後の展開が変わらない）', () => {
        const a = new Game(CPUS(2), { seed: 9 });
        const b = new Game(CPUS(2), { seed: 9 });
        while (!a.isOver) {
            // a でだけ、何度も考えさせる
            for (let i = 0; i < 3; i++) chooseMove(a);
            const m = chooseMove(b);
            a.applyCommand(a.current, m);
            b.applyCommand(b.current, m);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('見落としもぶれもなければ、段を埋める手を床に捨てる手より選ぶ', () => {
        const game = new Game(CPUS(2), { seed: 3 });
        const seat = game.current;
        game.factories = game.factories.map(() => [4, 4, 4, 4].map(() => 1));
        game.factories[0] = [2, 2, 2, 3];
        game.players[seat].lines[3] = { color: 3, count: 1 };
        game.players[seat].lines[4] = { color: 3, count: 1 };
        const move = chooseMove(game, seat, CPU_STYLES.strong);
        // 赤3枚は3段目にちょうど入る。黄4枚は1〜3段目に置くとあふれる（4・5段目は黒で塞がっている）
        expect(move).toEqual({ type: 'take', source: 0, color: 2, line: 2 });
    });

    it('置ける段があるのに、わざわざ床に置かない', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const game = new Game(CPUS(2), { seed });
            const move = chooseMove(game, game.current, CPU_STYLES.normal);
            expect(move.line).not.toBe('floor');
        }
    });
});
