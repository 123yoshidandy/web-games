import { describe, it, expect } from 'vitest';
import { STAR, FIELDS, position, isRaise, legalBids, matches } from '../public/js/bids.js';
import { createGameView } from '../public/js/game-view.js';
import { newGame, setDice, act, snapshot, totalDice } from './helpers.js';

describe('宣言の順位（盤の30マス）', () => {
    it('数の1〜20の間に、3マスに1つ星のマス。星 k は数 2k−1 と 2k の間（8の前に星4）', () => {
        expect(FIELDS).toHaveLength(30);
        expect(FIELDS.filter(f => f.star)).toHaveLength(10);
        expect(FIELDS.slice(0, 6).map(f => (f.star ? `★${f.qty}` : String(f.qty)))).toEqual(['1', '★1', '2', '3', '★2', '4']);
        expect(position({ qty: 4, face: STAR })).toBeLessThan(position({ qty: 8, face: 1 }));
        expect(position({ qty: 4, face: STAR })).toBeGreaterThan(position({ qty: 7, face: 5 }));
        expect(FIELDS.at(-1)).toEqual({ pos: 30, star: false, qty: 20 });
    });

    it('上げ方：同じ数で目を上げる、数を増やす（目は自由）、より先の星のマス', () => {
        const prev = { qty: 3, face: 4 };
        expect(isRaise(prev, { qty: 3, face: 5 })).toBe(true);
        expect(isRaise(prev, { qty: 3, face: 2 })).toBe(false);
        expect(isRaise(prev, { qty: 4, face: 1 })).toBe(true);
        expect(isRaise(prev, { qty: 2, face: STAR })).toBe(true);
        expect(isRaise(prev, { qty: 1, face: STAR })).toBe(false);
        // ジュビリー版の例：「4が8個」から「星5個」へ
        expect(isRaise({ qty: 8, face: 4 }, { qty: 5, face: STAR })).toBe(true);
        expect(isRaise({ qty: 8, face: 4 }, { qty: 4, face: STAR })).toBe(false);
        // 星から数へは、盤のより先のマス
        expect(isRaise({ qty: 3, face: STAR }, { qty: 6, face: 1 })).toBe(true);
        expect(isRaise({ qty: 3, face: STAR }, { qty: 5, face: 5 })).toBe(false);
        expect(isRaise({ qty: 3, face: STAR }, { qty: 3, face: STAR })).toBe(false);
    });

    it('上げられる宣言の一覧は、どれも上の宣言', () => {
        const prev = { qty: 5, face: 3 };
        const list = legalBids(prev);
        expect(list.every(b => isRaise(prev, b))).toBe(true);
        expect(list[0]).toEqual({ qty: 5, face: 4 });
        expect(legalBids(null)).toHaveLength(20 * 5 + 10);
    });

    it('数え方：数の宣言はその目と星、星の宣言は星だけ', () => {
        expect(matches(3, 3)).toBe(true);
        expect(matches(STAR, 3)).toBe(true);
        expect(matches(4, 3)).toBe(false);
        expect(matches(STAR, STAR)).toBe(true);
        expect(matches(3, STAR)).toBe(false);
    });
});

