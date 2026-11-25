import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, arrange, playUntil } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }, { name: 'D' }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const seat = game.actors()[0];
        const ctx = ctxFor(game, seat, { type: 'pick', character: game.draftOptions()[0], extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'character']);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'gold' }, { type: 'proxy' }, null, 'pick', { type: 'pick', character: 'nobody' }, { type: 'end' }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 4, { type: 'pick', character: game.draftOptions()[0] });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 6000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winner).toBe(game.winner);
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
    it('ほかの人の手札・山・伏せた役割・シードは入らない', () => {
        const game = newGame(4);
        const view = createGameView(game, 1);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        [0, 2, 3].forEach(s => {
            expect(view.players[s].hand).toBe(null);
            expect(view.players[s].handCount).toBe(4);
        });
        const json = JSON.stringify(view);
        expect(json).not.toContain('"deck"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(json).not.toContain('faceDown"');
        expect(json).not.toContain(game.draft.faceDown[0]);
        expect(createGameView(game, null).players.every(p => p.hand === null)).toBe(true);
    });

    it('役割の候補は、選んでいる本人にだけ。表で捨てた役割は全員に見せる', () => {
        const game = newGame(4);
        expect(createGameView(game, 0).draft.options).toEqual(game.draft.available);
        expect(createGameView(game, 1).draft.options).toBe(null);
        expect(createGameView(game, null).draft.options).toBe(null);
        [0, 1, null].forEach(s => expect(createGameView(game, s).draft.faceUp).toEqual(game.draft.faceUp));
    });

    it('選んだ役割は、明かされるまで本人にだけ見せる', () => {
        const game = newGame(4);
        arrange(game, { 0: ['king'], 2: ['warlord'] });
        expect(createGameView(game, 0).players[0].characters).toEqual(['king']);
        expect(createGameView(game, 1).players[0].characters).toEqual([]);
        expect(createGameView(game, 1).players[0].characterCount).toBe(1);
        playUntil(game, 'king');
        expect(createGameView(game, 1).players[0].characters).toEqual(['king']);
        expect(createGameView(game, 1).players[2].characters).toEqual([]);
        expect(JSON.stringify(createGameView(game, 1).players[2])).not.toContain('warlord');
    });

    it('自分が選んだときに見た候補は、本人にだけ', () => {
        const game = newGame(4);
        game.applyCommand(0, { type: 'pick', character: game.draftOptions()[0] });
        game.applyCommand(1, { type: 'pick', character: game.draftOptions()[0] });
        expect(createGameView(game, 1).draft.offers).toHaveLength(1);
        expect(createGameView(game, 2).draft.offers).toHaveLength(1); // 選ぶ番が来た時点で候補を見ている
        expect(createGameView(game, 3).draft.offers).toHaveLength(0);
        expect(createGameView(game, null).draft.offers).toHaveLength(0);
    });

    it('行動で引いた札は、本人にだけ見せる', () => {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'] });
        playUntil(game, 'bishop');
        game.applyCommand(0, { type: 'draw' });
        expect(createGameView(game, 0).drawn).toEqual(game.drawn);
        expect(createGameView(game, 1).drawn).toBe(null);
        expect(createGameView(game, 1).drawnCount).toBe(2);
        expect(createGameView(game, 1).events.find(e => e.type === 'drawOffer').cards).toBeUndefined();
        expect(createGameView(game, 0).events.find(e => e.type === 'drawOffer').cards).toEqual(game.drawn);
    });
});
