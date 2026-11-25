import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { snapshot, newGame, playGame, setCity } from './helpers.js';

// netplay-kit が行う流れ（create → 操作 → persist → restore）を、共通部品なしでなぞる
const ctxFor = (game, seat, command) => {
    const ctx = { game, seat, message: { command }, rejected: null, ignored: false };
    ctx.reject = (reason) => { ctx.rejected = reason; };
    ctx.ignore = () => { ctx.ignored = true; };
    return ctx;
};

describe('オンライン対戦のゲームの定義', () => {
    const create = () => definition.create({ players: [{ name: 'A' }, { name: 'B' }], random: createRandom(5) });

    it('操作を受け付け、記録から同じ状態を再現できる', () => {
        const game = create();
        const seat = game.actors()[0];
        const ctx = ctxFor(game, seat, { type: 'pickWonder', wonder: game.draft.offer[0], extra: 'x'.repeat(100) });
        definition.actions.command(ctx);
        expect(ctx.rejected).toBe(null);
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'wonder']); // 余計な項目は記録しない
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        expect(snapshot(definition.restore(saved))).toBe(snapshot(game));
    });

    it('通らない操作と知らない種類は断り、状態を変えない', () => {
        const game = create();
        const seat = game.actors()[0];
        const before = snapshot(game);
        [{ type: 'build', slot: 0 }, { type: 'proxy' }, null, 'pickWonder', { type: 'pickWonder', wonder: 'nothing' }].forEach(command => {
            const ctx = ctxFor(game, seat, command);
            definition.actions.command(ctx);
            expect(ctx.rejected).toBeTruthy();
        });
        const other = ctxFor(game, 1 - seat, { type: 'pickWonder', wonder: game.draft.offer[0] });
        definition.actions.command(other);
        expect(other.rejected).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の番を最後まで進められ、ビューは席ごとに作れる', () => {
        const game = create();
        game.players.forEach(p => { p.isCPU = true; });
        let steps = 0;
        while (!definition.isOver(game) && definition.cpu.needsStep(game) && steps++ < 1000) definition.cpu.step(game);
        expect(definition.isOver(game)).toBe(true);
        expect(definition.view(game, 1, { since: 0 }).winner).toBe(game.winner);
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

describe('ビューで隠す（sanitize）', () => {
    // ビューの JSON に、その文字列が入っていないか
    const hidden = (view, keys) => {
        const json = JSON.stringify(view);
        return keys.filter(k => json.includes(`"${k}"`));
    };

    it('裏のカード・抜いたカード・これからの時代の山・使わない七不思議と進歩トークン・シードは入らない', () => {
        const game = playGame(9);
        const secret = [
            ...game.structure.filter(s => !s.faceUp).map(s => s.key),
            ...game.removed[1], ...game.removed[2], ...game.removed[3],
            ...game.decks[2], ...game.decks[3],
            ...game.unusedWonders, ...game.tokensOut
        ];
        for (const seat of [0, 1, null]) {
            const view = definition.view(game, seat, {});
            expect(hidden(view, secret), String(seat)).toEqual([]);
            const json = JSON.stringify(view);
            expect(json).not.toContain('seed');
            expect(json).not.toContain('cpuSalt');
            expect(json).not.toContain('"decks"');
        }
        // 表のカードは見える
        const view = createGameView(game, 0);
        game.structure.forEach((s, i) => expect(view.structure[i].key).toBe(s.faceUp ? s.key : null));
    });

    it('時代IIIの裏のカードは、ギルドかどうかだけが分かる', () => {
        const game = playGame(9);
        game.startAge(3, 0);
        const view = createGameView(game, 1);
        game.structure.forEach((s, i) => {
            if (s.faceUp) return;
            expect(view.structure[i].key).toBe(null);
            expect(view.structure[i].back).toBe(s.key.endsWith('Guild') ? 'guild' : 'age');
        });
    });

    it('ドラフトの2回目の4枚は、1回目が終わるまで見えない', () => {
        const game = newGame(9);
        const view = createGameView(game, 1);
        expect(hidden(view, game.wonderOffers[1])).toEqual([]);
        expect(view.draft.offer).toEqual(game.wonderOffers[0]);
    });

    it('大図書館で引いた3枚は、引いた人にだけ見せる', () => {
        const game = playGame(9);
        setCity(game, 0, { coins: 30, wonders: ['greatLibrary'] });
        game.applyCommand(0, { type: 'wonder', slot: game.accessibleSlots()[0], wonder: 'greatLibrary' });
        expect(createGameView(game, 0).libraryDraw).toEqual(game.libraryDraw);
        expect(createGameView(game, 1).libraryDraw).toBe(null);
        expect(hidden(createGameView(game, 1), game.tokensOut)).toEqual([]);
        expect(hidden(createGameView(game, null), game.tokensOut)).toEqual([]);
    });

    it('できること（値段）は、番の人にだけ入る', () => {
        const game = playGame(9);
        expect(createGameView(game, 0).options).not.toBe(null);
        expect(createGameView(game, 1).options).toBe(null);
        expect(createGameView(game, null).options).toBe(null);
    });

    it('ビューは JSON にでき、ゲームの状態とつながっていない', () => {
        const game = playGame(9);
        const view = createGameView(game, 0);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        view.players[0].cards.push('palace');
        view.tokensBoard.pop();
        expect(game.players[0].cards).toEqual([]);
        expect(game.tokensBoard).toHaveLength(5);
    });

    it('since より後のログだけを入れる', () => {
        const game = playGame(9);
        const all = createGameView(game, 0).logs;
        expect(createGameView(game, 0, { since: 2 }).logs).toEqual(all.slice(2));
    });
});
