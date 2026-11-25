import { describe, it, expect } from 'vitest';
import Game, { key } from '../public/js/game.js';
import { chooseCommand, runCpuStep, isCpuTurn, CPU_STYLES } from '../public/js/cpu-player.js';
import { progressOf } from '../public/js/progress.js';
import { snapshot, put, freshTurn } from './helpers.js';

const CPUS = n => Array.from({ length: n }, (_, i) => ({ name: `C${i + 1}`, isCPU: true }));

describe('CPU', () => {
    for (const n of [2, 3, 4]) {
        for (const style of ['easy', 'normal']) {
            it(`${n}人・${style}：CPU だけの試合が最後まで進み、記録から再現できる`, () => {
                for (let seed = 1; seed <= 8; seed++) {
                    const game = new Game(CPUS(n), { seed: seed * 31 });
                    let steps = 0;
                    while (isCpuTurn(game)) {
                        expect(runCpuStep(game, CPU_STYLES[style])).toBe(true);
                        expect(++steps).toBeLessThan(4000);
                    }
                    expect(game.isOver).toBe(true);
                    expect(game.players.some(p => p.emperor)).toBe(true);
                    const replayed = Game.replay(CPUS(n), { seed: game.seed }, game.commands);
                    expect(snapshot(replayed)).toBe(snapshot(game));
                }
            });
        }
    }

    it('同じ状態なら同じ命令。考えさせても、ゲームの乱数は進まない', () => {
        const a = new Game(CPUS(2), { seed: 5 });
        const b = new Game(CPUS(2), { seed: 5 });
        for (let i = 0; i < 80 && !a.isOver; i++) {
            chooseCommand(a);
            const m = chooseCommand(a);
            expect(chooseCommand(b)).toEqual(m);
            a.applyCommand(a.current, m);
            b.applyCommand(b.current, m);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('達成できる目標は、すぐ達成する', () => {
        const game = new Game(CPUS(2), { seed: 3 });
        const seat = game.current;
        game.players[seat].hand = ['D0'];
        game.players[seat].eaten.green = 2;
        expect(chooseCommand(game, seat)).toEqual({ type: 'complete', card: 'D0' });
    });

    it('パンダは、パンダの目標に要る色の竹を食べに行く', () => {
        const game = new Game(CPUS(2), { seed: 3 });
        const seat = game.current;
        put(game, 1, 0, 'green', { bamboo: 2 });
        put(game, -1, 0, 'pink', { bamboo: 2 });
        freshTurn(game, seat);
        game.players[seat].hand = ['D11']; // 桃2本
        // ほかの行動を取れなくして、パンダだけにする
        game.turnState.actions = ['gardener'];
        game.plotDeck = [];
        game.decks = { plot: [], gardener: [], panda: [] };
        const command = chooseCommand(game, seat, CPU_STYLES.strong);
        expect(command).toEqual({ type: 'panda', q: -1, r: 0 });
    });

    it('達成の見込み：パンダは食べた本数、区画は形に合う区画の数', () => {
        const game = new Game(CPUS(2), { seed: 3 });
        game.players[0].eaten = { green: 1, yellow: 0, pink: 0 };
        expect(progressOf(game, 0, 'D0')).toMatchObject({ ratio: 0.5, text: '1/2' });
        put(game, 1, 0, 'green');
        put(game, 1, -1, 'green');
        expect(progressOf(game, 0, 'P0').text).toBe('2/3枚');
        expect(game.tileAt(1, 0)).toBe(game.tiles[key(1, 0)]);
    });
});
