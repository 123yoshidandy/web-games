import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => {
        const game = definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });
        // 占いで選ぶものがあれば、先に答えておく
        game.players.forEach(p => {
            while (p.prompts.length > 0) game.applyCommand(p.id, { type: 'choose', option: p.prompts[0].options[0].key });
        });
        return game;
    };

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        expect(game.phase).toBe('brew');
        const ctx = ctxFor(game, 0, { type: 'draw', extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'draw' });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('できない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [[0, { type: 'shop', buy: [] }], [0, { type: 'proxy' }], [0, null], [0, 'draw'], [5, { type: 'draw' }]].forEach(([seat, command]) => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ほかの人の選択とカラスで引いた材料は送らない', () => {
        const game = create();
        game.players[1].bag = ['B2', 'O1', 'G1'];
        game.players[1].random = () => 0;
        game.applyCommand(1, { type: 'draw' });
        expect(definition.view(game, 1, {}).me.pending.chips).toEqual(['O1', 'G1']);
        const other = definition.view(game, 0, {});
        expect(JSON.stringify(other.players[1])).not.toContain('pending');
        expect(other.me.pending).toBe(null);
        expect(definition.spectatorView(game, {}).me).toBe(null);
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 20000) definition.cpu.step(game);
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
