import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, C } from './helpers.js';

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

    it('遊び方と難しさの設定を受け、知らない値は前の値のままにする', () => {
        expect(create({ mode: 'experienced', level: 'heroic' }).hazmats.length).toBe(5);
        expect(create().options.mode).toBe('family');
        expect(definition.settings.validate({ mode: 'x', level: 'y' }, { mode: 'family', level: 'veteran' })).toEqual({ mode: 'family', level: 'veteran' });
    });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const ctx = ctxFor(game, 0, { type: 'place', cell: C(3, 0), extra: 'x'.repeat(50) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'cell']);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'place', cell: C(3, 0) }, { type: 'end' }, { type: 'nope' }, null, 'end'].forEach(command => {
            const ctx = ctxFor(game, 1, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ビューにシードと印の正体を入れない', () => {
        const game = create({ mode: 'experienced', level: 'recruit' });
        const text = JSON.stringify(definition.view(game, 0, {}));
        expect(text).not.toContain('"seed"');
        expect(text).not.toContain('poiPool');
        expect(definition.view(game, 0, {}).pois.every(x => x.victim === null)).toBe(true);
        expect(JSON.stringify(definition.spectatorView(game, {}))).not.toContain('"seed"');
    });

    it('全員 CPU なら最後まで進む', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 6000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0, {}).result).toEqual(game.result);
    });

    it('対戦中に部屋を出た人の席は CPU が続け、保存して読み直しても CPU のまま', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(restored.players[0].isCPU).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
    });
});
