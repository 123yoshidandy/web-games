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
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }], random: createRandom(5) });

    it('2人用で、操作を受け付け、記録から同じ状態を再現できる（余計な項目は記録しない）', () => {
        expect([definition.minPlayers, definition.maxPlayers]).toEqual([2, 2]);
        const game = create();
        const seat = game.actors()[0];
        const m = game.moves(seat)[0];
        const ctx = ctxFor(game, seat, { type: 'move', card: m.card, from: m.from, to: m.to, extra: 'x' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands[0].command).toEqual({ type: 'move', card: m.card, from: m.from, to: m.to });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'pass', card: game.hands[seat][0] }, { type: 'proxy' }, null, 'move', { type: 'move', card: 'x', from: 0, to: 1 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const m = game.moves(1 - seat)[0] ?? { card: game.hands[1 - seat][0], from: 0, to: 5 };
        const other = ctxFor(game, 1 - seat, { type: 'move', ...m });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 400) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).result).toBe(game.result);
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

describe('ビュー', () => {
    it('盤・両者の手札・脇は公開。シードと局面を数える記録は入らない', () => {
        const game = newGame(9);
        const view = createGameView(game, 0);
        const json = JSON.stringify(view);
        expect(json).not.toContain('seed');
        expect(json).not.toContain('random');
        expect(json).not.toContain('seen');
        expect(view.hands).toEqual(game.hands);
        expect(view.side).toBe(game.side);
        expect(definition.spectatorView(game).hands).toEqual(game.hands);
    });

    it('動ける手は、手番の人のビューにだけ入る', () => {
        const game = newGame(3);
        expect(createGameView(game, game.current).moves.length).toBeGreaterThan(0);
        expect(createGameView(game, 1 - game.current).moves).toEqual([]);
        expect(createGameView(game, null).moves).toEqual([]);
    });
});
