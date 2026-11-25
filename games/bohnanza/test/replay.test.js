import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, snapshot, totalCards } from './helpers.js';

function checkInvariants(game, total) {
    expect(totalCards(game)).toBe(total);
    game.players.forEach(p => {
        p.fields.forEach(f => { if (f) expect(f.n).toBeGreaterThan(0); });
        const types = p.fields.filter(Boolean).map(f => f.type);
        expect(new Set(types).size).toBe(types.length);
    });
}

function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    const total = totalCards(game);
    let steps = 0;
    while (!game.isOver() && steps++ < 6000) {
        expect(runCpuStep(game)).toBeTruthy();
        checkInvariants(game, total);
    }
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（3〜5人、JSON を通しても）', () => {
        for (const n of [3, 4, 5]) {
            for (const seed of [1, 7]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(4, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('CPU はビューだけで決め、ゲームの状態を変えない', () => {
        const game = new Game(players(4, true), { seed: 11 });
        let steps = 0;
        while (!game.isOver() && steps++ < 6000) {
            const seat = nextCpuSeat(game);
            const before = snapshot(game);
            const view = JSON.parse(JSON.stringify(createGameView(game, seat)));
            const a = chooseCommand(view, 'normal');
            expect(chooseCommand(view, 'normal')).toEqual(a);
            expect(snapshot(game)).toBe(before);
            runCpuStep(game);
        }
        expect(game.isOver()).toBe(true);
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、カードの枚数を保って再現できる', () => {
        let r = 777;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % k; };
        const idx = () => Array.from({ length: rand(3) }, () => rand(7) - 1);
        const randomCommand = (n) => {
            switch (rand(9)) {
                case 0: return { type: 'plant', field: rand(4) - 1 };
                case 1: return { type: 'next' };
                case 2: return { type: 'offer', to: rand(n + 1), give: { faceUp: idx(), hand: idx() }, want: { faceUp: idx(), types: rand(2) ? { soy: rand(3) } : { red: 1, moon: 1 } } };
                case 3: return { type: 'respond', accept: !!rand(2), hand: idx() };
                case 4: return { type: 'pass' };
                case 5: return { type: 'endTrade' };
                case 6: return { type: 'plantPending', index: rand(3) - 1, field: rand(4) - 1 };
                case 7: return { type: 'harvest', field: rand(4) - 1 };
                default: return rand(2) ? { type: 'buyField' } : null;
            }
        };
        for (const n of [3, 4, 5]) {
            const game = new Game(players(n, true), { seed: n * 13 });
            const total = totalCards(game);
            let accepted = 0;
            for (let i = 0; i < 20000 && !game.isOver(); i++) {
                const before = snapshot(game);
                if (game.applyCommand(rand(n), randomCommand(n))) accepted++;
                else expect(snapshot(game)).toBe(before);
                checkInvariants(game, total);
                if (rand(3) === 0) runCpuStep(game);
            }
            expect(accepted).toBeGreaterThan(10);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
