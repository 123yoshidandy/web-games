import { describe, it, expect } from 'vitest';
import Game, { DOMINOES, cellKey, canPlace } from '../public/js/game.js';
import { chooseCommand, runCpuStep, isCpuTurn, evaluatePlacement, CPU_STYLES } from '../public/js/cpu-player.js';
import { snapshot, gridFrom } from './helpers.js';

const CPUS = n => Array.from({ length: n }, (_, i) => ({ name: `C${i + 1}`, isCPU: true }));

describe('CPU', () => {
    for (const n of [2, 3, 4]) {
        for (const style of ['easy', 'normal']) {
            it(`${n}人・${style}：CPU だけの試合が最後まで進み、記録から再現できる`, () => {
                for (let seed = 1; seed <= 12; seed++) {
                    const options = { seed: seed * 31, middleKingdom: seed % 2 === 0, harmony: seed % 3 === 0 };
                    const game = new Game(CPUS(n), options);
                    let steps = 0;
                    while (isCpuTurn(game)) {
                        expect(runCpuStep(game, CPU_STYLES[style])).toBe(true);
                        expect(++steps).toBeLessThan(300);
                    }
                    expect(game.isOver).toBe(true);
                    const replayed = Game.replay(CPUS(n), options, game.commands);
                    expect(snapshot(replayed)).toBe(snapshot(game));
                }
            });
        }
    }

    it('同じ状態なら同じ手を選ぶ', () => {
        const a = new Game(CPUS(3), { seed: 5 });
        const b = new Game(CPUS(3), { seed: 5 });
        for (let i = 0; i < 15; i++) {
            const m = chooseCommand(a);
            expect(chooseCommand(b)).toEqual(m);
            a.applyCommand(a.currentSeat, m);
            b.applyCommand(b.currentSeat, m);
        }
    });

    it('ゲームの乱数を使わない（考えさせても、その後の展開が変わらない）', () => {
        const a = new Game(CPUS(2), { seed: 9 });
        const b = new Game(CPUS(2), { seed: 9 });
        while (!a.isOver) {
            for (let i = 0; i < 2; i++) chooseCommand(a);
            const m = chooseCommand(b);
            a.applyCommand(a.currentSeat, m);
            b.applyCommand(b.currentSeat, m);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('王冠のある領域につなげる置き方を高く見る', () => {
        const grid = gridFrom(['W1 W C']);
        const domino = DOMINOES[1]; // 小麦畑・小麦畑
        const join = evaluatePlacement(grid, domino, { x: -1, y: 1, dir: 0 }); // (-1,1)(0,1)：小麦畑の下に
        const apart = evaluatePlacement(grid, domino, { x: 1, y: 0, dir: 0 }); // 城の右：小麦畑から離れる
        expect(join).toBeGreaterThan(apart);
    });

    it('置ける場所がないときだけ捨てる', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game(CPUS(2), { seed });
            while (!game.isOver) {
                const command = chooseCommand(game);
                if (command.type === 'discard') expect(game.getLegalPlacements()).toEqual([]);
                game.applyCommand(game.currentSeat, command);
            }
        }
    });

    it('中王国のとき、城が真ん中から外れる置き方を避ける', () => {
        const grid = gridFrom(['. . . . .', '. . . . .', '. . C W W', '. . . . .', '. . . . .']);
        grid[cellKey(-1, 0)] = { terrain: 'forest', crowns: 0 };
        const domino = DOMINOES[1];
        // (3,0) から下へ置くと、5×5 には収まるが、城が真ん中から外れる
        expect(canPlace(grid, domino, 3, 0, 1)).toBe(true);
        const off = evaluatePlacement(grid, domino, { x: 3, y: 0, dir: 1 }, { middleKingdom: true });
        const keep = evaluatePlacement(grid, domino, { x: 1, y: 1, dir: 0 }, { middleKingdom: true });
        expect(keep).toBeGreaterThan(off);
    });
});
