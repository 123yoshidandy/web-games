import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { buildTargets, tileTargets } from '../public/js/rules.js';
import { players, snapshot, houseTotals } from './helpers.js';

function checkInvariants(game) {
    houseTotals(game).forEach(total => expect(total).toBe(40));
    game.players.forEach(p => {
        // 持っているタイルの場所には、いつも自分の家が隣接している。1つの場所から2枚は持たない
        const locs = p.tiles.map(t => t.loc);
        expect(new Set(locs).size).toBe(locs.length);
    });
    const taken = game.players.reduce((sum, p) => sum + p.tiles.length, 0);
    const left = game.locations.reduce((sum, l) => sum + l.tiles, 0);
    expect(taken + left).toBeLessThanOrEqual(game.locations.length * 2);
    game.owner.forEach((o, cell) => { if (o >= 0) expect('GFTCDW').toContain(game.terrain[cell]); });
    expect(game.deck.length + game.discard.length + game.removed.length + game.players.filter(p => p.card).length).toBe(25);
}

export function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 3000) {
        expect(runCpuStep(game)).toBe(true);
        checkInvariants(game);
    }
    return game;
}

describe('CPU どうしの試合と記録からの再現', () => {
    it('2〜4人・いろいろなシードで、CPU どうしの試合が最後まで進み、記録から同じ状態を作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 4]) {
            for (const seed of [1, 2, 3, 7, 11]) {
                const game = playOut(n, seed, seed % 2 ? ['normal', 'easy'] : ['easy', 'normal']);
                expect(game.isOver()).toBe(true);
                expect(game.players.some(p => p.supply === 0)).toBe(true);
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

    it('場所タイルが全種類、実際に使われる', () => {
        const used = new Set();
        for (let seed = 1; seed <= 30 && used.size < 8; seed++) {
            const game = playOut(3, seed, ['normal']);
            game.commands.forEach(({ command }) => { if (command.type === 'tile') used.add(command.tile); });
        }
        expect([...used].sort()).toEqual(['barn', 'farm', 'harbor', 'oasis', 'oracle', 'paddock', 'tavern', 'tower']);
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、数が保たれ、記録から再現できる', () => {
        let r = 777;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % k; };
        const tiles = ['oracle', 'farm', 'oasis', 'tower', 'tavern', 'barn', 'harbor', 'paddock', 'nope'];
        const randomCommand = (game) => {
            const near = () => (rand(3) ? rand(400) : rand(402) - 1);
            switch (rand(5)) {
                case 0: case 1: {
                    // 半分は建てられるマスから選ぶ（受け付ける側も通す）
                    const ok = buildTargets(game, game.active);
                    return { type: 'build', cell: ok.length && rand(2) ? ok[rand(ok.length)] : near() };
                }
                case 2: {
                    const mine = game.owner.map((o, i) => (o === game.active ? i : -1)).filter(i => i >= 0);
                    const from = mine.length ? mine[rand(mine.length)] : near();
                    const tile = tiles[rand(tiles.length)];
                    const ok = tile === 'nope' ? [] : tileTargets(game, game.active, tile, from);
                    return { type: 'tile', tile, from: rand(4) ? from : undefined, cell: ok.length && rand(2) ? ok[rand(ok.length)] : near() };
                }
                case 3: return { type: 'end' };
                default: return rand(2) ? null : { type: 'build', cell: String(rand(400)) };
            }
        };
        for (const n of [2, 3, 4]) {
            const game = new Game(players(n, true), { seed: n * 13 });
            let accepted = 0;
            for (let i = 0; i < 6000 && !game.isOver(); i++) {
                const before = snapshot(game);
                if (game.applyCommand(rand(n + 1), randomCommand(game))) accepted++;
                else expect(snapshot(game)).toBe(before);
                checkInvariants(game);
                if (rand(4) === 0) runCpuStep(game);
            }
            expect(accepted).toBeGreaterThan(10);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
