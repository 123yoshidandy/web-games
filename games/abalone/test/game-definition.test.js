import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';

const snapshot = (game) => JSON.stringify({ state: game.state, commands: game.commands });

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (settings) => definition.create({ players: [{ name: 'A' }, { name: 'B', isCPU: true }], random: createRandom(5), settings });
    const toHuman = (game) => {
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
    };

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        toHuman(game);
        const move = game.legalMoves().find(m => m.cells.length === 3);
        const ctx = ctxFor(game, 0, { ...move, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'move', cells: move.cells, dir: move.dir });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        const restored = definition.restore(saved);
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.level).toBe('normal');
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        toHuman(game);
        const before = snapshot(game);
        [{ type: 'move', cells: [0], dir: 2 }, { type: 'proxy' }, null, 'move', { type: 'move', cells: [1, 2, 3, 4], dir: 0 }, { type: 'move', cells: [60], dir: -1 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('設定で CPU の強さと並べ方を受け取る。全員 CPU なら進む', () => {
        expect(definition.settings.validate({ level: 'easy', layout: 'german' }, { level: 'normal', layout: 'standard' })).toEqual({ level: 'easy', layout: 'german' });
        expect(definition.settings.validate({ level: 'x', layout: 'x' }, { level: 'normal', layout: 'standard' })).toEqual({ level: 'normal', layout: 'standard' });
        const game = create({ level: 'easy', layout: 'belgian' });
        expect(game.level).toBe('easy');
        expect(game.options.layout).toBe('belgian');
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 30) definition.cpu.step(game);
        expect(steps).toBeGreaterThan(20);
        expect(definition.view(game, 0, {}).seat).toBe(0);
        expect(definition.spectatorView(game, {}).moves).toEqual([]);
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
