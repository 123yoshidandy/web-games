import { describe, it, expect } from 'vitest';
import Game, { COLORS, JOKER, PLUS2, LAST, bestScore } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, setup, snapshot } from './helpers.js';

const zero = (colors = COLORS) => Object.fromEntries(colors.map(c => [c, 0]));
const counts = (partial) => ({ ...zero(), ...partial });

describe('得点', () => {
    it('枚数ごとの点数は 1・3・6・10・15・21（6枚以上は21）', () => {
        [[1, 1], [2, 3], [3, 6], [4, 10], [5, 15], [6, 21], [8, 21]].forEach(([n, points]) => {
            expect(bestScore(counts({ red: n }), 0, 0).score).toBe(points);
        });
    });

    it('多い3色がプラス、残りはマイナス。+2 は1枚2点', () => {
        // 赤4(10)・青3(6)・緑2(3) がプラス、黄2(3)・紫1(1) がマイナス
        const result = bestScore(counts({ red: 4, blue: 3, green: 2, yellow: 2, purple: 1 }), 0, 2);
        expect(result.score).toBe(10 + 6 + 3 - 3 - 1 + 4);
        expect(result.positive).toHaveLength(3);
        expect(result.positive).toContain('red');
    });

    it('ジョーカーは、いちばん得になる色に割り当てる', () => {
        // 赤5・青1：ジョーカーを赤に足すと 21+1=22、青に足すと 15+3=18
        expect(bestScore(counts({ red: 5, blue: 1 }), 1, 0).score).toBe(22);
        expect(bestScore(counts({ red: 5, blue: 1 }), 1, 0).jokerAssignment).toEqual({ red: 1 });
        // 4色目がマイナスになるのを避ける：赤3・青3・緑3・黄1 にジョーカー1枚 → 3色のどれかに足す（黄は −1 のまま）
        expect(bestScore(counts({ red: 3, blue: 3, green: 3, yellow: 1 }), 1, 0).score).toBe(10 + 6 + 6 - 1);
        // ジョーカーだけでも点になる
        expect(bestScore(zero(), 3, 0).score).toBe(6);
    });

    it('灰色の面の点数は 1・4・8・7・6・5', () => {
        expect(bestScore(counts({ red: 3 }), 0, 0, 'gray').score).toBe(8);
        expect(bestScore(counts({ red: 6 }), 0, 0, 'gray').score).toBe(5);
        // 灰色では、6枚の色より3枚の色を多く数えたい：ジョーカーは2枚の青に足して3枚にする
        expect(bestScore(counts({ red: 3, blue: 2 }), 1, 0, 'gray').score).toBe(16);
    });
});

describe('準備', () => {
    it.each([[3, 6], [4, 7], [5, 7]])('%i人：%i色、列は人数と同じ数。各自に違う色を1枚', (n, colorCount) => {
        const game = makeGame(n);
        expect(game.colors).toHaveLength(colorCount);
        expect(game.rows).toHaveLength(n);
        const starts = game.players.map(p => Object.entries(p.counts).filter(([, c]) => c > 0));
        starts.forEach(s => { expect(s).toHaveLength(1); expect(s[0][1]).toBe(1); });
        expect(new Set(starts.map(s => s[0][0])).size).toBe(n);
        // カードの総数：色9枚×色数＋ジョーカー3＋(+2)10＋最後のラウンド1（配った分を含む）
        expect(game.deck.length + n).toBe(colorCount * 9 + 3 + 10 + 1);
        expect(game.deck.filter(c => c === JOKER)).toHaveLength(3);
        expect(game.deck.filter(c => c === PLUS2)).toHaveLength(10);
    });

    it('最後のラウンドのカードの下に15枚ある', () => {
        const game = makeGame(4, 3);
        expect(game.deck.length - 1 - game.deck.indexOf(LAST)).toBe(15);
    });

    it('人数は3〜5人。同じシードなら同じ配り方', () => {
        expect(() => new Game(players(2))).toThrow();
        expect(() => new Game(players(6))).toThrow();
        expect(snapshot(makeGame(5, 9))).toBe(snapshot(makeGame(5, 9)));
    });
});

