import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, setSuns } from './helpers.js';

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
        const ctx = ctxFor(game, seat, { type: 'draw', extra: 'x' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands[0].command).toEqual({ type: 'draw' });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'pass' }, { type: 'proxy' }, null, 'draw', { type: 'bid', sun: 99 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'draw' });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
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
    it('袋の並び・シードは入らない。ほかの人の裏の太陽駒は枚数だけ（自分の分と、終わったあとは見せる）', () => {
        const game = newGame(3);
        setSuns(game, 0, [13, 8], [7, 1]);
        setSuns(game, 1, [12, 9], [11, 4]);
        const view = createGameView(game, 0);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"bag"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(view.bagCount).toBe(180);
        expect(view.players[0].downSuns).toEqual([7, 1]);
        expect(view.players[1].downSuns).toBe(null);
        expect(view.players[1].downCount).toBe(2);
        expect(createGameView(game, null).players.every(p => p.downSuns === null)).toBe(true);
        game.phase = 'end';
        expect(createGameView(game, 0).players[1].downSuns).toEqual([11, 4]);
    });
});
