import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { buildTargets } from '../public/js/rules.js';
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
        const seat = game.active;
        const cell = buildTargets(game, seat)[0];
        const ctx = ctxFor(game, seat, { type: 'build', cell, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'build', cell } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.active;
        const before = snapshot(game);
        [{ type: 'build', cell: '0' }, { type: 'build', cell: 999 }, { type: 'proxy' }, null, 'build', { type: 'end' },
            { type: 'tile', tile: 'oracle', cell: 0 }, { type: 'tile', tile: 'toString', cell: 0 }, { type: 'tile', tile: 'barn', from: 0, cell: 1 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'build', cell: buildTargets(game, seat)[0] });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'build', cell: 5, x: 1 })).toEqual({ type: 'build', cell: 5 });
        expect(sanitize({ type: 'build', cell: '5' })).toEqual({ type: 'build', cell: -1 });
        expect(sanitize({ type: 'tile', tile: 'oracle', from: 3, cell: 7 })).toEqual({ type: 'tile', tile: 'oracle', cell: 7 });
        expect(sanitize({ type: 'tile', tile: 'paddock', from: 3, cell: 7, y: 2 })).toEqual({ type: 'tile', tile: 'paddock', from: 3, cell: 7 });
        expect(sanitize({ type: 'tile', tile: '__proto__', cell: 7 })).toEqual({ type: 'tile', tile: '', cell: 7 });
        expect(sanitize({ type: 'end', seat: 3 })).toEqual({ type: 'end' });
        expect(sanitize({ type: 'nope' })).toBe(null);
        expect(sanitize('end')).toBe(null);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
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
    it('手札の地形カードは本人と手番の人の分だけ。山は枚数だけで、並びもシードも入らない', () => {
        const game = definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], random: createRandom(9) });
        const active = game.active;
        for (let seat = 0; seat < 4; seat++) {
            const view = createGameView(game, seat);
            view.players.forEach((p, i) => {
                expect(p.card, `${seat}→${i}`).toBe(i === seat || i === active ? game.players[i].card : null);
            });
            const json = JSON.stringify(view);
            expect(json).not.toContain('"deck"');
            expect(json).not.toContain('seed');
            expect(view.deckCount).toBe(game.deck.length);
        }
        const spectator = createGameView(game, null);
        spectator.players.forEach((p, i) => expect(p.card).toBe(i === active ? game.players[i].card : null));
    });

    it('終わったあとは、だれの手札も見せない（手番の人もいない）', () => {
        const game = definition.create({ players: [{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], random: createRandom(2) });
        while (!game.isOver()) definition.cpu.step(game);
        createGameView(game, 0).players.forEach((p, i) => expect(p.card).toBe(i === 0 ? game.players[0].card : null));
        expect(createGameView(game, 0).scores).toEqual(game.scores);
    });
});
