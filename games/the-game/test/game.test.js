import { describe, it, expect } from 'vitest';
import Game, { canPlace, handSizeFor, CARD_COUNT } from '../public/js/game.js';
import { runCpuStep, chooseMove } from '../public/js/cpu.js';

const players = (n, isCPU = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU }));

// 手札と山を決めて試す（ルールの確認用。記録の再現には使わない）
function rigged(n, hands, piles) {
    const game = new Game(players(n), { seed: 1 });
    hands.forEach((hand, seat) => { game.hands[seat] = [...hand]; });
    if (piles) piles.forEach((top, i) => { game.piles[i].top = top; });
    return game;
}

const snapshot = game => JSON.stringify({ hands: game.hands, deck: game.deck, piles: game.piles, signals: game.signals, current: game.current, played: game.played, phase: game.phase, logs: game.logs });

function playOut(game) {
    game.players.forEach(p => { p.isCPU = true; });
    for (let i = 0; i < 3000 && !game.isOver; i++) if (!runCpuStep(game)) break;
    return game;
}

describe('準備', () => {
    it('2〜99 の98枚を使い、人数で手札の枚数が決まる', () => {
        expect(CARD_COUNT).toBe(98);
        expect([1, 2, 3, 4, 5].map(handSizeFor)).toEqual([8, 7, 6, 6, 6]);
        for (const n of [1, 2, 3, 5]) {
            const game = new Game(players(n), { seed: 7 });
            game.hands.forEach(hand => expect(hand).toHaveLength(handSizeFor(n)));
            const all = [...game.deck, ...game.hands.flat()].sort((a, b) => a - b);
            expect(all).toEqual(Array.from({ length: 98 }, (_, i) => i + 2));
        }
    });

    it('山は上り2つ（1から）と下り2つ（100から）', () => {
        const game = new Game(players(3), { seed: 1 });
        expect(game.piles.map(p => [p.dir, p.top])).toEqual([['up', 1], ['up', 1], ['down', 100], ['down', 100]]);
    });

    it('同じシードなら同じ配り方', () => {
        expect(snapshot(new Game(players(4), { seed: 42 }))).toBe(snapshot(new Game(players(4), { seed: 42 })));
        expect(snapshot(new Game(players(4), { seed: 42 }))).not.toBe(snapshot(new Game(players(4), { seed: 43 })));
    });
});

describe('出し方', () => {
    it('上りは大きいカード、下りは小さいカード。ちょうど10戻すカードは逆向きでも出せる', () => {
        expect(canPlace({ dir: 'up', top: 30 }, 31)).toBe(true);
        expect(canPlace({ dir: 'up', top: 30 }, 29)).toBe(false);
        expect(canPlace({ dir: 'up', top: 30 }, 20)).toBe(true);
        expect(canPlace({ dir: 'up', top: 30 }, 19)).toBe(false);
        expect(canPlace({ dir: 'down', top: 60 }, 59)).toBe(true);
        expect(canPlace({ dir: 'down', top: 60 }, 61)).toBe(false);
        expect(canPlace({ dir: 'down', top: 60 }, 70)).toBe(true);
        expect(canPlace({ dir: 'down', top: 60 }, 71)).toBe(false);
    });

    it('10戻しは記録され、山の一番上が戻る', () => {
        const game = rigged(3, [[20, 30, 40, 50, 60, 70]], [30, 1, 100, 100]);
        expect(game.applyCommand(0, { type: 'play', card: 20, pile: 0 })).toBe(true);
        expect(game.piles[0].top).toBe(20);
        expect(game.backs).toBe(1);
        expect(game.lastMove.back).toBe(true);
    });

    it('番の人は2枚以上出してから番を終え、手札の上限まで引く', () => {
        const game = new Game(players(3), { seed: 5 });
        const deck = game.deck.length;
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        const [first] = game.legalPlays(0);
        expect(game.applyCommand(0, { type: 'play', ...first })).toBe(true);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        const [second] = game.legalPlays(0);
        game.applyCommand(0, { type: 'play', ...second });
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.hands[0]).toHaveLength(6);
        expect(game.deck.length).toBe(deck - 2);
        expect(game.current).toBe(1);
    });

    it('番でない人はカードを出せず、出せないカード・手札にないカード・知らない山は断られて状態は変わらない', () => {
        const game = rigged(3, [[10, 20, 30, 40, 50, 60]], [50, 1, 100, 100]);
        const before = snapshot(game);
        const bad = [
            [1, { type: 'play', card: game.hands[1][0], pile: 1 }],
            [0, { type: 'play', card: 30, pile: 0 }],
            [0, { type: 'play', card: 99, pile: 1 }],
            [0, { type: 'play', card: 60, pile: 7 }],
            [0, { type: 'nope' }],
            [0, null],
            [9, { type: 'end' }],
            [0, { type: 'signal', pile: 0, mark: 'maybe' }]
        ];
        for (const [seat, command] of bad) expect(game.applyCommand(seat, command)).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.commands).toHaveLength(0);
    });

    it('山札が空なら1枚で番を終えられる', () => {
        const game = rigged(2, [[50, 60], [70]], [40, 1, 100, 100]);
        game.deck = [];
        expect(game.required).toBe(1);
        game.applyCommand(0, { type: 'play', card: 50, pile: 0 });
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.current).toBe(1);
    });

    it('手札のない人は飛ばす', () => {
        const game = rigged(3, [[50], [], [60]], [40, 1, 100, 100]);
        game.deck = [];
        game.applyCommand(0, { type: 'play', card: 50, pile: 0 });
        game.applyCommand(0, { type: 'end' });
        expect(game.current).toBe(2);
    });
});

