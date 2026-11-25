import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { chooseCommand, runCpuStep } from '../public/js/cpu-player.js';
import { snapshot, newGame, setHand } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、余計な項目は記録せず、記録から同じ状態を再現できる', () => {
        const game = create();
        const seat = game.current;
        const command = chooseCommand(definition.view(game, seat), 'normal', () => 0.5);
        const ctx = ctxFor(game, seat, { ...command, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual(command);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作・知らない種類・番でない人の操作は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'cheat' }, null, 'end', { type: 'attack', target: 'player' }, { type: 'buy', card: 9999 }].forEach(command => {
            const ctx = ctxFor(game, game.current, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const ctx = ctxFor(game, 1 - game.current, { type: 'end' });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 5000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 0).winner).toBe(game.winner);
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

describe('ビューで隠すもの', () => {
    it('相手の手札・山札の中身と並び・交易デッキの並び・シードは入らない', () => {
        const game = newGame(9);
        const view = definition.view(game, 1);
        expect(view.players[1].hand.map(c => c.id)).toEqual(game.players[1].hand);
        expect(view.players[0].hand).toBe(null);
        expect(view.players[0].handCount).toBe(3);
        expect(view.players[0].deckCount).toBe(game.players[0].deck.length);
        const json = JSON.stringify(view);
        ['"deck"', '"tradeDeck"', 'seed', 'cpuSalt'].forEach(word => expect(json).not.toContain(word));
        [...game.players[0].hand, ...game.players[0].deck, ...game.players[1].deck, ...game.tradeDeck]
            .forEach(id => expect(json).not.toContain(`"id":${id},"key"`)); // カードの形（プレイヤーの id とは区別する）
        expect(definition.spectatorView(game).players.every(p => p.hand === null)).toBe(true);
    });

    it('選ぶものの中身は、選ぶ人にだけ入る', () => {
        const game = newGame(10);
        const [post] = setHand(game, 0, ['tradingPost']);
        game.applyCommand(0, { type: 'play', card: post });
        expect(definition.view(game, 0).prompt.options.length).toBe(2);
        expect(definition.view(game, 1).prompt).toEqual({ kind: 'or', seat: 0 });
    });

    it('終わるまで CPU で進めても、相手の手札は入らない', () => {
        const game = newGame(11);
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!game.isOver() && steps++ < 5000) runCpuStep(game);
        expect(definition.view(game, 0).players[1].hand).toBe(null);
    });
});
