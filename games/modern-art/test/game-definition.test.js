import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
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

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const seat = game.auctioneer;
        const cardId = game.players[seat].hand[0];
        const ctx = ctxFor(game, seat, { type: 'play', card: cardId, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'play', card: cardId } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.auctioneer;
        const before = snapshot(game);
        const other = game.players[(seat + 1) % 3].hand[0];
        [{ type: 'play', card: String(game.players[seat].hand[0]) }, { type: 'play', card: other }, { type: 'proxy' }, null, 'play',
            { type: 'bid', amount: 5 }, { type: 'buy' }, { type: 'price', amount: 3 }, { type: 'second', card: null }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'play', card: 5, x: 1 })).toEqual({ type: 'play', card: 5 });
        expect(sanitize({ type: 'second', card: null, y: 2 })).toEqual({ type: 'second', card: null });
        expect(sanitize({ type: 'second', card: '3' })).toEqual({ type: 'second', card: -1 });
        expect(sanitize({ type: 'bid', amount: 12, seat: 1 })).toEqual({ type: 'bid', amount: 12 });
        expect(sanitize({ type: 'price', amount: 1.5 })).toEqual({ type: 'price', amount: -1 });
        expect(sanitize({ type: 'pass', money: 999 })).toEqual({ type: 'pass' });
        expect(sanitize({ type: 'nope' })).toBe(null);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 6000) definition.cpu.step(game);
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

describe('ビューで手札・所持金・握った額・山の順を隠す', () => {
    it('手札と所持金は本人だけ。山は枚数だけで、並びもシードも入らない', () => {
        const game = definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], random: createRandom(9) });
        game.players[2].money = 87;
        for (let seat = 0; seat < 4; seat++) {
            const view = createGameView(game, seat);
            view.players.forEach((p, i) => {
                expect(p.hand).toEqual(i === seat ? game.players[i].hand : null);
                expect(p.money).toBe(i === seat ? game.players[i].money : null);
                expect(p.handCount).toBe(game.players[i].hand.length);
            });
            const json = JSON.stringify(view);
            expect(json).not.toContain('"deck"');
            expect(json).not.toContain('seed');
        }
        createGameView(game, null).players.forEach(p => {
            expect(p.hand).toBe(null);
            expect(p.money).toBe(null);
        });
    });

    it('終わったら所持金を全員に見せる。手札は見せない', () => {
        const game = definition.create({ players: [{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }], random: createRandom(2) });
        while (!game.isOver()) definition.cpu.step(game);
        const view = createGameView(game, 0);
        view.players.forEach((p, i) => expect(p.money).toBe(game.players[i].money));
        expect(view.players[1].hand).toBe(null);
    });
});
