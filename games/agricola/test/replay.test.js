import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { fits, fenceCount, CELLS } from '../public/js/farm.js';
import { players, snapshot } from './helpers.js';

function checkInvariants(game) {
    game.players.forEach(p => {
        expect(p.food).toBeGreaterThanOrEqual(0);
        Object.values(p.res).forEach(k => expect(k).toBeGreaterThanOrEqual(0));
        Object.values(p.animals).forEach(k => expect(k).toBeGreaterThanOrEqual(0));
        if (game.pending?.seat !== p.id) expect(fits(p.farm, p.animals)).toBe(true);
        expect(fenceCount(p.farm)).toBeLessThanOrEqual(15);
        expect(p.farm.stables.length).toBeLessThanOrEqual(4);
        expect(p.members).toBeLessThanOrEqual(5);
        // 1つのマスは1つの使い方だけ
        const used = [...p.farm.rooms, ...p.farm.fields.map(f => f.cell)];
        expect(new Set(used).size).toBe(used.length);
        p.farm.pastures.flat().forEach(c => expect(used).not.toContain(c));
    });
}

function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 3000) {
        expect(runCpuStep(game)).toBeTruthy();
        checkInvariants(game);
    }
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（1〜4人、JSON を通しても）', () => {
        for (const n of [1, 2, 3, 4]) {
            for (const seed of [1, 7]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(3, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('CPU はビューだけで決め、ゲームの状態を変えない', () => {
        const game = new Game(players(3, true), { seed: 11 });
        while (!game.isOver()) {
            const seat = nextCpuSeat(game);
            const before = snapshot(game);
            const view = JSON.parse(JSON.stringify(createGameView(game, seat)));
            const a = chooseCommand(view, 'normal');
            expect(chooseCommand(view, 'normal')).toEqual(a);
            expect(snapshot(game)).toBe(before);
            runCpuStep(game);
        }
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、最後まで再現できる', () => {
        let r = 4242;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % k; };
        const cells = () => Array.from({ length: rand(3) }, () => rand(CELLS + 1));
        const randomCommand = (game) => {
            const spaces = game.spaces;
            switch (rand(6)) {
                case 0: return { type: 'act', space: spaces[rand(spaces.length)], rooms: cells(), stables: cells(), cell: rand(16), res: ['wood', 'clay', 'grain'][rand(3)] };
                case 1: return { type: 'act', space: spaces[rand(spaces.length)], sow: cells().map(cell => ({ cell, crop: ['grain', 'veg', 'x'][rand(3)] })), bake: rand(3) };
                case 2: return { type: 'act', space: spaces[rand(spaces.length)], pastures: [cells()], major: ['fireplace2', 'well', 'clayOven', null][rand(4)] };
                case 3: return { type: 'keep', animals: { sheep: rand(4), boar: rand(2), cattle: rand(2) } };
                case 4: return { type: 'feed', convert: { grain: rand(3), sheep: rand(2) }, crafts: rand(3) ? [] : ['joinery'] };
                default: return rand(2) ? { type: 'act', space: 'nothing' } : null;
            }
        };
        for (const n of [2, 3]) {
            const game = new Game(players(n, true), { seed: n * 17 });
            let accepted = 0;
            for (let i = 0; i < 20000 && !game.isOver(); i++) {
                const before = snapshot(game);
                if (game.applyCommand(rand(n), randomCommand(game))) accepted++;
                else expect(snapshot(game)).toBe(before);
                checkInvariants(game);
                if (rand(3) === 0) runCpuStep(game);
            }
            expect(accepted).toBeGreaterThan(10);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
