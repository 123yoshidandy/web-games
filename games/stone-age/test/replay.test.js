import { describe, it, expect } from 'vitest';
import Game, { PLACES } from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, snapshot } from './helpers.js';

function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 3000) {
        expect(runCpuStep(game)).toBeTruthy();
        checkInvariants(game);
    }
    return game;
}

// 置いた人と手元の人の合計が、人の数と合う（置く段階）。資源と食料はマイナスにならない
function checkInvariants(game) {
    game.players.forEach((p, seat) => {
        if (game.phase === 'place') {
            const placed = Object.values(game.placed[seat]).reduce((s, k) => s + k, 0);
            expect(placed + p.available).toBe(p.people);
        }
        expect(p.food).toBeGreaterThanOrEqual(0);
        Object.values(p.res).forEach(k => expect(k).toBeGreaterThanOrEqual(0));
        expect(p.people).toBeLessThanOrEqual(10);
        expect(p.agri).toBeLessThanOrEqual(10);
        expect(p.tools.length).toBeLessThanOrEqual(3);
    });
    expect(game.actors().length).toBeLessThanOrEqual(1);
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 4]) {
            for (const seed of [1, 7, 99]) {
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

    it('CPU はビューだけで決め、ゲームの乱数を使わず、状態を変えない', () => {
        const a = new Game(players(3, true).map((p, i) => ({ ...p, cpuLevel: i ? 'easy' : 'normal' })), { seed: 11 });
        const b = new Game(players(3, true).map((p, i) => ({ ...p, cpuLevel: i ? 'easy' : 'normal' })), { seed: 11 });
        while (!a.isOver()) {
            const seat = nextCpuSeat(a);
            const before = snapshot(a);
            const view = JSON.parse(JSON.stringify(createGameView(a, seat)));
            const first = chooseCommand(view, a.players[seat].cpuLevel);
            for (let k = 0; k < 2; k++) expect(chooseCommand(view, a.players[seat].cpuLevel)).toEqual(first);
            expect(snapshot(a)).toBe(before);
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、最後まで再現できる', () => {
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % k; };
        const amount = () => ({ wood: rand(3), clay: rand(3), stone: rand(2), gold: rand(2) });
        const randomCommand = () => {
            switch (rand(9)) {
                case 0: return { type: 'place', place: PLACES[rand(PLACES.length)], count: rand(7) };
                case 1: return { type: 'resolve', place: rand(5) ? PLACES[rand(PLACES.length)] : 'nowhere' };
                case 2: return { type: 'tools', tools: [rand(4), rand(4)].slice(0, rand(3)), oneUse: rand(4) ? [] : [rand(36)] };
                case 3: return { type: 'pay', pay: rand(6) ? amount() : { wood: -1 } };
                case 4: return { type: 'decline' };
                case 5: return { type: 'pickDie', die: rand(5) - 1 };
                case 6: return { type: 'feed', pay: rand(2) ? null : amount() };
                case 7: return { type: 'choice2', take: amount() };
                default: return rand(2) ? { type: 'bogus' } : null;
            }
        };
        for (const n of [2, 3, 4]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            let accepted = 0;
            for (let i = 0; i < 20000 && !game.isOver(); i++) {
                const before = snapshot(game);
                if (game.applyCommand(rand(n), randomCommand())) accepted++;
                else expect(snapshot(game)).toBe(before);
                checkInvariants(game);
                if (rand(6) === 0) runCpuStep(game);
            }
            expect(accepted).toBeGreaterThan(10);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
