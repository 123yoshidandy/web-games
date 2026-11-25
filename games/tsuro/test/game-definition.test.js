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

    it('操作を受け付け、記録から同じ状態を再現できる（余計な項目は記録しない）', () => {
        const game = create();
        const seat = game.actors()[0];
        const ctx = ctxFor(game, seat, { type: 'place', mark: 5, extra: 'x' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands[0].command).toEqual({ type: 'place', mark: 5 });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'play', tile: 0, rotation: 0 }, { type: 'proxy' }, null, 'place', { type: 'place', mark: -1 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'place', mark: 0 });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 300) definition.cpu.step(game);
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

describe('ビューで隠す（sanitize）', () => {
    it('山の並び・シードは入らない。手札は自分の分だけで、ほかの人は枚数だけ', () => {
        const game = newGame(4, 9);
        const view = createGameView(game, 1);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"pile"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('random');
        expect(view.pileCount).toBe(game.pile.length);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        [0, 2, 3].forEach(s => {
            expect(view.players[s].hand).toBe(null);
            expect(view.players[s].handCount).toBe(3);
        });
        expect(definition.spectatorView(game).players.every(p => p.hand === null)).toBe(true);
        // 終わっても、ほかの人の手札は見せない
        game.phase = 'end';
        expect(createGameView(game, 1).players[0].hand).toBe(null);
    });

    it('自分の番の置ける手は、自分のビューにだけ入る', () => {
        const game = newGame(3, 2);
        game.players.forEach((p, i) => { p.mark = i; p.pos = { cell: [0, 5, 30][i], p: [0, 1, 5][i] }; });
        game.phase = 'play';
        game.current = 0;
        expect(createGameView(game, 0).moves.length).toBeGreaterThan(0);
        expect(createGameView(game, 1).moves).toEqual([]);
        expect(createGameView(game, null).moves).toEqual([]);
    });
});
