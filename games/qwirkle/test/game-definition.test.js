import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot } from './helpers.js';

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
        const seat = game.current;
        const ctx = ctxFor(game, seat, { type: 'play', placements: game.movesFor(seat)[0].placements, extra: 'x' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        const other = (game.current + 1) % 3;
        [{ type: 'pass' }, { type: 'play', placements: [] }, { type: 'nope' }, null].forEach(command => {
            const ctx = ctxFor(game, other, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ビューには自分の手札だけ。袋は枚数だけ', () => {
        const game = create();
        const view = definition.view(game, 1, {});
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        expect(view.players[0].hand).toBe(null);
        expect(view.players[2].hand).toBe(null);
        expect(view.players[0].handCount).toBe(6);
        expect(view.bag).toBeUndefined();
        expect(view.bagCount).toBe(game.bag.length);
        const text = JSON.stringify(view);
        expect(text).not.toContain('"seed"');
        const spectator = definition.spectatorView(game, {});
        expect(spectator.players.every(p => p.hand === null)).toBe(true);
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 600) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
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