describe('終わり方', () => {
    it('全部出し切ったら勝ち（残り0）', () => {
        const game = rigged(2, [[50], []], [40, 1, 100, 100]);
        game.deck = [];
        game.applyCommand(0, { type: 'play', card: 50, pile: 0 });
        expect(game.isOver).toBe(true);
        expect(game.result).toMatchObject({ win: true, remaining: 0, excellent: true });
    });

    it('番の人が決まった枚数を出せなければ終わり。残りは山札と全員の手札', () => {
        // 上りは 96・97、下りは 30・20。手札はどこにも出せない
        const stuck = rigged(3, [[45, 55, 65, 75, 85, 95]], [96, 97, 30, 20]);
        stuck.checkState();
        expect(stuck.isOver).toBe(true);
        expect(stuck.result.win).toBe(false);
        expect(stuck.result.remaining).toBe(stuck.deck.length + 18);
    });

    it('1枚出したあとに2枚目が出せなければ、そこで終わる', () => {
        const game = rigged(3, [[98, 50, 51, 52, 53, 54]], [97, 97, 10, 10]);
        expect(game.applyCommand(0, { type: 'play', card: 98, pile: 0 })).toBe(true);
        expect(game.isOver).toBe(true);
        expect(game.result.excellent).toBe(false);
    });

    it('終わったあとの操作は断る', () => {
        const game = playOut(new Game(players(3), { seed: 3 }));
        expect(game.isOver).toBe(true);
        expect(game.applyCommand(game.current, { type: 'end' })).toBe(false);
        expect(game.applyCommand(0, { type: 'signal', pile: 0, mark: 'stop' })).toBe(false);
    });
});

describe('合図', () => {
    it('番でなくても置け、外せる。同じ合図は断る', () => {
        const game = new Game(players(3), { seed: 1 });
        expect(game.applyCommand(2, { type: 'signal', pile: 1, mark: 'stop' })).toBe(true);
        expect(game.signals[2]).toEqual([null, 'stop', null, null]);
        expect(game.applyCommand(2, { type: 'signal', pile: 1, mark: 'stop' })).toBe(false);
        expect(game.applyCommand(2, { type: 'signal', pile: 1, mark: 'good' })).toBe(true);
        expect(game.applyCommand(2, { type: 'signal', pile: 1, mark: null })).toBe(true);
        expect(game.signals[2]).toEqual([null, null, null, null]);
    });

    it('CPU は合図のある山に大きく飛ばして出すのを避ける', () => {
        const game = rigged(2, [[40, 41, 90, 91, 92, 93, 94], [12, 13, 14, 15, 16, 17, 18]], [10, 10, 100, 100]);
        game.players[0].isCPU = true;
        const free = chooseMove(game, 0, 'normal');
        game.signals[1][free.pile] = 'stop';
        const avoided = chooseMove(game, 0, 'normal');
        expect(avoided.pile).not.toBe(free.pile);
    });
});

describe('記録からの再現', () => {
    it('CPU だけで最後まで遊んだ記録から、同じ局面になる', () => {
        for (const n of [1, 3, 5]) {
            const game = playOut(new Game(players(n), { seed: 11 + n }));
            expect(game.isOver).toBe(true);
            const again = Game.replay(players(n, true), { seed: 11 + n }, JSON.parse(JSON.stringify(game.commands)));
            expect(snapshot(again)).toBe(snapshot(game));
            expect(again.result).toEqual(game.result);
        }
    });

    it('途中までの記録からも同じ局面になり、続きが遊べる', () => {
        const game = playOut(new Game(players(4), { seed: 21 }));
        const half = game.commands.slice(0, Math.floor(game.commands.length / 2));
        const a = Game.replay(players(4), { seed: 21 }, half);
        const b = Game.replay(players(4), { seed: 21 }, half);
        expect(snapshot(a)).toBe(snapshot(b));
        expect(playOut(a).isOver).toBe(true);
    });

    it('通らない操作が入った記録は再現できない', () => {
        expect(() => Game.replay(players(2), { seed: 1 }, [{ seat: 1, command: { type: 'end' } }])).toThrow();
    });
});
