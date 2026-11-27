import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { sqOf } from '../public/js/rules.js';
import { snapshot, newGame } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false, now: () => 0 };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }], random: createRandom(5) });

    it('2人用で、操作を受け付け、記録から同じ状態を再現できる（余計な項目は記録しない）', () => {
        expect([definition.minPlayers, definition.maxPlayers]).toEqual([2, 2]);
        const game = create();
        const ctx = ctxFor(game, 0, { type: 'move', from: sqOf(7, 7), to: sqOf(7, 6), promote: false, extra: 'x' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands[0].command).toEqual({ type: 'move', from: sqOf(7, 7), to: sqOf(7, 6), promote: false });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'pass' }, { type: 'undo' }, null, 'move', { type: 'move', from: sqOf(7, 7), to: sqOf(7, 5) }, { type: 'drop', piece: 1, to: 40 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, 1, { type: 'move', from: sqOf(3, 3), to: sqOf(3, 4), promote: false });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('投了は手番でなくてもできる', () => {
        const game = create();
        const ctx = ctxFor(game, 1, { type: 'resign' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(definition.isOver(game)).toBe(true);
        expect(game.winner).toBe(0);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'easy'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 400) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winner).toBe(game.winner);
    });

    it('対局中に部屋を出た人の席は CPU が続ける。切断は待つ', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        expect(definition.cpu.needsStep(game)).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});

describe('ビュー', () => {
    it('盤と持ち駒は公開。指せる手は手番の人の分だけ入り、自分の番かどうかが分かる', () => {
        const game = newGame([false, false]);
        const view = createGameView(game, 0);
        expect(view.board).toEqual(game.pos.board);
        expect(view.moves.length).toBe(30);
        expect(view.moves[0]).toHaveProperty('promote');
        expect(view.myTurn).toBe(true);
        expect(view.check).toBe(false);
        expect(createGameView(game, 1).myTurn).toBe(false);
        expect(definition.spectatorView(game).myTurn).toBe(false);
        // ビューを書き換えても、ゲームの盤と持ち駒は変わらない
        view.board[0] = 1;
        view.hands[0][1] = 5;
        expect(game.pos.board[0]).not.toBe(1);
        expect(game.pos.hands[0][1]).toBe(0);
    });
});
