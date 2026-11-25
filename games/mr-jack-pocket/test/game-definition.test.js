import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { chooseCommand, runCpuStep } from '../public/js/cpu-player.js';
import { JACK, DETECTIVE } from '../public/js/game.js';
import { SUSPECTS } from '../public/js/data.js';
import { snapshot, newGame, setFaces } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'J' }, { name: 'D', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、余計な項目は記録せず、記録から同じ状態を再現できる', () => {
        const game = create();
        const command = chooseCommand(definition.view(game, DETECTIVE), 'normal', () => 0.5);
        const ctx = ctxFor(game, DETECTIVE, { ...command, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1).command).toEqual(command);
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作・知らない種類・番でない人の操作は断り、状態を変えない', () => {
        const game = create();
        const before = snapshot(game);
        [{ type: 'peek' }, null, 'alibi', { type: 'move', who: 'holmes', steps: 5 }].forEach(command => {
            const ctx = ctxFor(game, DETECTIVE, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const ctx = ctxFor(game, JACK, chooseCommand({ ...definition.view(game, DETECTIVE), you: JACK, answering: [JACK] }, 'easy', () => 0));
        definition.actions.command(ctx);
        expect(ctx.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 100) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, DETECTIVE).winner).toBe(game.winner);
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
    it('ジャックの正体・アリバイの山・ジャック側の札は、刑事側と観戦者に入らない', () => {
        const game = newGame(9);
        // 偶数ラウンドにして、ジャック側にアリバイを引かせる
        setFaces(game, ['holmes', 'watson', 'rotate', 'joker']);
        game.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 1 });
        game.applyCommand(JACK, { type: 'move', who: 'watson', steps: 1 });
        game.applyCommand(JACK, { type: 'joker', who: 'toby', steps: 0 });
        game.applyCommand(DETECTIVE, { type: 'rotate', tile: 4, rot: (game.tiles[4].rot + 1) % 4 });
        if (!game.isOver()) expect(game.applyCommand(JACK, { type: 'alibi' })).toBe(true);
        const card = game.jackCards[0];
        for (const view of [definition.view(game, DETECTIVE), definition.spectatorView(game)]) {
            expect(view.jack).toBe(null);
            expect(view.jackCards).toBe(null);
            expect(view.totalHourglasses).toBe(null);
            expect(view.jackCardCount).toBe(1);
            const json = JSON.stringify(view);
            expect(json).not.toContain('"deck"');
            expect(json).not.toContain('seed');
            expect(json).not.toContain('cpuSalt');
            // ジャック側の札の名前は、出来事にもログにも入らない（盤のタイルとしては出る）
            expect(JSON.stringify(view.events)).not.toContain(card);
            expect(view.logs.join('')).not.toContain(SUSPECTS.find(x => x.key === card).name);
        }
        const mine = definition.view(game, JACK);
        expect(mine.jack).toBe(game.jack);
        expect(mine.jackCards).toEqual([card]);
        expect(mine.deckCount).toBe(game.deck.length);
    });

    it('終わったら、正体と札を全員に見せる', () => {
        const game = newGame(10);
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!game.isOver() && steps++ < 100) runCpuStep(game);
        const view = definition.view(game, DETECTIVE);
        expect(view.jack).toBe(game.jack);
        expect(view.jackCards).toEqual(game.jackCards);
    });
});
