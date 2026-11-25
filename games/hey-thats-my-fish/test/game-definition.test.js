import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const cell = game.placeable()[0];
        const ctx = ctxFor(game, game.current, { type: 'place', cell, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'place', cell });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'move', penguin: 0, to: 1 }, { type: 'proxy' }, null, 'place', { type: 'place', cell: -1 }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (game.current + 1) % 3, { type: 'place', cell: game.placeable()[0] });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 200) definition.cpu.step(game);
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

describe('ビュー', () => {
    it('シードと CPU の値は入らない。盤とペンギンと取った氷は全員に同じ', () => {
        const game = newGame(3);
        game.applyCommand(0, { type: 'place', cell: game.placeable()[0] });
        const views = [0, 1, 2, null].map(s => definition.view(game, s));
        const json = JSON.stringify(views[0]);
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        views.forEach(v => {
            expect(v.fish).toEqual(game.fish);
            expect(v.penguins).toEqual(game.penguins.map(p => ({ owner: p.owner, cell: p.cell })));
        });
        expect(definition.spectatorView(game).you).toBe(null);
    });

    it('今の番の人ができること（置ける氷・動ける先）が入る', () => {
        const game = newGame(2);
        expect(definition.view(game, 1).placeable).toEqual(game.placeable());
        while (game.phase === 'place') game.applyCommand(game.current, { type: 'place', cell: game.placeable()[0] });
        const view = definition.view(game, 0);
        Object.entries(view.moves).forEach(([i, cells]) => expect(cells).toEqual(game.movesOf(Number(i))));
        expect(Object.keys(view.moves).length).toBeGreaterThan(0);
    });
});
