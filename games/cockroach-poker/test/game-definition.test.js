import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, setHand } from './helpers.js';

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
        const card = game.players[game.current].hand[0];
        const ctx = ctxFor(game, game.current, { type: 'give', card, target: (game.current + 1) % 3, claim: 'bat', extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual({ type: 'give', card, target: (game.current + 1) % 3, claim: 'bat' });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'answer', truth: true }, { type: 'proxy' }, null, 'give', { type: 'peek' }, { type: 'give', card: 'x', target: 1, claim: 'bat' }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = (game.current + 1) % 3;
        const ctx = ctxFor(game, other, { type: 'give', card: game.players[other].hand[0], target: game.current, claim: 'bat' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 2000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).loser).toBe(game.loser);
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

describe('ビューで手札と伏せたカードを隠す', () => {
    it('ほかの人の手札・除いたカード・シードは入らない', () => {
        const game = newGame(2);
        const view = definition.view(game, 1);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        expect(view.players[0].hand).toBe(null);
        expect(view.players[0].handCount).toBe(27);
        expect(view.removedCount).toBe(10);
        const json = JSON.stringify(view);
        expect(json).not.toContain('removed"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(definition.spectatorView(game).players.every(p => p.hand === null)).toBe(true);
    });

    it('伏せたカードの中身は、見た人にだけ見せる', () => {
        const game = newGame(4);
        setHand(game, 0, ['spider']);
        game.applyCommand(0, { type: 'give', card: 'spider', target: 1, claim: 'bat' });
        const cardOf = (seat) => createGameView(game, seat).round.card;
        expect(cardOf(0)).toBe('spider');
        [1, 2, 3, null].forEach(s => expect(cardOf(s), `席${s}`).toBe(null));
        [1, 2, 3, null].forEach(s => expect(JSON.stringify(createGameView(game, s).events)).not.toContain('spider'));
        // 席1が見ると、席1にも見える。回された席3には見えない
        game.applyCommand(1, { type: 'peek' });
        expect(cardOf(1)).toBe('spider');
        game.applyCommand(1, { type: 'pass', target: 3, claim: 'rat' });
        expect(cardOf(1)).toBe('spider');
        [2, 3, null].forEach(s => {
            expect(cardOf(s)).toBe(null);
            const view = createGameView(game, s);
            expect(JSON.stringify([view.round, view.events])).not.toContain('spider');
        });
        expect(createGameView(game, 3).round.seen).toEqual([0, 1]);
        // 表にしたら全員に見える
        game.applyCommand(3, { type: 'answer', truth: true });
        [0, 1, 2, 3, null].forEach(s => expect(createGameView(game, s).history.at(-1).card).toBe('spider'));
    });

    it('前に置いたカードは、全員に見せる', () => {
        const game = newGame(3);
        setHand(game, 0, ['frog']);
        game.applyCommand(0, { type: 'give', card: 'frog', target: 2, claim: 'frog' });
        game.applyCommand(2, { type: 'answer', truth: false });
        [0, 1, null].forEach(s => expect(createGameView(game, s).players[2].table).toEqual(['frog']));
    });
});
