import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';

const snapshot = (game) => JSON.stringify({ state: game.state, commands: game.commands });

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (n = 2, settings) => definition.create({
        players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 })),
        random: createRandom(5),
        settings
    });
    const toHuman = (game) => {
        let guard = 0;
        while (definition.cpu.needsStep(game) && guard++ < 10) definition.cpu.step(game);
    };

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        toHuman(game);
        const step = game.legalSteps()[0];
        const ctx = ctxFor(game, 0, { ...step, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual(step);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        const restored = definition.restore(saved);
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.level).toBe('normal');
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        toHuman(game);
        const before = snapshot(game);
        [{ type: 'build', by: 0, at: 99 }, { type: 'proxy' }, null, 'move', { type: 'end' }, { type: 'move', from: 30, to: 0 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('2人か3人で始める', () => {
        expect(definition.canStart({ players: [{}, {}] })).toBe(null);
        expect(definition.canStart({ players: [{}, {}, {}] })).toBe(null);
        expect(definition.canStart({ players: [{}, {}, {}, {}] })).toBeTruthy();
    });

    it('設定で CPU の強さと神の力を受け取る。神は2人のときだけ', () => {
        expect(definition.settings.validate({ level: 'easy', gods: true }, { level: 'normal', gods: false })).toEqual({ level: 'easy', gods: true });
        expect(definition.settings.validate({ level: 'hard' }, { level: 'normal', gods: false })).toEqual({ level: 'normal', gods: false });
        const game = create(2, { level: 'easy', gods: true });
        expect(game.level).toBe('easy');
        expect(game.gods.every(Boolean)).toBe(true);
        expect(game.gods[0]).not.toBe(game.gods[1]);
        expect(create(3, { gods: true }).gods).toEqual([null, null, null]);
    });

    it('3人で全員 CPU なら進む', () => {
        const game = create(3, { level: 'easy' });
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 20) definition.cpu.step(game);
        expect(steps).toBeGreaterThan(10);
        expect(definition.view(game, 0, {}).seat).toBe(0);
        expect(definition.spectatorView(game, {}).steps).toEqual([]);
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
