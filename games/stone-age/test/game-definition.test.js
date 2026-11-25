import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { CIV_CARDS } from '../public/js/cards.js';
import { snapshot, newGame, setRes, run, place, resolve } from './helpers.js';

const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isCPU: true }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = create();
        const seat = game.current;
        const ctx = ctxFor(game, seat, { type: 'place', place: 'hunt', count: 2, extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(game.commands.at(-1)).toEqual({ playerId: seat, command: { type: 'place', place: 'hunt', count: 2 } });
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.current;
        const before = snapshot(game);
        [{ type: 'place', place: 'hunt', count: 0 }, { type: 'place', place: 'moon', count: 1 }, { type: 'proxy' }, null, 'place',
            { type: 'pay', pay: { wood: 1 } }, { type: 'place', place: 'hunt', count: '2' }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected, JSON.stringify(command)).toBeTruthy();
        });
        const other = ctxFor(game, (seat + 1) % 3, { type: 'place', place: 'hunt', count: 1 });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('sanitize は種類ごとの項目だけを残す', () => {
        expect(sanitize({ type: 'pay', pay: { wood: 1, food: 9 }, extra: 1 })).toEqual({ type: 'pay', pay: { wood: 1, clay: 0, stone: 0, gold: 0 } });
        expect(sanitize({ type: 'tools', tools: [0, 1], oneUse: [32], x: 1 })).toEqual({ type: 'tools', tools: [0, 1], oneUse: [32] });
        expect(sanitize({ type: 'feed', pay: null })).toEqual({ type: 'feed', pay: null });
        expect(sanitize({ type: 'decline', seat: 3 })).toEqual({ type: 'decline' });
        expect(sanitize({ type: 'proxy' })).toBe(null);
    });

    it('CPU の番を最後まで進められる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; p.cpuLevel = 'normal'; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 3000) definition.cpu.step(game);
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

describe('ビューで山の並びと伏せたカードを隠す', () => {
    it('文明カードの山は枚数だけ、建物の山は表の1枚と枚数だけ。シードと CPU の値は入らない', () => {
        const game = newGame(4);
        const view = createGameView(game, 1);
        expect(view.civDeckCount).toBe(32);
        expect(view.stacks).toEqual(game.stacks.map(s => ({ top: s[0], count: 7 })));
        const json = JSON.stringify(view);
        expect(json).not.toContain('civDeck"');
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        // 山の2枚目以降の建物の番号が、どこにも出ない（ログとイベントを除く）
        const { logs, events, ...rest } = view;
        const second = game.stacks[0][1];
        expect(JSON.stringify(rest.stacks)).not.toContain(`"top":${second},`);
        expect(createGameView(game, null).placements).toEqual([]);
    });

    it('追加のカードで伏せて取ったカードは、本人にだけ見せる', () => {
        const game = newGame(2);
        game.civSlots[0] = CIV_CARDS.find(c => c.top.kind === 'extra').id;
        setRes(game, 0, { wood: 1 });
        run(game, [[0, place('civ0')], [1, place('hunt', 5)], [0, place('hunt', 4)], [0, resolve('civ0')], [0, { type: 'pay', pay: { wood: 1 } }]]);
        const hidden = game.players[0].hidden[0];
        expect(createGameView(game, 0).players[0].cards).toContain(hidden);
        const other = createGameView(game, 1).players[0];
        expect(other.cards).not.toContain(hidden);
        expect(other.hiddenCount).toBe(1);
        expect(other.hidden).toEqual([]);
        expect(createGameView(game, null).players[0].cards).not.toContain(hidden);
    });

    it('置ける場所と使える場所は、操作する本人にだけ入る', () => {
        const game = newGame(2);
        expect(createGameView(game, 0).placements.length).toBeGreaterThan(0);
        expect(createGameView(game, 1).placements).toEqual([]);
    });
});
