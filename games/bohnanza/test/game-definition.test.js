import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, run } from './helpers.js';

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
        const seat = game.active;
        const field = game.legalFields(game.players[seat], game.players[seat].hand[0])[0];
        const ctx = ctxFor(game, seat, { type: 'plant', field, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'plant', field } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.active;
        const before = snapshot(game);
        [{ type: 'plant', field: '0' }, { type: 'plant', field: 9 }, { type: 'proxy' }, null, 'plant', { type: 'respond', accept: 'yes' },
            { type: 'offer', to: seat }, { type: 'harvest', field: 0 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'offer', to: 1, give: { hand: [0], x: 1 }, want: { types: { soy: 2 } }, y: 2 }))
            .toEqual({ type: 'offer', to: 1, give: { faceUp: [], hand: [0] }, want: { faceUp: [], types: { soy: 2 } } });
        expect(sanitize({ type: 'respond', accept: true, hand: [2], z: 1 })).toEqual({ type: 'respond', accept: true, hand: [2] });
        expect(sanitize({ type: 'endTrade', seat: 3 })).toEqual({ type: 'endTrade' });
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

describe('ビューで手札と山の順を隠す', () => {
    it('手札の中身と並びは本人だけ。ほかの人には枚数だけ。山は枚数だけ、シードは入らない', () => {
        const game = newGame(4, { hands: [['red', 'soy', 'blue'], ['wax', 'garden'], ['green'], ['chili']] });
        const view = createGameView(game, 1);
        expect(view.players[1].hand).toEqual(['wax', 'garden']);
        [0, 2, 3].forEach(s => expect(view.players[s].hand).toBe(null));
        expect(view.players[0].handCount).toBe(3);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"deck"');
        expect(json).not.toContain('seed');
        expect(createGameView(game, null).players.every(p => p.hand === null)).toBe(true);
    });

    it('提案の手札の位置は提案した本人だけ。出すカードの種類は全員に見せる', () => {
        const game = newGame(4, { hands: [['red', 'soy', 'blue'], ['wax'], ['green'], ['chili']], fields: [[null, null]] });
        run(game, [[0, { type: 'plant', field: 0 }], [0, { type: 'next' }], [0, { type: 'offer', to: 2, give: { hand: [1] }, want: {} }]]);
        expect(createGameView(game, 0).offer.giveHand).toEqual([1]);
        expect(createGameView(game, 2).offer.giveHand).toBe(null);
        expect(createGameView(game, 2).offer.give).toEqual(['blue']);
    });
});
