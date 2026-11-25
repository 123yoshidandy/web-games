import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { chooseCommand, runCpuStep } from '../public/js/cpu-player.js';
import { snapshot, newGame } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = (n = 3) => definition.create({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i === n - 1 })), random: createRandom(5) });

    it('操作を受け付け、余計な項目は記録せず、記録から同じ状態を再現できる', () => {
        const game = create();
        const command = chooseCommand(definition.view(game, game.current), 'normal', () => 0.5);
        const ctx = ctxFor(game, game.current, { ...command, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual(command);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'support', count: 1 }, { type: 'proxy' }, null, 'tile', { type: 'tile', color: 'red', cell: -1 }, { type: 'catastrophe', cell: game.treasures[0] }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = (game.current + 1) % 3;
        const ctx = ctxFor(game, other, { type: 'pass' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
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

describe('ビューで手札・袋・点を隠す', () => {
    it('ほかの人の手札・点・宝物、袋の並び・シードは入らない', () => {
        const game = newGame(3);
        game.players[0].scores.red = 4;
        game.players[0].treasures = 2;
        const view = definition.view(game, 1);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        expect(view.players[1].scores).toEqual(game.players[1].scores);
        [0, 2].forEach(s => {
            expect(view.players[s].hand).toBe(null);
            expect(view.players[s].handCount).toBe(6);
            expect(view.players[s].scores).toBe(null);
            expect(view.players[s].treasures).toBe(null);
        });
        expect(view.bagCount).toBe(game.bag.length);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"bag"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        const spectator = definition.spectatorView(game);
        expect(spectator.players.every(p => p.hand === null && p.scores === null)).toBe(true);
    });

    it('終わったら、全員の点と宝物を見せる', () => {
        const game = newGame(2);
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!game.isOver() && steps++ < 3000) runCpuStep(game);
        const view = definition.view(game, 0);
        expect(view.players[1].scores).toEqual(game.players[1].scores);
        expect(view.players[1].treasures).toBe(game.players[1].treasures);
        expect(view.players[1].hand).toBe(null);
    });

    it('出来事にも、手札の中身は入らない', () => {
        const game = newGame(2);
        const hand = [...game.players[0].hand];
        game.applyCommand(0, { type: 'swap', tiles: hand.slice(0, 3) });
        const events = JSON.stringify(definition.view(game, 1).events);
        expect(events).not.toContain('tiles');
        expect(events).toContain('"count":3');
    });
});
