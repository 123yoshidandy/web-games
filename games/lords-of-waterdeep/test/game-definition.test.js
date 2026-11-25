import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { newGame, snapshot, run, place } from './helpers.js';

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
        const ctx = ctxFor(game, seat, { type: 'place', space: 'field', extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'place', space: 'field' } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.current;
        const before = snapshot(game);
        [{ type: 'place', space: 'moon' }, { type: 'proxy' }, null, 'place', { type: 'pick', cubes: { f: 1 } }, { type: 'place', space: 7 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'place', space: 'field' });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'pick', cubes: { f: 1, g: 9 }, extra: 1 })).toEqual({ type: 'pick', cubes: { f: 1, r: 0, w: 0, c: 0 } });
        expect(sanitize({ type: 'complete', quest: null })).toEqual({ type: 'complete', quest: null });
        expect(sanitize({ type: 'opponent', seat: '1' })).toEqual({ type: 'opponent', seat: -1 });
        expect(sanitize({ type: 'proxy' })).toBe(null);
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

describe('ビューで隠す', () => {
    it('山札の並び・シード・乱数の状態は入らない。陰謀カードとロードは本人にだけ', () => {
        const game = newGame(3);
        const view = createGameView(game, 1);
        const json = JSON.stringify(view);
        ['questDeck"', 'intrigueDeck"', 'seed', 'rngState'].forEach(key => expect(json).not.toContain(key));
        expect(view.questDeckCount).toBe(game.questDeck.length);
        expect(view.players[1].intrigue).toEqual(game.players[1].intrigue);
        expect(view.players[1].lord).toBe(game.players[1].lord);
        expect(view.players[0].intrigue).toEqual([]);
        expect(view.players[0].intrigueCount).toBe(2);
        expect(view.players[0].lord).toBe(null);
        expect(createGameView(game, null).players.every(p => p.lord === null)).toBe(true);
    });

    it('置ける場所は操作する本人にだけ。決めごとの中身も本人にだけ', () => {
        const game = newGame(2);
        game.players.forEach(p => { p.quests = []; p.intrigue = []; });
        expect(createGameView(game, 0).legal.length).toBeGreaterThan(0);
        expect(createGameView(game, 1).legal).toEqual([]);
        run(game, [[0, place('inn0')]]);
        expect(createGameView(game, 0).pending).toMatchObject({ type: 'quest', seat: 0 });
        expect(createGameView(game, 1).pending).toEqual({ type: 'quest', seat: 0 });
    });

    it('達成したクエストは、プロット以外は本人にだけ。終わったら全員に見せる', () => {
        const game = newGame(2);
        game.players[0].completed = ['w01', 'w10'];
        game.players[0].plots = ['w10'];
        const other = createGameView(game, 1).players[0];
        expect(other.completed).toEqual([]);
        expect(other.completedCount).toBe(2);
        expect(other.plots).toEqual(['w10']);
        game.phase = 'over';
        expect(createGameView(game, 1).players[0].completed).toEqual(['w01', 'w10']);
    });
});
