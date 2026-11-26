import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';

const snapshot = (game) => JSON.stringify({ factories: game.factories, center: game.center, players: game.players, commands: game.commands });

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (settings) => definition.create({ players: [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }], random: createRandom(5), settings });
    const toHuman = (game) => {
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
    };

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        toHuman(game);
        const move = game.getLegalMoves(0)[0];
        const ctx = ctxFor(game, 0, { ...move, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'take', source: move.source, color: move.color, line: move.line });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        const restored = definition.restore(saved);
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.level).toBe('normal');
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        toHuman(game);
        const before = snapshot(game);
        [{ type: 'take', source: 99, color: 0, line: 0 }, { type: 'proxy' }, null, 'take', { type: 'take', source: 'center', color: 9, line: 0 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, 1, game.getLegalMoves(0)[0]);
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('設定で CPU の強さを受け取る。全員 CPU なら最後まで進む', () => {
        expect(definition.settings.validate({ level: 'easy' }, { level: 'normal' })).toEqual({ level: 'easy' });
        expect(definition.settings.validate({ level: 'x' }, { level: 'normal' })).toEqual({ level: 'normal' });
        const game = create({ level: 'easy' });
        expect(game.level).toBe('easy');
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 500) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0).viewer).toBe(0);
        expect(definition.spectatorView(game).viewer).toBe(null);
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
