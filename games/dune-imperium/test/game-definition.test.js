import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { newGame, snapshot, setHand } from './helpers.js';

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
        const ctx = ctxFor(game, seat, { type: 'reveal', extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'reveal' } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.current;
        const before = snapshot(game);
        [{ type: 'agent', card: 0, space: 'moon' }, { type: 'proxy' }, null, 'reveal', { type: 'buy', slot: 0 }, { type: 'choose', index: 0 }, { type: 'agent', card: 99, space: 'wealth' }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'reveal' });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'agent', card: 1, space: 'wealth', x: 1 })).toEqual({ type: 'agent', card: 1, space: 'wealth' });
        expect(sanitize({ type: 'buy', slot: 'liaison' })).toEqual({ type: 'buy', slot: 'liaison' });
        expect(sanitize({ type: 'buy', slot: 2 })).toEqual({ type: 'buy', slot: 2 });
        expect(sanitize({ type: 'choose', index: '1' })).toEqual({ type: 'choose', index: -1 });
        expect(sanitize({ type: 'proxy' })).toBe(null);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 8000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
    });

    it('対戦中に部屋を出た人の席は CPU が続ける', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        expect(definition.persist(game).players[0].isCPU).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});

describe('ビューで隠す', () => {
    it('山札の並び・シード・乱数の状態は入らない。手札と陰謀カードは本人にだけ', () => {
        const game = newGame(3);
        game.players[0].intrigue = ['ambush'];
        const view = createGameView(game, 1);
        const json = JSON.stringify(view);
        ['imperiumDeck"', 'intrigueDeck"', 'conflictDeck"', 'seed', 'rngState'].forEach(key => expect(json).not.toContain(key));
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        expect(view.players[0].hand).toEqual([]);
        expect(view.players[0].intrigue).toEqual([]);
        expect(view.players[0].intrigueCount).toBe(1);
        expect(view.players[1].deckList).toEqual([...game.players[1].deck].sort());
        expect(createGameView(game, null).players.every(p => p.hand.length === 0)).toBe(true);
    });

    it('山札の一番上は、ポール・アトレイデスの本人にだけ見える', () => {
        const game = newGame(2, { leaders: ['paul', 'leto'] });
        expect(createGameView(game, 0).players[0].deckTop).toBe(game.players[0].deck[0]);
        expect(createGameView(game, 1).players[0].deckTop).toBe(null);
        expect(createGameView(game, 1).players[1].deckTop).toBe(null);
    });

    it('置ける場所は手番の本人にだけ。決めごとの中身も本人にだけ', () => {
        const game = newGame(2);
        setHand(game, 0, ['diplomacy']);
        expect(createGameView(game, 0).legal.length).toBeGreaterThan(0);
        expect(createGameView(game, 1).legal).toEqual([]);
        game.players[0].water = 1;
        expect(game.applyCommand(0, { type: 'agent', card: 0, space: 'stillsuits' })).toBe(true);
        expect(createGameView(game, 0).pending).toMatchObject({ kind: 'deploy', seat: 0 });
        expect(createGameView(game, 1).pending).toEqual({ kind: 'deploy', seat: 0 });
    });
});
