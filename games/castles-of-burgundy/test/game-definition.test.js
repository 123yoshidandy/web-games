import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame } from './helpers.js';

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
        const seat = game.actors()[0];
        const ctx = ctxFor(game, seat, { type: 'workers', die: 0, extra: 'x' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'end' }, { type: 'proxy' }, null, 'workers', { type: 'take', die: 0, depot: 9, slot: 0 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'workers', die: 0 });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 4000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winner).toBe(game.winner);
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

describe('ビューで隠す', () => {
    it('タイルの山の並び・先のフェーズの商品・シードは入らない（枚数だけ）', () => {
        const game = newGame(3);
        const view = createGameView(game, 1);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"supply"');
        expect(json).not.toContain('goodsPiles');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(view.supplyCounts.black).toBe(game.supply.black.length);
        expect(view.roundGoods).toEqual(game.roundGoods);
        expect(JSON.stringify(createGameView(game, null))).toBe(json.replace('"you":1', '"you":null'));
    });
});
