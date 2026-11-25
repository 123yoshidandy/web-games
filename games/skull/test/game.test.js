import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';

const players = (n = 3) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 }));
const snapshot = (g) => JSON.stringify({ players: g.players, phase: g.phase, current: g.current, bid: g.bid, passed: g.passed, commands: g.commands });

// 最初の人が席0になるシードで作る
function newGame(n = 3) {
    for (let seed = 1; ; seed++) {
        const g = new Game(players(n), { seed });
        if (g.start === 0) return g;
    }
}
const place = (g, seat, disc = 'F') => g.applyCommand(seat, { type: 'place', disc });
// 全員が1枚伏せる（discs は席ごとの札）
function ante(g, discs) {
    g.players.forEach((p, s) => { if (!p.out) place(g, s, discs?.[s] ?? 'F'); });
}

describe('伏せる', () => {
    it('全員が1枚伏せてから、最初の人の手番になる', () => {
        const g = newGame();
        expect(g.phase).toBe('ante');
        expect(g.actors()).toEqual([0, 1, 2]);
        expect(g.applyCommand(0, { type: 'challenge', bid: 1 })).toBe(false);
        place(g, 1, 'S');
        expect(place(g, 1)).toBe(false); // 2枚目は手番で
        place(g, 0);
        place(g, 2);
        expect(g.phase).toBe('turn');
        expect(g.current).toBe(0);
        expect(g.players[1].stack).toEqual(['S']);
    });

    it('手番には、手札から伏せて次の人へ。持っていない札は伏せられない', () => {
        const g = newGame();
        ante(g, ['S', 'F', 'F']);
        expect(place(g, 0, 'S')).toBe(false);
        expect(place(g, 0, 'F')).toBe(true);
        expect(g.current).toBe(1);
        expect(g.hand(0)).toEqual({ F: 2, S: 0 });
    });

    it('手札がなければ、挑戦しかできない', () => {
        const g = newGame();
        ante(g);
        for (let i = 0; i < 3; i++) for (let s = 0; s < 3; s++) place(g, s, i < 2 ? 'F' : 'S');
        expect(g.handCount(0)).toBe(0);
        expect(place(g, 0)).toBe(false);
        expect(g.applyCommand(0, { type: 'challenge', bid: 3 })).toBe(true);
    });
});

describe('挑戦と数の上げ下げ', () => {
    it('宣言は 1〜伏せた札の合計。上げるかパスし、1人だけ残ったらめくる', () => {
        const g = newGame();
        ante(g);
        place(g, 0);
        expect(g.applyCommand(1, { type: 'challenge', bid: 0 })).toBe(false);
        expect(g.applyCommand(1, { type: 'challenge', bid: 5 })).toBe(false);
        expect(g.applyCommand(1, { type: 'challenge', bid: 2 })).toBe(true);
        expect(g.phase).toBe('bid');
        expect(g.current).toBe(2);
        expect(g.applyCommand(2, { type: 'raise', bid: 2 })).toBe(false);
        expect(g.applyCommand(2, { type: 'raise', bid: 3 })).toBe(true);
        expect(g.current).toBe(0);
        expect(g.applyCommand(0, { type: 'pass' })).toBe(true);
        // 席1（最初に挑戦した人）も、上げるかパス
        expect(g.current).toBe(1);
        expect(g.applyCommand(1, { type: 'pass' })).toBe(true);
        expect(g.phase).toBe('reveal');
        expect(g.challenger).toBe(2);
        expect(g.bid).toBe(3);
    });

    it('伏せた札の合計まで上がったら、すぐめくる', () => {
        const g = newGame();
        ante(g);
        g.applyCommand(0, { type: 'challenge', bid: 3 });
        expect(g.phase).toBe('reveal');
        expect(g.challenger).toBe(0);
    });
});

