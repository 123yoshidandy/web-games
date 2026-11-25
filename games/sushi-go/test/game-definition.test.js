import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, pickAll, setHand } from './helpers.js';

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
        const card = game.players[0].hand[0];
        const ctx = ctxFor(game, 0, { type: 'pick', card, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'pick', card });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'pick', card: 'nothing' }, { type: 'proxy' }, null, 'pick', { type: 'pick' }].forEach(command => {
            const ctx = ctxFor(game, 0, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 2000) definition.cpu.step(game);
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

describe('ビューで手札と選んだ札を隠す', () => {
    it('ほかの人の手札・山・シードは入らない', () => {
        const game = newGame(4);
        const view = createGameView(game, 1);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        [0, 2, 3].forEach(s => {
            expect(view.players[s].hand).toBe(null);
            expect(view.players[s].handCount).toBe(8);
        });
        const json = JSON.stringify(view);
        expect(json).not.toContain('"deck"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(createGameView(game, null).players.every(p => p.hand === null)).toBe(true);
    });

    it('選んだ札は、全員がそろうまで本人にだけ見せる', () => {
        const game = newGame(3);
        setHand(game, 0, ['squid', 'egg', 'tempura']);
        setHand(game, 1, ['dumpling', 'egg', 'tempura']);
        setHand(game, 2, ['maki3', 'egg', 'tempura']);
        game.applyCommand(0, { type: 'pick', card: 'squid' });
        expect(createGameView(game, 0).players[0].pick).toEqual(['squid']);
        [1, 2, null].forEach(s => {
            const v = createGameView(game, s);
            expect(v.players[0].pick).toBe(null);
            expect(v.players[0].picked).toBe(true);
            expect(JSON.stringify(v)).not.toContain('squid');
        });
        game.applyCommand(1, { type: 'pick', card: 'dumpling' });
        game.applyCommand(2, { type: 'pick', card: 'maki3' });
        // そろったら、場に出て全員に見える
        expect(createGameView(game, 1).players[0].tableau).toEqual([{ type: 'squid' }]);
    });

    it('2人のとき、選んだ札は相手に渡す手札の中身から分かってしまわない（渡すのは表にしたあと）', () => {
        const game = newGame(2);
        setHand(game, 0, ['squid', 'egg', 'tempura']);
        setHand(game, 1, ['dumpling', 'egg', 'tempura']);
        game.applyCommand(0, { type: 'pick', card: 'squid' });
        expect(createGameView(game, 1).players[0].handCount).toBe(3);
        pickAll(game.players[1].picked ? game : game, []);
        game.applyCommand(1, { type: 'pick', card: 'dumpling' });
        expect(createGameView(game, 1).players[1].hand.sort()).toEqual(['egg', 'tempura']);
    });
});
