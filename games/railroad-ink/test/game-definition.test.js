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
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        // 置ける場所を探して置く
        let placed = false;
        for (let y = 0; y < 7 && !placed; y++) for (let x = 0; x < 7 && !placed; x++) for (let o = 0; o < 8 && !placed; o++) {
            const ctx = ctxFor(game, 0, { type: 'place', source: 'd0', x, y, o, extra: 'x'.repeat(50) });
            definition.actions.command(ctx);
            placed = ctx.rejected === null;
        }
        expect(placed).toBe(true);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'source', 'x', 'y', 'o']);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'place', source: 'd0', x: 3, y: 3, o: 0 }, { type: 'end' }, { type: 'undo' }, { type: 'proxy' }, null, 'end'].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 2000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0, {}).players[0].score.total).toBe(game.results[0].total);
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
