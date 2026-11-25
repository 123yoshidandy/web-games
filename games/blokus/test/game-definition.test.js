import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, place } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (n = 3) => definition.create({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), random: createRandom(5) });

    it('2〜4人', () => {
        expect([definition.minPlayers, definition.maxPlayers]).toEqual([2, 4]);
    });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const seat = game.actors()[0];
        const ctx = ctxFor(game, seat, { type: 'place', piece: 'I1', orient: 0, x: 0, y: 0, extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'place', piece: 'I1', orient: 0, x: 0, y: 0 });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'place', piece: 'I1', orient: 0, x: 5, y: 5 }, { type: 'proxy' }, null, 'place'].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'place', piece: 'I1', orient: 0, x: 0, y: 0 });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create(2);
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 200) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winners).toEqual(game.winners);
    });

    it('対戦中に部屋を出た人の色は CPU が続ける', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});

describe('ビュー', () => {
    it('シードと CPU 用の値は入らず、盤と残りのピースは全員に同じ', () => {
        const game = newGame(4, 3);
        place(game, 'X5', 0, -1, -1) || place(game, 'V3', 0, 0, 0);
        const json = JSON.stringify(createGameView(game, 1));
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(createGameView(game, 1).board).toEqual(createGameView(game, null).board);
        expect(createGameView(game, 2).colors).toEqual(createGameView(game, 0).colors);
    });

    it('JSON にでき、ゲームの状態とつながっていない', () => {
        const game = newGame(4, 3);
        const view = createGameView(game, 0);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        view.board[0] = 2;
        view.colors[0].pieces.pop();
        expect(game.board[0]).toBe(-1);
        expect(game.colors[0].pieces).toHaveLength(21);
    });
});
