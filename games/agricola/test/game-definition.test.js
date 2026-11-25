import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
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

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const seat = game.current;
        const ctx = ctxFor(game, seat, { type: 'act', space: 'laborer', res: 'reed', extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'act', space: 'laborer', res: 'reed' } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.current;
        const before = snapshot(game);
        [{ type: 'act', space: 'moon' }, { type: 'act', space: 'plow', cell: '3' }, { type: 'proxy' }, null, 'act',
            { type: 'act', space: 'build', rooms: [{}] }, { type: 'keep', animals: { sheep: -1 } }, { type: 'feed' }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'act', space: 'plow', cell: 3, x: 1 })).toEqual({ type: 'act', space: 'plow', cell: 3 });
        expect(sanitize({ type: 'feed', convert: { grain: 1, wood: 9 }, crafts: ['basket'] }))
            .toEqual({ type: 'feed', convert: { grain: 1, veg: 0, sheep: 0, boar: 0, cattle: 0 }, crafts: ['basket'] });
        expect(sanitize({ type: 'keep', animals: { sheep: 2 } })).toEqual({ type: 'keep', animals: { sheep: 2, boar: 0, cattle: 0 } });
        expect(sanitize({ type: 'nope' })).toBe(null);
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

describe('ビューで隠すもの', () => {
    it('これから出るラウンドカードの順とシードは入らない。置ける場所は操作する本人だけ', () => {
        const game = newGame(4);
        const view = createGameView(game, 1);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"roundCards"');
        expect(json).not.toContain('seed');
        // まだ出ていないラウンドカードの名前が出ない
        game.roundCards.slice(1).forEach(id => expect(view.spaces.some(s => s.id === id)).toBe(false));
        expect(view.roundCardsLeft).toBe(13);
        expect(createGameView(game, 0).legalSpaces.length).toBeGreaterThan(0);
        expect(view.legalSpaces).toEqual([]);
    });
});
