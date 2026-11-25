import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { isClan } from '../public/js/game.js';
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
    const create = (settings = definition.settings.defaults()) => definition.create({ players: [{ name: 'A' }, { name: 'B', isCPU: true }], settings, random: createRandom(5) });

    it('設定の既定は戦術カードなし。変えられるのは真偽値だけ', () => {
        expect(definition.settings.defaults()).toEqual({ tactics: false });
        expect(definition.settings.validate({ tactics: true }, { tactics: false })).toEqual({ tactics: true });
        expect(definition.settings.validate({ tactics: 'yes', other: 1 }, { tactics: false })).toEqual({ tactics: false });
        expect(create({ tactics: true }).options.tactics).toBe(true);
        expect(create().options.tactics).toBe(false);
    });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const card = game.players[0].hand.find(isClan);
        const ctx = ctxFor(game, 0, { type: 'play', card, stone: 0, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'play', card, stone: 0 });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const before = snapshot(game);
        [{ type: 'play', card: 99, stone: 0 }, { type: 'proxy' }, null, 'play', { type: 'claim', stone: 0 }, { type: 'end' }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, 1, { type: 'pass' });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('全員 CPU なら最後まで進む（戦術カードありでも）', () => {
        [false, true].forEach(tactics => {
            const game = create({ tactics });
            game.players.forEach(p => { p.isCPU = true; });
            let steps = 0;
            while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
            expect(definition.isOver(game)).toBe(true);
            expect(definition.view(game, 0, {}).you).toBe(0);
            expect(definition.spectatorView(game, {}).players.every(p => p.hand === null)).toBe(true);
        });
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
