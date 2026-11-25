import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, isCpuTurn, placementScore, CPU_STYLES } from '../public/js/cpu-player.js';
import { PATCHES } from '../public/js/patches.js';
import { snapshot, quiltFrom } from './helpers.js';

const CPUS = () => [{ name: 'C1', isCPU: true }, { name: 'C2', isCPU: true }];

describe('CPU', () => {
    for (const style of ['easy', 'normal']) {
        it(`${style}：CPU だけの試合が最後まで進み、記録から再現できる`, () => {
            for (let seed = 1; seed <= 25; seed++) {
                const game = new Game(CPUS(), { seed: seed * 31 });
                let steps = 0;
                while (isCpuTurn(game)) {
                    expect(runCpuStep(game, CPU_STYLES[style])).toBe(true);
                    expect(++steps).toBeLessThan(400);
                }
                expect(game.isOver).toBe(true);
                const replayed = Game.replay(CPUS(), { seed: game.seed }, game.commands);
                expect(snapshot(replayed)).toBe(snapshot(game));
            }
        });
    }

    it('同じ状態なら同じ手を選ぶ', () => {
        const a = new Game(CPUS(), { seed: 5 });
        const b = new Game(CPUS(), { seed: 5 });
        for (let i = 0; i < 20 && !a.isOver; i++) {
            const m = chooseCommand(a);
            expect(chooseCommand(b)).toEqual(m);
            a.applyCommand(a.current, m);
            b.applyCommand(b.current, m);
        }
    });

    it('ゲームの乱数を使わない（考えさせても、その後の展開が変わらない）', () => {
        const a = new Game(CPUS(), { seed: 9 });
        const b = new Game(CPUS(), { seed: 9 });
        while (!a.isOver) {
            chooseCommand(a);
            chooseCommand(a);
            const m = chooseCommand(b);
            a.applyCommand(a.current, m);
            b.applyCommand(b.current, m);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('革のパッチは、まわりの空きが少ないマス（穴）を先に埋める', () => {
        const game = new Game(CPUS(), { seed: 3 });
        const seat = game.current;
        game.players[seat].quilt = quiltFrom(['###', '#.#', '###']);
        game.pendingLeather = { seat, count: 1 };
        expect(chooseCommand(game, seat)).toEqual({ type: 'leather', x: 1, y: 1 });
    });

    it('縁に沿う置き方を、真ん中に浮かせる置き方より高く見る', () => {
        const quilt = quiltFrom([]);
        const corner = placementScore(quilt, [[0, 0], [1, 0]]);
        const middle = placementScore(quilt, [[4, 4], [5, 4]]);
        expect(corner).toBeGreaterThan(middle);
    });

    it('見落としもぶれもなければ、価値の高いパッチは進むより買う', () => {
        const game = new Game(CPUS(), { seed: 4 });
        const seat = game.current;
        // 5×1（値段7・時間1・収入1）を先頭に
        game.ring = [3, ...game.ring.filter(id => id !== 3)];
        game.players[seat].buttons = 10;
        expect(PATCHES[3].shape).toEqual(['#####']);
        expect(chooseCommand(game, seat, CPU_STYLES.strong).type).toBe('buy');
    });
});
