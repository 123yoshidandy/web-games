import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, setPosition, at } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (options = { size: 9 }) => definition.create({ players: [{ name: 'A' }, { name: 'B' }], options, random: createRandom(5) });

    it('2人用で、操作を受け付け、記録から同じ状態を再現できる（余計な項目は記録しない）', () => {
        expect([definition.minPlayers, definition.maxPlayers]).toEqual([2, 2]);
        const game = create();
        const ctx = ctxFor(game, 0, { type: 'move', sq: at(9, 2, 2), extra: 'x' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands[0].command).toEqual({ type: 'move', sq: at(9, 2, 2) });
        definition.actions.command(ctxFor(game, 1, { type: 'pass' }));
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('正しくないオプションは既定の値にする', () => {
        expect(create({ size: 7 }).options).toEqual({ size: 19, komi: 6.5, handicap: 0 });
        expect(create({ size: 13, handicap: 3, komi: 0.5 }).options).toEqual({ size: 13, komi: 0.5, handicap: 3 });
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'undo' }, null, 'move', { type: 'move', sq: -1 }, { type: 'move', sq: 'c3' }, { type: 'confirm' }, { type: 'mark', sq: 0, dead: true }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, 1, { type: 'move', sq: 0 });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'easy'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 400) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winner).toBe(game.winner);
    });

    it('対戦中に部屋を出た人の席は CPU が続ける。切断は待つ', () => {
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
    it('盤とアゲハマは公開。自分の番かどうかが分かり、ビューを書き換えてもゲームは変わらない', () => {
        const game = newGame();
        const view = createGameView(game, 0);
        expect(view.board).toEqual(game.board);
        expect(view.size).toBe(9);
        expect(view.toPlay).toBe(1);
        expect(view.myTurn).toBe(true);
        expect(view.score).toBe(null);
        expect(createGameView(game, 1).myTurn).toBe(false);
        expect(definition.spectatorView(game).myTurn).toBe(false);
        view.board[0] = 1;
        expect(game.board[0]).toBe(0);
    });

    it('死に石を決める段階では、地の持ち主と点が入り、2人とも操作できる', () => {
        const game = newGame();
        setPosition(game, ['...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....']);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'pass' });
        const view = createGameView(game, 0);
        expect(view.phase).toBe('scoring');
        expect(view.owner[at(9, 0, 0)]).toBe(1);
        expect(view.score.black.territory).toBe(27);
        expect(view.myTurn).toBe(true);
        expect(createGameView(game, 1).myTurn).toBe(true);
    });
});
