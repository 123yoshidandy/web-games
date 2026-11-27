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
        players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], settings, random: createRandom(5)
    });

    it('難易度の設定を受け、知らない値は前の値のままにする', () => {
        expect(create({ level: 'hard' }).options.level).toBe('hard');
        expect(create().options.level).toBe('normal');
        expect(definition.settings.validate({ level: 'x' }, { level: 'easy' })).toEqual({ level: 'easy' });
    });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const ctx = ctxFor(game, 1, { type: 'growth', option: 2, extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'option']);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'play', cards: [] }, { type: 'done' }, { type: 'nope' }, null, 'growth', { type: 'growth', option: 9 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ビューにシードと山の並びを入れない（枚数だけ）', () => {
        const game = create();
        const text = JSON.stringify(definition.view(game, 0, {}));
        expect(text).not.toContain('"seed"');
        expect(text).not.toContain(game.s.fear.deck.join('","'));
        expect(definition.view(game, 0, {}).fear.pending).toBe(0);
        expect(JSON.stringify(definition.spectatorView(game, {}))).not.toContain('"seed"');
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 4000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0, {}).result).toEqual(game.result);
    });

    it('対戦中に部屋を出た人の席は CPU が続ける。切断は待つ', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        expect(definition.persist(game).players[0].isCPU).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});
