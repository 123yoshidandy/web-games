import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, setHand, act, allowAll } from './helpers.js';

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
        const ctx = ctxFor(game, game.current, { type: 'action', action: 'income', extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'action', action: 'income' });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'action', action: 'coup', target: 1 }, { type: 'proxy' }, null, 'income', { type: 'challenge' }, { type: 'lose', role: 'duke' }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (game.current + 1) % 3, { type: 'action', action: 'income' });
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

describe('ビューで手札を隠す', () => {
    it('ほかの人の手札・山の並び・シードは入らない', () => {
        const game = newGame(4);
        const view = createGameView(game, 1);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        [0, 2, 3].forEach(s => {
            expect(view.players[s].hand).toBe(null);
            expect(view.players[s].cardCount).toBe(2);
        });
        const json = JSON.stringify(view);
        expect(json).not.toContain('"deck"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(createGameView(game, null).players.every(p => p.hand === null)).toBe(true);
    });

    it('交換で引いた札は、本人にだけ見せる', () => {
        const game = newGame(3);
        act(game, 'exchange');
        allowAll(game);
        expect(createGameView(game, 0).drawn).toEqual(game.drawn);
        expect(createGameView(game, 1).drawn).toBe(null);
        expect(createGameView(game, 1).drawnCount).toBe(2);
        const event = createGameView(game, 1).events.find(e => e.type === 'exchangeDraw');
        expect(event.cards).toBeUndefined();
        expect(createGameView(game, 0).events.find(e => e.type === 'exchangeDraw').cards).toEqual(game.drawn);
    });

    it('チャレンジのあとに引き直した札は、本人にだけ見せる', () => {
        const game = newGame(3);
        setHand(game, 0, ['duke', 'captain']);
        act(game, 'tax');
        game.applyCommand(1, { type: 'challenge' });
        const fresh = game.events.find(e => e.type === 'redraw').card;
        expect(createGameView(game, 0).events.find(e => e.type === 'redraw').card).toBe(fresh);
        [1, 2, null].forEach(s => expect(createGameView(game, s).events.find(e => e.type === 'redraw').card).toBeUndefined());
    });

    it('失った札は、全員に見せる', () => {
        const game = newGame(3);
        setHand(game, 2, ['duke', 'captain']);
        game.players[0].coins = 7;
        act(game, 'coup', 2);
        game.applyCommand(2, { type: 'lose', role: 'captain' });
        [0, 1, null].forEach(s => expect(createGameView(game, s).players[2].lost).toEqual(['captain']));
    });

    it('答えを待つ人の一覧は、手札が違っても同じ', () => {
        const a = newGame(4, 2);
        const b = newGame(4, 2);
        setHand(b, 1, ['duke', 'duke']);
        setHand(b, 2, ['captain', 'contessa']);
        for (const g of [a, b]) {
            act(g, 'foreignAid');
        }
        expect(createGameView(a, 3).waiting).toEqual(createGameView(b, 3).waiting);
        expect(createGameView(a, 3).waiting).toEqual([1, 2, 3]);
    });
});
