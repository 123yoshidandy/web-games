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
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const ctx = ctxFor(game, game.current, { type: 'drawDeck', extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'drawDeck' }); // 余計な項目は記録しない
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'takeDiscard', pile: 7 }, { type: 'proxy' }, null, 'drawDeck', { type: 'stop' }, { type: 'duo', cards: [0, 1] }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (game.current + 1) % 3, { type: 'drawDeck' });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('ほかの人の手札と山札から引いた2枚は、ビューに入らない', () => {
        const game = create();
        const seat = game.current;
        definition.actions.command(ctxFor(game, seat, { type: 'drawDeck' }));
        const secret = [...game.drawn];
        const others = [0, 1, 2].filter(s => s !== seat);
        others.forEach(s => {
            const view = definition.view(game, s, { since: 0 });
            expect(view.drawn).toBe(null);
            expect(JSON.stringify(view.events)).not.toContain(JSON.stringify(secret));
        });
        expect(definition.view(game, seat, {}).drawn).toEqual(secret);
        expect(definition.spectatorView(game, {}).drawn).toBe(null);
    });

    it('CPU の番を最後まで進められ、ビューは席ごとに作れる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 20000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        const view = definition.view(game, 1, { since: 0 });
        expect(view.you).toBe(1);
        expect(definition.spectatorView(game, {}).you).toBe(null);
    });

    it('対戦中に部屋を出た人の席は CPU が続ける', () => {
        const game = create();
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const ctx2 = ctxFor(game, null, null);
        definition.onPlayerGone(ctx2, { seat: 1, reason: 'disconnected' });
        expect(ctx2.ignored).toBe(true);
        expect(game.players[1].isCPU).toBe(false);
    });
});
