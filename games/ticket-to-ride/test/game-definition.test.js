import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { DECK_SLOT } from '../public/js/game.js';
import { snapshot } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        [0, 1, 2].forEach(seat => definition.actions.command(ctxFor(game, seat, { type: 'keep', tickets: [...game.players[seat].offered] })));
        const ctx = ctxFor(game, 0, { type: 'draw', slot: DECK_SLOT, extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'slot']);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'draw', slot: DECK_SLOT }, { type: 'keep', tickets: [] }, { type: 'claim', route: 0, color: 'red', locos: 0 }, { type: 'proxy' }, null, 'end'].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ビューは、ほかの人の手札と目的地を隠す。見ている人には誰の手札も見せない', () => {
        const game = create();
        const view = definition.view(game, 1, {});
        expect(view.players[1].hand).not.toBe(null);
        expect(view.players[1].offered.length).toBe(3);
        [0, 2].forEach(i => {
            expect(view.players[i].hand).toBe(null);
            expect(view.players[i].tickets).toBe(null);
            expect(view.players[i].offered).toBe(null);
        });
        const spectator = definition.spectatorView(game, {});
        expect(spectator.players.every(p => p.hand === null && p.tickets === null)).toBe(true);
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
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
