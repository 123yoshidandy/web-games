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
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const seat = game.current;
        const target = (seat + 1) % 3;
        const value = game.cards[game.hands[target][0]].rank;
        const ctx = ctxFor(game, seat, { type: 'clue', target, kind: 'rank', value, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'clue', target, kind: 'rank', value });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('手番でない人の操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        const other = (game.current + 1) % 3;
        const ctx = ctxFor(game, other, { type: 'discard', order: game.hands[other][0] });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        const unknown = ctxFor(game, game.current, { type: 'proxy' });
        definition.actions.command(unknown);
        expect(unknown.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('自分のビューには自分の札の中身が入らず、ほかの人の札は見える', () => {
        const game = create();
        const view = definition.view(game, 0);
        expect(view.players[0].hand.every(card => card.color === null && card.rank === null)).toBe(true);
        expect(view.players[1].hand.every(card => card.color !== null && card.rank !== null)).toBe(true);
        expect(JSON.stringify(view)).not.toContain('"deck"');
    });

    it('CPU が手番なら進め、抜けた人の席は CPU が引き継ぐ（切断は待つ）', () => {
        const game = create();
        while (!definition.cpu.needsStep(game)) {
            const seat = game.current;
            definition.actions.command(ctxFor(game, seat, { type: 'discard', order: game.hands[seat][0] }));
            if (game.clues >= 8 && !definition.cpu.needsStep(game)) {
                const target = (seat + 1) % 3;
                definition.actions.command(ctxFor(game, seat, { type: 'clue', target, kind: 'rank', value: game.cards[game.hands[target][0]].rank }));
            }
        }
        const before = definition.cpu.progress(game);
        expect(definition.cpu.step(game)).toBe(true);
        expect(definition.cpu.progress(game)).toBe(before + 1);

        const ctx = { game, ignore() { this.ignored = true; } };
        definition.onPlayerGone(ctx, { seat: 0, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'left' });
        expect(game.players[1].isCPU).toBe(true);
        expect(definition.persist(game).players[1].isCPU).toBe(true);
    });
});
