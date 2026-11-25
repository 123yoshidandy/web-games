import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, startTravel, place, moveTo } from './helpers.js';

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
        const traveler = game.players[0].offers[0];
        const ctx = ctxFor(game, 0, { type: 'choose', traveler, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'choose', traveler });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'choose', traveler: 'nobody' }, { type: 'proxy' }, null, 'move', { type: 'move', to: 1 }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
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

describe('ビューで伏せた情報を隠す', () => {
    it('山の並び・シード・CPU の値・ほかの人に配られた旅人は入らない', () => {
        const game = definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], random: createRandom(8) });
        const view = definition.view(game, 1);
        expect(view.players[1].offers).toEqual(game.players[1].offers);
        [0, 2].forEach(s => expect(view.players[s].offers).toBe(null));
        const json = JSON.stringify(view);
        expect(json).not.toContain('"decks"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        game.players[0].offers.forEach(t => expect(json).not.toContain(`"${t}"`));
        // 山の札の名前は1枚も入らない（まだだれも引いていない）
        [...game.decks.souvenir, ...game.decks.meal, ...game.decks.encounter, ...game.decks.spring].forEach(c => expect(json).not.toContain(`"${c}"`));
        expect(view.deckCounts).toEqual({ souvenir: 24, meal: 25, encounter: 14, spring: 12 });
        const spectator = JSON.stringify(definition.spectatorView(game));
        game.players.flatMap(p => p.offers).forEach(t => expect(spectator).not.toContain(`"${t}"`));
    });

    it('宿場の食事の札は、着いた人にだけ見える', () => {
        const game = startTravel(3);
        place(game, [13, 12, 11]);
        moveTo(game, 14);
        const arrived = game.tokens.findIndex(t => t.pos === 14);
        const waiting = [0, 1, 2].filter(s => s !== arrived);
        expect(createGameView(game, arrived).inn.meals).toEqual(game.inn.meals);
        waiting.forEach(s => {
            const json = JSON.stringify(createGameView(game, s));
            expect(createGameView(game, s).inn.meals).toBe(null);
            game.inn.meals.forEach(c => expect(json).not.toContain(`"${c}"`));
        });
        expect(createGameView(game, null).inn.meals).toBe(null);
    });
});
