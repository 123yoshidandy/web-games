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
        const offer = game.players[0].offer;
        const ctx = ctxFor(game, 0, { type: 'setup', birds: offer.birds.slice(0, 2), food: ['inv', 'seed', 'fish'], bonus: offer.bonus[0], extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).not.toHaveProperty('extra');
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('選択待ちでない人の操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [[0, { type: 'action', habitat: 'forest' }], [0, { type: 'proxy' }], [0, null], [0, 'setup']].forEach(([seat, command]) => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ほかの人の手札・配り札・ボーナスカードは送らない', () => {
        const game = create();
        const view = definition.view(game, 0, {});
        expect(view.players[0].offer.birds).toHaveLength(5);
        expect(view.players[1].offer).toBe(null);
        expect(view.players[1].hand).toBe(null);
        expect(definition.spectatorView(game, {}).players.every(p => p.offer === null && p.hand === null)).toBe(true);
    });

    it('人間の番まで CPU が進め、全員 CPU なら最後まで進む', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        expect(game.players[2].offer).toBe(null);
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 5000) definition.cpu.step(game);
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
