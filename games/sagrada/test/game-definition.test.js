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
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('部屋は2〜4人', () => {
        expect(definition.minPlayers).toBe(2);
        expect(definition.maxPlayers).toBe(4);
    });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const pattern = game.players[0].offers[1];
        const ctx = ctxFor(game, 0, { type: 'choose', pattern, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'choose', pattern });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'choose', pattern: 99 }, { type: 'proxy' }, null, 'draft', { type: 'draft', die: 1, cell: 0 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 2000) definition.cpu.step(game);
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

describe('ビューで伏せた情報を隠す', () => {
    it('個人の目標・配られた窓・シード・CPU の値は、本人以外に入らない。袋は色ごとの数だけ', () => {
        const game = definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], random: createRandom(8) });
        const view = definition.view(game, 1);
        expect(view.players[1].privates).toEqual(game.players[1].privates);
        expect(view.players[1].offers).toEqual(game.players[1].offers);
        [0, 2].forEach(s => {
            expect(view.players[s].privates).toBe(null);
            expect(view.players[s].offers).toBe(null);
        });
        const json = JSON.stringify(view);
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(json).not.toContain('random');
        expect(Object.keys(view.bag).sort()).toEqual(['blue', 'green', 'purple', 'red', 'yellow']);
        const spectator = definition.spectatorView(game);
        expect(spectator.players.every(p => p.privates === null && p.offers === null)).toBe(true);
    });

    it('終わったら、個人の目標を全員に見せる', () => {
        const game = definition.create({ players: [{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], random: createRandom(9) });
        let steps = 0;
        while (!definition.isOver(game) && steps++ < 2000) definition.cpu.step(game);
        expect(definition.view(game, 0).players[1].privates).toEqual(game.players[1].privates);
    });
});
