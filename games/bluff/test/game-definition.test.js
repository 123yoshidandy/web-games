import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (options) => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5), options });

    it('部屋は2〜6人。部屋の設定（振り直し・Perudo 風）を渡せる', () => {
        expect(definition.minPlayers).toBe(2);
        expect(definition.maxPlayers).toBe(6);
        expect(create({ reroll: false, lossOne: true }).options).toMatchObject({ reroll: false, lossOne: true });
        expect(create().options).toMatchObject({ reroll: true, lossOne: false });
    });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const seat = game.turn;
        const ctx = ctxFor(game, seat, { type: 'bid', qty: 2, face: 3, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'bid', qty: 2, face: 3 });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.turn;
        const before = snapshot(game);
        [{ type: 'challenge' }, { type: 'proxy' }, null, 'bid', { type: 'bid', qty: 0, face: 3 }, { type: 'next' }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
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

    it('ビューに、ほかの人のカップの中・シード・CPU の値が入らない', () => {
        const game = create();
        const view = definition.view(game, 1);
        expect(view.players[1].dice).toHaveLength(5);
        [0, 2].forEach(s => expect(view.players[s].dice).toBe(null));
        const json = JSON.stringify(view);
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(definition.spectatorView(game).players.every(p => p.dice === null)).toBe(true);
    });
});
