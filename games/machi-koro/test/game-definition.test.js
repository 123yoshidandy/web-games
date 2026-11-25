import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, setCity, fixDice, newGame } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const ctx = ctxFor(game, game.current, { type: 'roll', dice: 1, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'roll', dice: 1 }); // 余計な項目は記録しない
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'roll', dice: 2 }, { type: 'proxy' }, null, 'roll', { type: 'pass' }, { type: 'build', card: 'wheat' }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, (game.current + 1) % 3, { type: 'roll', dice: 1 });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められ、ビューは席ごとに作れる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 5000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        const view = definition.view(game, 1, { since: 0 });
        expect(view.you).toBe(1);
        expect(view.winner).toBe(game.winner);
        expect(definition.spectatorView(game, {}).you).toBe(null);
    });

    it('対戦中に部屋を出た人の席は CPU が続ける', () => {
        const game = create();
        definition.onPlayerGone(ctxFor(game, null, null), { seat: 0, reason: 'left' });
        expect(game.players[0].isCPU).toBe(true);
        const ctx = ctxFor(game, null, null);
        definition.onPlayerGone(ctx, { seat: 1, reason: 'disconnected' });
        expect(ctx.ignored).toBe(true);
        expect(game.players[1].isCPU).toBe(false);
    });
});

describe('ビュー', () => {
    it('できることは、その人の番にだけ入る', () => {
        const game = newGame(3);
        setCity(game, 0, { landmarks: ['station'], coins: 5 });
        expect(createGameView(game, 0).canRollTwo).toBe(true);
        expect(createGameView(game, 1).canRollTwo).toBe(false);
        fixDice(game, 5);
        game.applyCommand(0, { type: 'roll', dice: 1 });
        const mine = createGameView(game, 0);
        expect(mine.buildable).toContain('cafe');
        expect(mine.buildable).not.toContain('mine');
        expect(createGameView(game, 1).buildable).toEqual([]);
        expect(createGameView(game, null).buildable).toEqual([]);
    });

    it('JSON にでき、ゲームの状態とつながっていない', () => {
        const game = newGame(2);
        const view = createGameView(game, 0);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        view.players[0].cards.wheat = 99;
        view.supply.mine = 0;
        expect(game.players[0].cards.wheat).toBe(1);
        expect(game.supply.mine).toBe(6);
    });

    it('since より後のログだけを入れる', () => {
        const game = newGame(2);
        game.applyCommand(0, { type: 'roll', dice: 1 });
        const all = createGameView(game, 0).logs;
        expect(createGameView(game, 0, { since: 1 }).logs).toEqual(all.slice(1));
    });
});
