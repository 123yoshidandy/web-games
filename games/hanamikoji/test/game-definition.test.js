import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const card = game.players[0].hand[0];
        const ctx = ctxFor(game, 0, { type: 'secret', card, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'secret', card });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const before = snapshot(game);
        [{ type: 'secret', card: 99 }, { type: 'proxy' }, null, 'gift', { type: 'pick', index: 0 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, 1, { type: 'secret', card: game.players[1].hand[0] });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('贈り物を出すと、相手（CPU）が選ぶ番になって進む', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const hand = game.players[0].hand;
        const ctx = ctxFor(game, 0, { type: 'gift', cards: hand.slice(0, 3) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(definition.cpu.needsStep(game)).toBe(true);
        const progress = definition.cpu.progress(game);
        definition.cpu.step(game);
        expect(definition.cpu.progress(game)).toBe(progress + 1);
        expect(game.phase).not.toBe('choose');
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 2000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0, {}).you).toBe(0);
        expect(definition.spectatorView(game, {}).players.every(p => p.hand === null)).toBe(true);
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
