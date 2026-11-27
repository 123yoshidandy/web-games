import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { NEIGHBORS } from '../public/js/data.js';
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

    it('怪物の数の設定を受け、知らない値は前の値のままにする', () => {
        expect(create({ level: '4' }).monsters).toHaveLength(4);
        expect(create().monsters).toHaveLength(2);
        expect(definition.settings.validate({ level: 'x' }, { level: '3' })).toEqual({ level: '3' });
    });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const to = NEIGHBORS[game.players[0].loc][0];
        const ctx = ctxFor(game, 0, { type: 'move', to, extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'to']);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'end' }, { type: 'move', to: 99 }, { type: 'nope' }, null, 'end'].forEach(command => {
            const ctx = ctxFor(game, 1, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ビューに袋・山札の並びとシードを入れない（枚数だけ）。持ち物は全員に見せる', () => {
        const game = create();
        const view = definition.view(game, 1, {});
        const text = JSON.stringify(view);
        expect(text).not.toContain('"seed"');
        expect(view.bagCount).toBe(game.bag.length);
        expect(view.deckCount).toBe(30);
        expect(view.players[0].items).toEqual(game.players[0].items);
        expect(definition.spectatorView(game, {}).you).toBe(null);
    });

    it('部屋を出た人の席は CPU が引き継ぎ、切断は待つ', () => {
        const game = create();
        const ctx = { game, ignore() { this.ignored = true; } };
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnect' });
        expect(ctx.ignored).toBe(true);
        expect(game.players[1].isCPU).toBe(false);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'left' });
        expect(game.players[1].isCPU).toBe(true);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(definition.restore(saved).players[1].isCPU).toBe(true);
    });

    it('CPU の席の番なら、定義の CPU が進める', () => {
        const game = definition.create({ players: [{ name: 'A', isCPU: true }, { name: 'B' }], settings: {}, random: createRandom(2) });
        expect(definition.cpu.needsStep(game)).toBe(true);
        const before = definition.cpu.progress(game);
        definition.cpu.step(game);
        expect(definition.cpu.progress(game)).toBe(before + 1);
    });
});
