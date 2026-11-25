import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, makePlan, shortestPath } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { ROUTES, TICKETS } from '../public/js/map.js';
import { players, started, setHand, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const route = (a, b, color) => ROUTES.find(r => ((r.a === a && r.b === b) || (r.a === b && r.b === a)) && (!color || r.color === color)).id;

function playAll(n, seed, level) {
    const game = new Game(players(n, true), { seed, level });
    let steps = 0;
    while (!game.isOver() && steps++ < 3000) {
        if (!runCpuStep(game)) break;
    }
    return game;
}

describe('CPU 同士の対戦', () => {
    it('2〜5人・ふつうとやさしい・いくつかのシードで、必ず最後まで進み、記録から再現できる', () => {
        for (let n = 2; n <= 5; n++) {
            for (const level of ['normal', 'easy']) {
                for (let seed = 1; seed <= 3; seed++) {
                    const game = playAll(n, seed * 13 + n, level);
                    expect(game.isOver()).toBe(true);
                    const saved = game.persist();
                    expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
                }
            }
        }
    });

    it('同じシードなら同じ展開になる（CPU はゲームの乱数を使わない）', () => {
        expect(snapshot(playAll(3, 77, 'normal'))).toBe(snapshot(playAll(3, 77, 'normal')));
    });

    it('ふつうは、やさしいより多く勝つ', () => {
        const r = runMatches({ games: 100, count: 2, level: 'mixed' });
        expect(r.stuck).toBe(0);
        expect(r.byLevel.normal.wins).toBeGreaterThan(r.byLevel.easy.wins);
    });
});

describe('CPU の判断', () => {
    it('一番短い道は、ほかの人の路線を通らず、自分の路線は0両と見る', () => {
        const game = started(2, 1);
        const view = createGameView(game, 0);
        const me = view.players[0];
        expect(shortestPath(view, me, 'denver', 'elpaso').cost).toBe(4);   // デンバー–サンタフェ–エルパソ
        view.claimed[route('denver', 'santafe')] = 1;
        expect(shortestPath(view, me, 'denver', 'elpaso').cost).toBeGreaterThan(4);
        view.claimed[route('denver', 'santafe')] = 0;
        me.routes = [route('denver', 'santafe')];
        expect(shortestPath(view, me, 'denver', 'elpaso').cost).toBe(2);
    });

    it('目的地の道に要る路線を払えるなら、それを引く', () => {
        const game = started(2, 2);
        const p = game.players[0];
        p.tickets = [TICKETS.findIndex(t => t.a === 'denver' && t.b === 'elpaso')];
        setHand(p, { red: 2 });
        const command = chooseCommand(createGameView(game, 0), 'normal', () => 0.5);
        expect(command.type).toBe('claim');
        expect([route('denver', 'santafe'), route('elpaso', 'santafe')]).toContain(command.route);
        const plan = makePlan(createGameView(game, 0), createGameView(game, 0).players[0], p.tickets);
        expect(plan.cost).toBe(4);
    });

    it('はじめの目的地は2枚以上残す', () => {
        const game = new Game(players(2, true), { seed: 3 });
        const command = chooseCommand(createGameView(game, 0), 'normal', () => 0.5);
        expect(command.type).toBe('keep');
        expect(command.tickets.length).toBeGreaterThanOrEqual(2);
    });
});