describe('手番', () => {
    it('引いたカードを、まだ取られていない3枚未満の列に置く', () => {
        const game = makeGame(3);
        setup(game, { rows: [['red', 'red', 'red'], { cards: ['blue'], taken: true }, []], deck: ['green', 'blue', 'red'] });
        expect(game.applyCommand(0, { type: 'place', row: 2 })).toBe(false); // 先に引く
        expect(game.applyCommand(0, { type: 'draw' })).toBe(true);
        expect(game.pending).toBe('green');
        expect(game.applyCommand(0, { type: 'take', row: 0 })).toBe(false); // 引いたら置く
        expect(game.applyCommand(0, { type: 'place', row: 0 })).toBe(false); // 3枚
        expect(game.applyCommand(0, { type: 'place', row: 1 })).toBe(false); // 取られている
        expect(game.applyCommand(0, { type: 'place', row: 2 })).toBe(true);
        expect(game.rows[2].cards).toEqual(['green']);
        expect(game.current).toBe(1);
    });

    it('置ける列がなければ引けず、列を取る。空の列は取れない', () => {
        const game = makeGame(3);
        setup(game, { rows: [['red', 'red', 'red'], ['blue', 'blue', 'blue'], { cards: [], taken: true }] });
        expect(game.applyCommand(0, { type: 'draw' })).toBe(false);
        expect(game.lastError).toMatch(/列を取って/);
        setup(game, { rows: [['red'], [], []] });
        expect(game.applyCommand(0, { type: 'take', row: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', row: 0 })).toBe(true);
        expect(game.players[0].counts.red).toBeGreaterThanOrEqual(1);
    });

    it('列を取った人は、そのラウンドの残りは手番がない', () => {
        const game = makeGame(3);
        setup(game, { rows: [['red'], ['blue'], []], deck: ['green', 'green', 'green'] });
        game.applyCommand(0, { type: 'take', row: 0 });
        expect(game.current).toBe(1);
        game.applyCommand(1, { type: 'draw' });
        game.applyCommand(1, { type: 'place', row: 2 });
        expect(game.current).toBe(2); // 0 は飛ばす
        game.applyCommand(2, { type: 'take', row: 1 });
        expect(game.current).toBe(1);
    });

    it('ジョーカーと +2 は別に数える', () => {
        const game = makeGame(3);
        setup(game, { rows: [[JOKER, PLUS2, 'red'], [], []] });
        game.applyCommand(0, { type: 'take', row: 0 });
        expect(game.players[0].jokers).toBe(1);
        expect(game.players[0].plus2).toBe(1);
    });
});

describe('ラウンドと終わり', () => {
    it('全員が列を取ったらラウンドの終わり。最後に取った人から次のラウンドを始め、列は空に戻る', () => {
        const game = makeGame(3);
        setup(game, { rows: [['red'], ['blue'], ['green']] });
        game.applyCommand(0, { type: 'take', row: 0 });
        game.applyCommand(1, { type: 'take', row: 1 });
        game.applyCommand(2, { type: 'take', row: 2 });
        expect(game.round).toBe(2);
        expect(game.current).toBe(2);
        expect(game.rows.every(r => r.cards.length === 0 && !r.taken)).toBe(true);
        expect(game.players.every(p => !p.took)).toBe(true);
    });

    it('最後のラウンドのカードが出たら、代わりにもう1枚引き、そのラウンドの終わりでゲームが終わる', () => {
        const game = makeGame(3);
        setup(game, { rows: [['red'], ['blue'], []], deck: [LAST, 'green', 'yellow'] });
        game.applyCommand(0, { type: 'draw' });
        expect(game.lastRound).toBe(true);
        expect(game.pending).toBe('green');
        game.applyCommand(0, { type: 'place', row: 2 });
        game.applyCommand(1, { type: 'take', row: 0 });
        game.applyCommand(2, { type: 'take', row: 1 });
        expect(game.phase).toBe('play'); // まだ1人残っている
        game.applyCommand(0, { type: 'take', row: 2 });
        expect(game.phase).toBe('end');
        expect(game.results).toHaveLength(3);
        const best = Math.max(...game.results.map(r => r.score));
        expect(game.winners).toEqual(game.results.filter(r => r.score === best).map(r => r.seat));
        expect(game.applyCommand(0, { type: 'draw' })).toBe(false);
    });
});

describe('記録と再現', () => {
    it('断った操作では、状態が少しも変わらない', () => {
        const game = makeGame(4, 2);
        setup(game, { rows: [['red'], [], [], []] });
        const before = snapshot(game);
        [{ type: 'place', row: 0 }, { type: 'take', row: 1 }, { type: 'take', row: 9 }, { type: 'nope' }, null].forEach(command => {
            expect(game.applyCommand(0, command)).toBe(false);
            expect(snapshot(game)).toBe(before);
        });
        expect(game.applyCommand(1, { type: 'draw' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を作り直せる。余計な項目は記録しない', () => {
        const game = makeGame(4, 6);
        const seat = game.current;
        game.applyCommand(seat, { type: 'draw', junk: 1 });
        game.applyCommand(seat, { type: 'place', row: 0, junk: 2 });
        expect(game.commands.map(c => c.command)).toEqual([{ type: 'draw' }, { type: 'place', row: 0 }]);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});

describe('ビュー', () => {
    it('山札の並びは入れず、得点の見込みを入れる', () => {
        const game = makeGame(4, 3);
        const view = createGameView(game, 0);
        expect('deck' in view).toBe(false);
        expect(view.deckCount).toBe(game.deck.length);
        expect(view.players[0].score).toBe(1);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