describe('めくる', () => {
    it('まず自分の山を上から全部めくる。宣言の数だけ花が出たら成功し、次のラウンドはその人から', () => {
        const g = newGame();
        ante(g);
        place(g, 0);
        place(g, 1);
        place(g, 2, 'S');
        g.applyCommand(0, { type: 'challenge', bid: 3 });
        g.applyCommand(1, { type: 'pass' });
        g.applyCommand(2, { type: 'pass' });
        expect(g.applyCommand(0, { type: 'flip', target: 1 })).toBe(false);
        expect(g.applyCommand(0, { type: 'flip', target: 0 })).toBe(true);
        expect(g.applyCommand(0, { type: 'flip', target: 0 })).toBe(true);
        expect(g.applyCommand(0, { type: 'flip', target: 0 })).toBe(false); // もう全部めくった
        expect(g.applyCommand(0, { type: 'flip', target: 1 })).toBe(true);
        expect(g.players[0].wins).toBe(1);
        expect(g.phase).toBe('ante');
        expect(g.start).toBe(0);
        expect(g.round).toBe(2);
    });

    it('2回目の成功で勝ち', () => {
        const g = newGame();
        g.players[0].wins = 1;
        ante(g);
        g.applyCommand(0, { type: 'challenge', bid: 1 });
        g.applyCommand(1, { type: 'pass' });
        g.applyCommand(2, { type: 'pass' });
        g.applyCommand(0, { type: 'flip', target: 0 });
        expect(g.isOver()).toBe(true);
        expect(g.winner).toBe(0);
    });

    it('ほかの人のドクロで失敗：札が1枚、見ずに取り除かれる。次は失敗した人から', () => {
        const g = newGame();
        ante(g, ['F', 'S', 'F']);
        g.applyCommand(0, { type: 'challenge', bid: 2 });
        g.applyCommand(1, { type: 'pass' });
        g.applyCommand(2, { type: 'pass' });
        g.applyCommand(0, { type: 'flip', target: 0 });
        g.applyCommand(0, { type: 'flip', target: 1 });
        expect(g.players[0].discs.F + g.players[0].discs.S).toBe(3);
        expect(g.players[0].lost).toBe(1);
        expect(g.phase).toBe('ante');
        expect(g.start).toBe(0);
        // 取り除いた札の種類は本人にだけ見える
        const lost = g.events.find(e => e.type === 'lost');
        expect(createGameView(g, 1, {}).events.find(e => e.type === 'lost').disc).toBe(null);
        expect(createGameView(g, 0, {}).events.find(e => e.type === 'lost').disc).toBe(lost.disc);
    });

    it('自分のドクロで失敗：取り除く札を自分で選ぶ', () => {
        const g = newGame();
        ante(g, ['S', 'F', 'F']);
        g.applyCommand(0, { type: 'challenge', bid: 1 });
        g.applyCommand(1, { type: 'pass' });
        g.applyCommand(2, { type: 'pass' });
        g.applyCommand(0, { type: 'flip', target: 0 });
        expect(g.phase).toBe('lose');
        expect(g.actors()).toEqual([0]);
        expect(g.applyCommand(0, { type: 'lose', disc: 'X' })).toBe(false);
        expect(g.applyCommand(0, { type: 'lose', disc: 'S' })).toBe(true);
        expect(g.players[0].discs).toEqual({ F: 3, S: 0 });
        expect(g.start).toBe(0);
    });

    it('脱落：ほかの人のドクロならその持ち主から、自分のドクロなら次の人から始める', () => {
        const g = newGame(4);
        g.players[0].discs = { F: 1, S: 0 };
        ante(g, ['F', 'F', 'S', 'F']);
        g.applyCommand(0, { type: 'challenge', bid: 4 });
        g.applyCommand(0, { type: 'flip', target: 0 });
        g.applyCommand(0, { type: 'flip', target: 2 });
        expect(g.players[0].out).toBe(true);
        expect(g.start).toBe(2);
        expect(g.actors()).toEqual([1, 2, 3]);

        const h = newGame(4);
        h.players[1].discs = { F: 0, S: 1 };
        ante(h, ['F', 'S', 'F', 'F']);
        place(h, 0);
        h.applyCommand(1, { type: 'challenge', bid: 1 });
        ['pass', 'pass', 'pass'].forEach((_, i) => h.applyCommand([2, 3, 0][i], { type: 'pass' }));
        h.applyCommand(1, { type: 'flip', target: 1 });
        h.applyCommand(1, { type: 'lose', disc: 'S' });
        expect(h.players[1].out).toBe(true);
        expect(h.start).toBe(2);
    });

    it('最後の1人になったら勝ち', () => {
        const g = newGame();
        g.players[2].out = true;
        g.players[2].discs = { F: 0, S: 0 };
        g.players[0].discs = { F: 1, S: 0 };
        g.phase = 'ante';
        ante(g, ['F', 'S']);
        g.applyCommand(0, { type: 'challenge', bid: 2 });
        g.applyCommand(0, { type: 'flip', target: 0 });
        g.applyCommand(0, { type: 'flip', target: 1 });
        expect(g.isOver()).toBe(true);
        expect(g.winner).toBe(1);
    });
});

describe('受け付けない操作・記録・見え方', () => {
    it('通らない操作は状態を変えない', () => {
        const g = newGame();
        ante(g);
        const before = snapshot(g);
        expect(g.applyCommand(1, { type: 'place', disc: 'F' })).toBe(false);
        expect(g.applyCommand(0, { type: 'raise', bid: 2 })).toBe(false);
        expect(g.applyCommand(0, { type: 'flip', target: 0 })).toBe(false);
        expect(g.applyCommand(0, { type: 'lose', disc: 'F' })).toBe(false);
        expect(g.applyCommand(0, { type: 'fly' })).toBe(false);
        expect(g.applyCommand(7, { type: 'pass' })).toBe(false);
        expect(snapshot(g)).toBe(before);
    });

    it('記録から同じゲームを作り直せる', () => {
        const g = newGame(4);
        ante(g, ['F', 'S', 'F', 'F']);
        g.applyCommand(0, { type: 'challenge', bid: 3, extra: 1 });
        [1, 2, 3].forEach(s => g.applyCommand(s, { type: 'pass' }));
        g.applyCommand(0, { type: 'flip', target: 0 });
        g.applyCommand(0, { type: 'flip', target: 1 });
        expect(g.commands.find(c => c.command.type === 'challenge').command).toEqual({ type: 'challenge', bid: 3 });
        const saved = JSON.parse(JSON.stringify(g.persist()));
        const r = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(r)).toBe(snapshot(g));
    });

    it('ほかの人の山の中身と手札は見えない。めくられた札と枚数は見える', () => {
        const g = newGame();
        ante(g, ['F', 'S', 'F']);
        place(g, 0, 'S');
        const view = createGameView(g, 1);
        expect(view.myStack).toEqual(['S']);
        expect(view.hand).toEqual({ F: 3, S: 0 });
        expect(view.players[0].stackCount).toBe(2);
        expect(view.players[0].revealed).toEqual([]);
        expect(JSON.stringify(view.players)).not.toContain('"S"');
        expect(createGameView(g, null).hand).toBe(null);
    });

    it('人数は3〜6人', () => {
        expect(() => new Game(players(2))).toThrow();
        expect(() => new Game(players(7))).toThrow();
        expect(new Game(players(6)).players).toHaveLength(6);
    });
});
