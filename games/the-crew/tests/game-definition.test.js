import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { suggest } from '../public/js/cpu.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};
const snapshot = (game) => JSON.stringify(definition.persist(game)) + JSON.stringify(definition.view(game, 0));

describe('オンライン対戦のゲームの定義', () => {
    const create = (n = 3) => definition.create({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const seat = game.current;
        const command = suggest(game, seat);
        const ctx = ctxFor(game, seat, { ...command, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual(command); // 余計な項目は記録しない
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'play', card: 'nope' }, { type: 'proxy' }, null, 'play', { type: 'pickTask', index: 99 }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (game.current + 1) % 3, suggest(game, game.current));
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('ほかの人の手札は、ビューに入らない', () => {
        const game = create();
        const view = definition.view(game, 0);
        expect(view.hand).toEqual(game.hands[0]);
        // 課題のカードは公開なので、手札と同じ名前のカードが出ることがある。手札の並びそのものが入らないことを確かめる
        [1, 2].forEach(seat => expect(JSON.stringify(view)).not.toContain(JSON.stringify(game.hands[seat])));
        expect(definition.view(game, 1).hand).toEqual(game.hands[1]);
        expect(definition.spectatorView(game).hand).toEqual([]);
    });

    it('CPU で最後まで進められる（2人なら JARVIS も）', () => {
        [2, 4].forEach(n => {
            const game = create(n);
            game.players.forEach(p => { p.isCPU = true; });
            let steps = 0;
            while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 5000) definition.cpu.step(game);
            expect(definition.isOver(game)).toBe(true);
        });
    });

    it('対戦中に部屋を出た人の席は CPU が続ける', () => {
        const game = create();
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const ctx2 = ctxFor(game, null, null);
        definition.onPlayerGone(ctx2, { seat: 1, reason: 'disconnected' });
        expect(ctx2.ignored).toBe(true);
        expect(game.players[1].isCPU).toBe(false);
    });
});
