import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { snapshot } from './helpers.js';

const createRandom = (seed) => {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

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
        const ctx = ctxFor(game, game.turn, { type: 'section', index: 0, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'section', index: 0 });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('手番でない人の操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        const other = (game.turn + 1) % 3;
        [[other, { type: 'section', index: 0 }], [game.turn, { type: 'proxy' }], [game.turn, null], [game.turn, 'section']].forEach(([seat, command]) => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ほかの人の戦闘カードの数字と目標は送らない', () => {
        const game = create();
        const view = definition.view(game, 0, {});
        expect(view.players[0].cards).toEqual(game.players[0].cards);
        expect(view.players[1].cards).toBe(null);
        expect(view.players[1].objectives).toBe(null);
        expect(definition.spectatorView(game, {}).players.every(p => p.cards === null)).toBe(true);
    });

    it('人間の番まで CPU が進め、全員 CPU なら最後まで進む', () => {
        const game = create();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        expect(game.actors().some(s => !game.players[s].isCPU)).toBe(true);
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 6000) definition.cpu.step(game);
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
