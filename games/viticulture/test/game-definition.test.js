import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { snapshot } from './helpers.js';

// 共通部品が渡す乱数の代わり（同じ値の並びを返す）
const createRandom = (seed) => {
    let s = seed;
    return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
};

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
        const seat = game.pending.seat;
        const ctx = ctxFor(game, seat, { type: 'choose', index: 1, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'choose', index: 1 } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.pending.seat;
        const before = snapshot(game);
        [{ type: 'choose', index: 5 }, { type: 'choose', index: '0' }, { type: 'wake', row: 0 }, { type: 'proxy' }, null, 'pass'].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'choose', index: 0 });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
    });

    it('ビューにはほかの人の手札を入れない', () => {
        const game = create();
        const view = definition.view(game, 1);
        expect(view.players[0].hand).toEqual([]);
        expect(view.players[1].hand.length).toBe(game.players[1].hand.length);
        expect(definition.spectatorView(game).players.every(p => p.hand.length === 0)).toBe(true);
    });

    it('対戦中に部屋を出た人は CPU が代わる。切断は待つ', () => {
        const game = create();
        const left = { game, ignored: false, ignore() { this.ignored = true; } };
        definition.onPlayerGone(left, { seat: 1, reason: 'disconnect' });
        expect(left.ignored).toBe(true);
        definition.onPlayerGone({ game, ignore() {} }, { seat: 1, reason: 'left' });
        expect(game.players[1].isCPU).toBe(true);
    });
});
