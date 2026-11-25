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
    const create = (settings) => definition.create({
        players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }, { name: 'D', isCPU: true }],
        random: createRandom(5), settings
    });

    it('東風戦と半荘戦を選べる', () => {
        expect(create().options.length).toBe('east');
        expect(create({ length: 'south' }).options.length).toBe('south');
    });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const seat = game.actors()[0];
        const tile = game.optionsFor(seat).discards[0];
        const ctx = ctxFor(game, seat, { type: 'discard', tile, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'discard', tile });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('手番でない人の操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const before = snapshot(game);
        const seat = game.actors()[0];
        const other = (seat + 1) % 4;
        [[other, { type: 'discard', tile: game.h.hands[other][0] }], [seat, { type: 'proxy' }], [seat, null], [seat, 'tsumo']].forEach(([s, command]) => {
            const ctx = ctxFor(game, s, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ほかの人の手牌は送らない', () => {
        const game = create();
        const view = definition.view(game, 0, {});
        expect(view.players[0].hand.length).toBeGreaterThanOrEqual(13);
        expect(view.players.slice(1).every(p => p.hand === null)).toBe(true);
        expect(definition.spectatorView(game, {}).players.every(p => p.hand === null)).toBe(true);
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 40000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
    });

    it('対局中に部屋を出た人の席は CPU が続ける', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});
