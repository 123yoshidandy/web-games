import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { legalPlacements } from '../public/js/cpu-player.js';
import { snapshot } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

const create = (n = 3, options) => definition.create({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i === n - 1 })), random: createRandom(5), options });

describe('オンライン対戦のゲームの定義', () => {
    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const move = legalPlacements(definition.view(game, game.current)).find(m => m.tile === m.token);
        const ctx = ctxFor(game, game.current, { ...move, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual(move);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'replace3' }, { type: 'wipe', slots: [0] }, { type: 'proxy' }, null, 'place', { type: 'place', tile: 0, token: 0, q: 9, r: 9, rot: 0, at: null }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        const other = (game.current + 1) % 3;
        const ctx = ctxFor(game, other, { type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 0, at: null });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('得点カードの組を選べる（正しくない値は A）', () => {
        expect(create(2, { cards: { bear: 'C', elk: 'Z' } }).cards).toEqual({ bear: 'C', elk: 'A', salmon: 'A', hawk: 'A', fox: 'A' });
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create(2);
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'easy'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 200) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winners).toEqual(game.winners);
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

describe('ビューで山と袋の順を隠す', () => {
    it('山は枚数、袋は動物ごとの数だけ。シードと cpuSalt は入らない', () => {
        const game = create(3);
        const view = definition.view(game, 1);
        expect(view.stackCount).toBe(game.stack.length);
        expect(view.bagCount).toBe(game.bag.length);
        expect(Object.values(view.bag).reduce((s, v) => s + v, 0)).toBe(game.bag.length);
        const json = JSON.stringify(view);
        ['"stack"', 'seed', 'cpuSalt', 'random'].forEach(word => expect(json).not.toContain(word));
        // 山の並びが入っていない：山の先頭のタイルの id の並びが、ビューのどこにも出てこない
        expect(json).not.toContain(JSON.stringify(game.stack.slice(0, 3)));
        expect(JSON.stringify(definition.spectatorView(game))).not.toContain('seed');
    });

    it('袋の引く順が違っても、ビューは同じ（隠すべき情報が漏れていない）', () => {
        const a = create(2);
        const b = create(2);
        b.bag.reverse();
        b.stack.reverse();
        expect(JSON.stringify(definition.view(b, 0))).toBe(JSON.stringify(definition.view(a, 0)));
    });
});
