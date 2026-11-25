import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';

const snapshot = (game) => JSON.stringify({ board: game.state.board, dice: game.state.dice, score: game.score, commands: game.commands });

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (settings) => definition.create({ players: [{ name: 'A' }, { name: 'B', isCPU: true }], random: createRandom(5), settings });
    const toHuman = (game) => {
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
    };

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        toHuman(game);
        if (game.state.phase === 'roll') definition.actions.command(ctxFor(game, 0, { type: 'roll' }));
        const steps = game.legal().plays[0].steps;
        const ctx = ctxFor(game, 0, { type: 'play', steps, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'play', steps });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        const restored = definition.restore(saved);
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.level).toBe('normal');
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        toHuman(game);
        const before = snapshot(game);
        [{ type: 'play', steps: [[24, 7]] }, { type: 'proxy' }, null, 'play', { type: 'take' }, { type: 'next' }, { type: 'play', steps: [] }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, 1, { type: 'roll' });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('設定で CPU の強さ・何点先取か・キューブを受け取る。全員 CPU なら最後まで進む', () => {
        const current = definition.settings.defaults();
        expect(current).toEqual({ level: 'normal', matchLength: 3, cube: true });
        expect(definition.settings.validate({ level: 'easy', matchLength: 7, cube: false }, current)).toEqual({ level: 'easy', matchLength: 7, cube: false });
        expect(definition.settings.validate({ level: 'x', matchLength: 4, cube: 'no' }, current)).toEqual(current);
        const game = create({ level: 'easy', matchLength: 5, cube: false });
        expect(game.level).toBe('easy');
        expect(game.options).toMatchObject({ matchLength: 5, cube: false });
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0, {}).seat).toBe(0);
        expect(definition.spectatorView(game, {}).canDouble).toBe(false);
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
