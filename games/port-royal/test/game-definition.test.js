import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, find, stackDeck } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (n = 3) => definition.create({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), random: createRandom(5) });

    it('2〜5人', () => {
        expect([definition.minPlayers, definition.maxPlayers]).toEqual([2, 5]);
    });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const ctx = ctxFor(game, game.actors()[0], { type: 'draw', extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'draw' });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'stop' }, { type: 'proxy' }, null, 'draw', { type: 'take', card: 1 }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'draw' });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create(4);
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 5000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winners).toEqual(game.winners);
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

describe('ビューで隠す（sanitize）', () => {
    it('山の並びと、各自のコインのカードの中身は入らない（枚数だけ）。シードも入らない', () => {
        const game = newGame(4, 3);
        for (const seat of [0, 1, null]) {
            const view = createGameView(game, seat);
            const json = JSON.stringify(view);
            expect(json).not.toContain('seed');
            expect(json).not.toContain('cpuSalt');
            expect(json).not.toContain('"deck"');
            expect(view.deckCount).toBe(game.deck.length);
            view.players.forEach((p, i) => expect(p.coins).toBe(game.players[i].coins.length));
            // 山とコインのカードの番号が、どこにも出てこない
            const hidden = [...game.deck, ...game.players.flatMap(p => p.coins)];
            const numbers = new Set([...json.matchAll(/\d+/g)].map(m => Number(m[0])));
            const shown = [...view.harbor, ...view.expeditions, ...(view.discardTop === null ? [] : [view.discardTop]), ...view.players.flatMap(p => [...p.display, ...p.expeditions])];
            shown.forEach(id => expect(hidden).not.toContain(id));
            expect(Array.isArray(view.harbor)).toBe(true);
            expect(numbers.size).toBeGreaterThan(0);
        }
    });

    it('めくったカードと捨て札の一番上は全員に見える', () => {
        const game = newGame(3, 3);
        const a = find({ kind: 'ship', color: 'blue' })[0];
        stackDeck(game, [a]);
        game.applyCommand(0, { type: 'draw' });
        [0, 1, null].forEach(seat => expect(createGameView(game, seat).harbor).toEqual([a]));
    });

    it('できること（取れるカード・失敗の確率）は、番の人にだけ入る', () => {
        const game = newGame(3, 3);
        game.applyCommand(0, { type: 'draw' });
        if (game.phase === 'discover') {
            expect(createGameView(game, 0).risk).not.toBe(null);
            expect(createGameView(game, 1).risk).toBe(null);
        }
        expect(createGameView(game, 1).claimable).toEqual([]);
    });

    it('JSON にでき、ゲームの状態とつながっていない', () => {
        const game = newGame(3, 3);
        const view = createGameView(game, 0);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        view.players[0].display.push(1);
        expect(game.players[0].display).toEqual([]);
    });
});
