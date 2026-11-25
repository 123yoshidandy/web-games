import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { OPEN_CELLS } from '../public/js/board.js';
import { snapshot } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

const create = (n = 3, options = { setup: 'beginner' }) => definition.create({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i === n - 1 })), random: createRandom(5), options });

describe('オンライン対戦のゲームの定義', () => {
    it('操作を受け付け、記録には決まった項目だけを残し、記録から同じ状態を再現できる', () => {
        const game = create();
        const ctx = ctxFor(game, game.current, { type: 'place', hand: 0, cell: OPEN_CELLS[0], extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'place', hand: 0, cell: OPEN_CELLS[0] });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'take', market: 0 }, { type: 'goals', pick: [0, 1, 2] }, { type: 'proxy' }, null, 'place', { type: 'place', hand: 0, cell: 0 }, { type: 'place', hand: 5, cell: OPEN_CELLS[0] }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        const other = (game.current + 1) % 3;
        const ctx = ctxFor(game, other, { type: 'place', hand: 0, cell: OPEN_CELLS[0] });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('準備を選べる（正しくない値はふつう）', () => {
        expect(create(2, { setup: 'beginner' }).options.setup).toBe('beginner');
        expect(create(2, { setup: 'zzz' }).options.setup).toBe('standard');
        expect(create(2, {}).phase).toBe('goals');
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create(2, { setup: 'standard' });
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'easy'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 200) definition.cpu.step(game);
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

describe('ビューで袋の順と手札を隠す（sanitize）', () => {
    it('自分の手札だけが見え、ほかの人の手札と袋は枚数だけ。シードと cpuSalt は入らない', () => {
        const game = create(3);
        const view = definition.view(game, 1);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        expect(view.players[0].hand).toBe(null);
        expect(view.players[0].handCount).toBe(2);
        expect(view.bagCount).toBe(game.bag.length);
        const json = JSON.stringify(view);
        ['"bag"', 'seed', 'cpuSalt', 'random', 'discarded'].forEach(word => expect(json).not.toContain(word));
        expect(json).not.toContain(JSON.stringify(game.bag.slice(0, 3)));
        const spectator = definition.spectatorView(game);
        expect(spectator.players.every(p => p.hand === null)).toBe(true);
        expect(JSON.stringify(spectator)).not.toContain('seed');
    });

    it('袋の引く順とほかの人の手札が違っても、ビューは同じ（隠すべき情報が漏れていない）', () => {
        const a = create(2);
        const b = create(2);
        b.bag.reverse();
        const [x, y] = b.players[1].hand;
        b.players[1].hand = [b.bag[0], b.bag[1]];
        b.bag.splice(0, 2, x, y);
        expect(JSON.stringify(definition.view(b, 0))).toBe(JSON.stringify(definition.view(a, 0)));
    });

    it('目標を選ぶ間は、ほかの人に配られた目標と選んだ目標が見えない', () => {
        const game = create(2, { setup: 'standard' });
        expect(game.applyCommand(0, { type: 'goals', pick: [3, 1, 0] })).toBe(true);
        const view = definition.view(game, 1);
        expect(view.players[0].offered).toBe(null);
        expect(view.players[0].goals).toBe(null);
        expect(view.players[0].chosen).toBe(true);
        expect(view.players[1].offered).toEqual(game.players[1].offered);
        expect(game.applyCommand(1, { type: 'goals', pick: [0, 1, 2] })).toBe(true);
        expect(definition.view(game, 1).players[0].goals).toEqual(game.players[0].goals);
    });
});
