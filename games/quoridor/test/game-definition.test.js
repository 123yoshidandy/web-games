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
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
    };

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        toHuman(game);
        const action = game.legalActions().find(a => a.type === 'wall');
        const ctx = ctxFor(game, 0, { ...action, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual(action);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        const restored = definition.restore(saved);
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.level).toBe('normal');
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        toHuman(game);
        const before = snapshot(game);
        [{ type: 'wall', x: 9, y: 9, o: 'h' }, { type: 'proxy' }, null, 'move', { type: 'pass' }, { type: 'move', x: 0, y: 0 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('2人か4人で始める。3人では始めない', () => {
        expect(definition.canStart({ players: [{}, {}] })).toBe(null);
        expect(definition.canStart({ players: [{}, {}, {}, {}] })).toBe(null);
        expect(definition.canStart({ players: [{}, {}, {}] })).toBeTruthy();
    });

    it('CPU の強さを設定で受け取る。4人で全員 CPU なら進む', () => {
        expect(definition.settings.validate({ level: 'easy' }, { level: 'normal' })).toEqual({ level: 'easy' });
        expect(definition.settings.validate({ level: 'hard' }, { level: 'normal' })).toEqual({ level: 'normal' });
        const game = create(4, { level: 'easy' });
        expect(game.level).toBe('easy');
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 30) definition.cpu.step(game);
        expect(steps).toBeGreaterThan(20);
        expect(definition.view(game, 0, {}).seat).toBe(0);
        expect(definition.spectatorView(game, {}).moves).toEqual([]);
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
