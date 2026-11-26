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
    const create = (map) => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5), settings: { map } });

    it('地図を選べ、操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        expect(create('usa').mapId).toBe('usa');
        expect(create('mars').mapId).toBe('germany');
        const game = create();
        const seat = game.actors()[0];
        const ctx = ctxFor(game, seat, { type: 'choose', plant: 3, bid: 3, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'choose', plant: 3, bid: 3 } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'choose', plant: '3', bid: 3 }, { type: 'choose', plant: 3, bid: 2 }, { type: 'skip' }, { type: 'proxy' }, null, 'bid',
            { type: 'buy', coal: 1 }, { type: 'build', city: 'essen' }, { type: 'discard', plant: 3 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'choose', plant: 5, bid: 6, x: 1 })).toEqual({ type: 'choose', plant: 5, bid: 6 });
        expect(sanitize({ type: 'buy', coal: 2, gold: 9 })).toEqual({ type: 'buy', coal: 2, oil: 0, garbage: 0, uranium: 0 });
        expect(sanitize({ type: 'buy', coal: '2' })).toEqual({ type: 'buy', coal: -1, oil: 0, garbage: 0, uranium: 0 });
        expect(sanitize({ type: 'build', city: 'essen', cost: 0 })).toEqual({ type: 'build', city: 'essen' });
        expect(sanitize({ type: 'build', city: 3 })).toEqual({ type: 'build', city: '' });
        expect(sanitize({ type: 'done', seat: 2 })).toEqual({ type: 'done' });
        expect(sanitize({ type: 'nope' })).toBe(null);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 20000) definition.cpu.step(game);
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

describe('ビューで山の順を隠す', () => {
    it('山は枚数だけ。並び・段階3のカードの位置・伏せて抜いた発電所・シードは入らない', () => {
        const game = definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], random: createRandom(9) });
        for (const seat of [0, 1, 2, null]) {
            const view = createGameView(game, seat);
            const json = JSON.stringify(view);
            expect(json).not.toContain('"deck"');
            expect(json).not.toContain('removed');
            expect(json).not.toContain('seed');
            expect(json).not.toContain('99');
            expect(view.deckCount).toBe(game.deck.length);
        }
        // お金・発電所・資源は公開
        expect(createGameView(game, 0).players[1].money).toBe(50);
    });
});
