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
    const create = (settings = definition.settings.defaults()) => definition.create({
        players: [{ name: 'A' }, { name: 'B' }], settings, random: createRandom(5)
    });

    it('難易度の設定を受け、知らない値は前の値のままにする', () => {
        expect(create({ level: 'nightmare' }).options.level).toBe('nightmare');
        expect(create().options.level).toBe('normal');
        expect(definition.settings.validate({ level: 'x' }, { level: 'initiation' })).toEqual({ level: 'initiation' });
    });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        while (game.phase === 'place') definition.actions.command(ctxFor(game, game.current, { type: 'place', slot: game.placeOptions(game.queue[0])[0] }));
        const ctx = ctxFor(game, game.current, { type: 'move', to: 3, extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'move', to: 3 });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('手番でない人の操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        const other = (game.current + 1) % 4;
        [{ type: 'pass' }, { type: 'nope' }, null, 'pass', { type: 'proxy' }].forEach(command => {
            const ctx = ctxFor(game, other, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ビューに山の並びとシードを入れない（枚数だけ）', () => {
        const game = create();
        const view = definition.view(game, 0, {});
        const text = JSON.stringify(view);
        expect(view.deckCount).toBe(game.deck.length);
        expect(view.deck).toBeUndefined();
        expect(text).not.toContain('"seed"');
        expect(text).not.toContain('"options"');
        expect(JSON.stringify(definition.spectatorView(game, {}))).not.toContain('"deck"');
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 4000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0, {}).result).toEqual(game.result);
    });

    it('対戦中に部屋を出た人の僧は CPU が続け、保存と復元のあとも CPU のまま', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(restored.players[0].isCPU).toBe(true);
        expect(restored.players[1].isCPU).toBe(false);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});
