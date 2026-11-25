import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { legalMoves } from '../public/js/cpu-player.js';
import { snapshot, newGame } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (n = 3, options) => definition.create({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i === n - 1 })), random: createRandom(5), options });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const move = legalMoves(definition.view(game, game.current))[0];
        const ctx = ctxFor(game, game.current, { type: 'place', tile: move.tile, cells: move.cells, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'place', tile: move.tile, cells: move.cells });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'swap' }, { type: 'proxy' }, null, 'place', { type: 'place', tile: ['red'], cells: [0, 1] }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = (game.current + 1) % 3;
        const move = legalMoves({ ...definition.view(game, other), you: other })[0];
        const ctx = ctxFor(game, other, { type: 'place', tile: move?.tile ?? ['red', 'red'], cells: move?.cells ?? [0, 1] });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('4人の組み合わせ戦も作れる', () => {
        expect(create(4, { mode: 'team' }).mode).toBe('team');
        expect(create(4).mode).toBe('standard');
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 400) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winners).toEqual(game.winners);
    });

    it('対戦中に部屋を出た人の席は CPU が続ける', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});

describe('ビューで手札と袋を隠す', () => {
    it('ほかの人の手札・袋の並び・シードは入らない', () => {
        const game = newGame(3);
        const view = definition.view(game, 1);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        [0, 2].forEach(s => {
            expect(view.players[s].hand).toBe(null);
            expect(view.players[s].handCount).toBe(6);
        });
        expect(view.bagCount).toBe(game.bag.length);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"bag"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(definition.spectatorView(game).players.every(p => p.hand === null)).toBe(true);
    });

    it('取り替えた手札は、本人にだけ見える', () => {
        const game = newGame(2);
        game.players.forEach(p => { p.placed = 1; });
        game.sides[0].scores.red = 0;
        ['green', 'blue', 'orange', 'yellow', 'purple'].forEach(c => { game.sides[0].scores[c] = 5; });
        // 赤のない手札にして、取り替えの場面を作る
        const noRed = game.bag.filter(t => !t.includes('red')).slice(0, 6);
        game.bag = game.bag.filter(t => !noRed.includes(t)).concat(game.players[0].hand);
        game.players[0].hand = noRed;
        const move = legalMoves(definition.view(game, 0))[0];
        game.applyCommand(0, { type: 'place', tile: move.tile, cells: move.cells });
        expect(game.phase).toBe('swap');
        expect(definition.view(game, 0).canSwap).toBe(true);
        expect(definition.view(game, 1).canSwap).toBe(false);
        game.applyCommand(0, { type: 'swap' });
        expect(JSON.stringify(definition.view(game, 1).events)).not.toContain('hand');
        expect(definition.view(game, 1).players[0].hand).toBe(null);
    });
});
