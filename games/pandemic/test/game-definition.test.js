import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { NEIGHBORS, START_CITY, EVENT_BY_KEY } from '../public/js/cities.js';
import { snapshot } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (settings = definition.settings.defaults()) => definition.create({
        players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], settings, random: createRandom(5)
    });

    it('難易度の設定を受け、知らない値は前の値のままにする', () => {
        expect(create({ level: 'heroic' }).epidemicsTotal).toBe(6);
        expect(create().epidemicsTotal).toBe(5);
        expect(definition.settings.validate({ level: 'x' }, { level: 'intro' })).toEqual({ level: 'intro' });
    });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const ctx = ctxFor(game, game.current, { type: 'drive', to: NEIGHBORS[START_CITY][0], extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'to']);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        const other = (game.current + 1) % 3;
        [{ type: 'drive', to: NEIGHBORS[START_CITY][0] }, { type: 'pass' }, { type: 'nope' }, null, 'pass'].forEach(command => {
            const ctx = ctxFor(game, other, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ビューに山の並びを入れない（枚数だけ）。手札は全員に見せる', () => {
        const game = create();
        const view = definition.view(game, 0, {});
        const text = JSON.stringify(view);
        expect(view.playerDeckCount).toBe(game.playerDeck.length);
        expect(view.infectionDeckCount).toBe(game.infectionDeck.length);
        expect(view.playerDeck).toBeUndefined();
        expect(view.infectionDeck).toBeUndefined();
        expect(view.forecast).toBe(null);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        expect(text).not.toContain('"seed"');
        expect(JSON.stringify(definition.spectatorView(game, {}))).not.toContain('playerDeck"');
    });

    it('予測で並べ替えている間だけ、感染カードの山の上6枚を見せる', () => {
        const game = create();
        const seat = game.current;
        game.players[seat].hand.push(EVENT_BY_KEY.forecast.id);
        expect(definition.view(game, seat, {}).forecast).toBe(null);
        definition.actions.command(ctxFor(game, seat, { type: 'event', card: EVENT_BY_KEY.forecast.id }));
        expect(definition.view(game, 1, {}).forecast).toEqual(game.infectionDeck.slice(0, 6));
        definition.actions.command(ctxFor(game, seat, { type: 'forecast', order: [0, 1, 2, 3, 4, 5] }));
        expect(definition.view(game, 1, {}).forecast).toBe(null);
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0, {}).result).toEqual(game.result);
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