describe('ゲーム', () => {
    const setup = (options = {}) => {
        const game = newGame(3, 2, options);
        game.starter = 0;
        game.turn = 0;
        setDice(game, 0, [3, 3, STAR, 1, 2]);
        setDice(game, 1, [3, 5, 5, 4, 4]);
        setDice(game, 2, [STAR, 2, 2, 1, 1]);
        // 3 は 3 個 ＋ 星 2 個 ＝ 5 個
        return game;
    };

    it('各人5個。最初の人は必ず宣言する（疑えない）。時計回りに進む', () => {
        const game = setup();
        expect(game.players.every(p => p.dice.length === 5)).toBe(true);
        expect(game.applyCommand(0, { type: 'challenge' })).toBe(false);
        act(game, 0, { type: 'bid', qty: 2, face: 3 });
        expect(game.turn).toBe(1);
        expect(game.applyCommand(1, { type: 'bid', qty: 2, face: 2 })).toBe(false);
        act(game, 1, { type: 'bid', qty: 2, face: 4 });
        expect(game.turn).toBe(2);
    });

    it('宣言より少ない：宣言した人が差の数だけ失い、疑った人が次のラウンドを始める', () => {
        const game = setup();
        act(game, 0, { type: 'bid', qty: 7, face: 3 });
        act(game, 1, { type: 'challenge' });
        expect(game.reveal.count).toBe(5);
        expect(game.players[0].dice).toHaveLength(3);
        expect(game.phase).toBe('reveal');
        expect(game.starter).toBe(1);
        expect(game.actors()).toEqual([1]);
    });

    it('宣言より多い：疑った人が差の数だけ失い、宣言した人が次を始める', () => {
        const game = setup();
        act(game, 0, { type: 'bid', qty: 3, face: 3 });
        act(game, 1, { type: 'challenge' });
        expect(game.players[1].dice).toHaveLength(3);
        expect(game.starter).toBe(0);
    });

    it('ぴったり：宣言した人以外の全員が1個ずつ失う', () => {
        const game = setup();
        act(game, 0, { type: 'bid', qty: 5, face: 3 });
        act(game, 1, { type: 'challenge' });
        expect(game.players.map(p => p.dice.length)).toEqual([5, 4, 4]);
        expect(game.starter).toBe(0);
    });

    it('星の宣言は星だけを数える', () => {
        const game = setup();
        act(game, 0, { type: 'bid', qty: 3, face: STAR });
        act(game, 1, { type: 'challenge' });
        expect(game.reveal.count).toBe(2);
        expect(game.players[0].dice).toHaveLength(4);
    });

    it('次へ：勝った側が全員のダイスを振り直して新しいラウンドを始める', () => {
        const game = setup();
        act(game, 0, { type: 'bid', qty: 7, face: 3 });
        act(game, 1, { type: 'challenge' });
        expect(game.applyCommand(0, { type: 'next' })).toBe(false);
        act(game, 1, { type: 'next' });
        expect(game.phase).toBe('bid');
        expect(game.round).toBe(2);
        expect(game.turn).toBe(1);
        expect(game.bid).toBe(null);
    });

    it('振り直し：宣言に合うダイスを見せ、残りを振り直す（1個はカップに残す）', () => {
        const game = setup();
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'bid', qty: 2, face: 3, reveal: [3] })).toBe(false); // 1 は合わない
        expect(game.applyCommand(0, { type: 'bid', qty: 2, face: 3, reveal: [0, 0] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        act(game, 0, { type: 'bid', qty: 2, face: 3, reveal: [0, 1, 2] });
        const p = game.players[0];
        expect(p.dice.filter(d => d.shown).map(d => d.value)).toEqual([3, 3, STAR]);
        // ほかの人には、見せたダイスとカップの中の数だけ
        const v = createGameView(game, 1).players[0];
        expect(v).toMatchObject({ count: 5, hidden: 2, shown: [3, 3, STAR], dice: null });
        // 2巡目：見せたダイスはもう選べない。カップに1個は残す
        act(game, 1, { type: 'bid', qty: 2, face: 4 });
        act(game, 2, { type: 'bid', qty: 2, face: 5 });
        const cup = p.dice.map((d, i) => ({ d, i })).filter(x => !x.d.shown);
        const all = cup.map(x => x.i);
        p.dice[all[0]].value = 4;
        p.dice[all[1]].value = 4;
        expect(game.applyCommand(0, { type: 'bid', qty: 3, face: 4, reveal: all })).toBe(false);
        act(game, 0, { type: 'bid', qty: 3, face: 4, reveal: [all[0]] });
        expect(p.dice.filter(d => d.shown)).toHaveLength(4);
    });

    it('振り直しなしの設定では断る', () => {
        const game = setup({ reroll: false });
        expect(game.applyCommand(0, { type: 'bid', qty: 2, face: 3, reveal: [0] })).toBe(false);
    });

    it('Perudo 風の設定：負けた側が1個だけ。ぴったりなら疑った人が1個', () => {
        let game = setup({ lossOne: true });
        act(game, 0, { type: 'bid', qty: 9, face: 3 });
        act(game, 1, { type: 'challenge' });
        expect(game.players[0].dice).toHaveLength(4);
        game = setup({ lossOne: true });
        act(game, 0, { type: 'bid', qty: 5, face: 3 });
        act(game, 1, { type: 'challenge' });
        expect(game.players.map(p => p.dice.length)).toEqual([5, 4, 5]);
    });

    it('ダイスがなくなった人は抜け、手番が飛ばされる。最後の1人が勝ち', () => {
        const game = setup();
        setDice(game, 1, [5]);
        act(game, 0, { type: 'bid', qty: 6, face: 3 });
        act(game, 1, { type: 'bid', qty: 7, face: 3 });
        act(game, 2, { type: 'challenge' });
        // 3 は 5 個、宣言 7 個 → 宣言した席1が2個失う（1個しかないので脱落）
        expect(game.players[1].dice).toHaveLength(0);
        act(game, 2, { type: 'next' });
        act(game, 2, { type: 'bid', qty: 1, face: 1 });
        expect(game.turn).toBe(0);
        act(game, 0, { type: 'bid', qty: 1, face: 2 });
        expect(game.turn).toBe(2);
        // 決着まで
        setDice(game, 0, [1]);
        setDice(game, 2, [1, 1]);
        act(game, 2, { type: 'bid', qty: 5, face: 1 });
        act(game, 0, { type: 'challenge' });
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([0]);
        expect(game.applyCommand(0, { type: 'next' })).toBe(false);
    });

    it('断る操作は状態を変えない', () => {
        const game = setup();
        act(game, 0, { type: 'bid', qty: 3, face: 3 });
        const before = snapshot(game);
        [[0, { type: 'bid', qty: 4, face: 3 }], [1, { type: 'bid', qty: 3, face: 3 }], [1, { type: 'bid', qty: 21, face: 1 }], [1, { type: 'bid', qty: 4, face: 7 }],
            [1, { type: 'bid', qty: '4', face: 3 }], [1, { type: 'next' }], [1, { type: 'fly' }], [1, null], [1, { type: 'bid', qty: 11, face: STAR }]]
            .forEach(([s, c]) => expect(game.applyCommand(s, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
        expect(totalDice(game)).toBe(15);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = setup();
        act(game, 0, { type: 'bid', qty: 2, face: 3, extra: 'x'.repeat(40) });
        expect(game.commands[0].command).toEqual({ type: 'bid', qty: 2, face: 3 });
    });
});

describe('ビュー', () => {
    it('ほかの人のカップの中は見えない。疑ったあとは全員のダイスを見せる', () => {
        const game = newGame(3, 4);
        const view = createGameView(game, 1);
        expect(view.players[1].dice).toHaveLength(5);
        [0, 2].forEach(s => {
            expect(view.players[s].dice).toBe(null);
            expect(view.players[s].hidden).toBe(5);
        });
        const json = JSON.stringify(view);
        expect(json).not.toContain('seed');
        expect(json).not.toContain('cpuSalt');
        expect(createGameView(game, null).players.every(p => p.dice === null)).toBe(true);
        const s = game.turn;
        act(game, s, { type: 'bid', qty: 2, face: 3 });
        act(game, game.turn, { type: 'challenge' });
        expect(createGameView(game, null).reveal.dice).toHaveLength(3);
    });
});
