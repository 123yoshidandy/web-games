import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CARDS, TOTAL_CARDS, TOKENS_TO_WIN, fullDeck } from '../public/js/cards.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { setupRound, snapshot, play, players } from './helpers.js';

describe('カードと準備', () => {
    it('21 枚：スパイ2・兵士6・道化2・騎士2・僧侶2・魔術師2・宰相2・将軍1・大臣1・姫1', () => {
        expect(TOTAL_CARDS).toBe(21);
        expect(CARDS.map(c => c.count)).toEqual([2, 6, 2, 2, 2, 2, 2, 1, 1, 1]);
        expect(fullDeck()).toHaveLength(21);
    });

    it('勝つのに要る好意の印：2人6・3人5・4人4・5人3・6人3', () => {
        expect(TOKENS_TO_WIN).toEqual({ 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 });
    });

    it('2 人では 1 枚を伏せ、3 枚を表にして除外する。最初の人は 2 枚、ほかは 1 枚', () => {
        const game = new Game(players(2), { seed: 3 });
        expect(game.faceUp).toHaveLength(3);
        expect(game.setAside).not.toBeNull();
        expect(game.hands[game.current]).toHaveLength(2);
        expect(game.hands[1 - game.current]).toHaveLength(1);
        expect(game.deck).toHaveLength(21 - 1 - 3 - 3);
    });

    it('3 人以上では 1 枚だけ伏せて除外する', () => {
        const game = new Game(players(4), { seed: 3 });
        expect(game.faceUp).toHaveLength(0);
        expect(game.deck).toHaveLength(21 - 1 - 5);
    });
});

describe('カードの効果', () => {
    it('兵士：言い当てれば脱落、外れれば何もない。兵士は言えない', () => {
        const game = setupRound({ hands: [[1, 2], [3], [5]] });
        expect(game.applyCommand(0, { type: 'play', card: 1, target: 1, guess: 1 })).toBe(false);
        play(game, 0, 1, 1, 3);
        expect(game.out[1]).toBe(true);
        expect(game.discards[1]).toEqual([3]);
        const miss = setupRound({ hands: [[1, 2], [3], [5]] });
        play(miss, 0, 1, 2, 3);
        expect(miss.out[2]).toBe(false);
    });

    it('兵士はスパイ（0）も言い当てられる', () => {
        const game = setupRound({ hands: [[1, 2], [0], [5]] });
        play(game, 0, 1, 1, 0);
        expect(game.out[1]).toBe(true);
    });

    it('道化：見た手札は、見た人のビューにだけ出る', () => {
        const game = setupRound({ hands: [[2, 4], [7], [5]] });
        play(game, 0, 2, 1);
        expect(createGameView(game, 0).players[1].known).toBe(7);
        expect(createGameView(game, 2).players[1].known).toBeNull();
        const event = e => e.type === 'priest';
        expect(createGameView(game, 0).events.find(event).secret.card).toBe(7);
        expect(createGameView(game, 2).events.find(event).secret).toBeUndefined();
        expect(createGameView(game, 1).exposedTo).toEqual([0]);
    });

    it('騎士：小さい方が脱落、同じなら何もない。比べた 2 人は互いの手札を知る', () => {
        const game = setupRound({ hands: [[3, 6], [4], [5]] });
        play(game, 0, 3, 1);
        expect(game.out[1]).toBe(true);
        const tie = setupRound({ hands: [[3, 5], [5], [2]] });
        play(tie, 0, 3, 1);
        expect(tie.out).toEqual([false, false, false]);
        expect(tie.knowledge[0][1]).toBe(5);
        expect(tie.knowledge[1][0]).toBe(5);
        expect(tie.knowledge[2][1]).toBeNull();
    });

    it('僧侶：次の自分の番まで選ばれない。全員が守られていれば、兵士は効果なしで出す', () => {
        const game = setupRound({ n: 2, hands: [[4, 1], [1]], deck: [2, 3, 6, 6] });
        play(game, 0, 4);
        expect(game.protected[0]).toBe(true);
        expect(game.targetsFor(1, 1)).toEqual([]);
        play(game, 1, 1);
        expect(game.events.some(e => e.type === 'noEffect')).toBe(true);
        // 自分の番が来たら守りは切れる
        expect(game.current).toBe(0);
        expect(game.protected[0]).toBe(false);
    });

    it('魔術師：選んだ人は手札を捨てて引き直す。自分も選べる。ほかの全員が守られていれば自分を選ぶ', () => {
        const game = setupRound({ hands: [[5, 2], [7], [3]], protected: [false, true, true], deck: [1, 1, 8] });
        expect(game.targetsFor(0, 5)).toEqual([0]);
        play(game, 0, 5, 0);
        expect(game.discards[0]).toEqual([5, 2]);
        expect(game.hands[0]).toEqual([8]);
    });

    it('魔術師で姫を捨てたら脱落', () => {
        const game = setupRound({ hands: [[5, 1], [9], [3]] });
        play(game, 0, 5, 1);
        expect(game.out[1]).toBe(true);
        expect(game.discards[1]).toEqual([9]);
    });

    it('山札が尽きていたら、魔術師では伏せて除外したカードを引く', () => {
        const game = setupRound({ hands: [[5, 1], [3], [2]], deck: [], setAside: 8 });
        play(game, 0, 5, 1);
        // 山札が空なので、このあとラウンドが終わる。終わりの公開で、引いたカードを確かめる
        expect(game.events.find(e => e.type === 'prince')).toMatchObject({ fromSetAside: true, discarded: 3 });
        expect(game.events.find(e => e.type === 'roundEnd').reveal[1]).toBe(8);
    });

    it('宰相：2 枚引いて 1 枚を残し、2 枚を山札の下に戻す（bottom の最後が一番下）', () => {
        const game = setupRound({ hands: [[6, 2], [3], [1]], deck: [0, 7, 9, 4] });
        play(game, 0, 6);
        expect(game.phase).toBe('chancellor');
        expect(game.hands[0].sort()).toEqual([2, 4, 9]);
        expect(game.applyCommand(0, { type: 'keep', card: 9, bottom: [2, 2] })).toBe(false);
        expect(game.applyCommand(0, { type: 'keep', card: 9, bottom: [4, 2] })).toBe(true);
        expect(game.hands[0]).toEqual([9]);
        // 山札は [2, 4, 0, 7] から、次の人が 7 を引く
        expect(game.deck).toEqual([2, 4, 0]);
        expect(game.hands[1]).toEqual([3, 7]);
    });

    it('宰相：山札が 1 枚なら 1 枚だけ引いて 1 枚戻す', () => {
        const game = setupRound({ hands: [[6, 2], [3], [1]], deck: [8] });
        play(game, 0, 6);
        expect(game.hands[0]).toHaveLength(2);
        game.applyCommand(0, { type: 'keep', card: 8, bottom: [2] });
        expect(game.deck).toEqual([]);
    });

    it('将軍：手札を交換する。交換した 2 人は渡したカードを知る', () => {
        const game = setupRound({ hands: [[7, 2], [9], [3]] });
        play(game, 0, 7, 1);
        expect(game.hands[0]).toEqual([9]);
        // 次は 1 の番なので、1 は 1 枚引いている
        expect(game.hands[1][0]).toBe(2);
        expect(game.knowledge[0][1]).toBe(2);
        expect(game.knowledge[1][0]).toBe(9);
    });

    it('ほかの人が知っていた手札の知識は、将軍の交換でカードと一緒に移る', () => {
        const game = setupRound({ hands: [[7, 2], [9], [3]] });
        game.knowledge[2][1] = 9;
        play(game, 0, 7, 1);
        expect(game.knowledge[2][0]).toBe(9);
        expect(game.knowledge[2][1]).toBeNull();
    });

    it('大臣：将軍か魔術師と一緒なら、大臣を出さなければならない', () => {
        const game = setupRound({ hands: [[8, 7], [3], [2]] });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'play', card: 7, target: 1 })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(createGameView(game, 0).legal.map(l => l.card)).toEqual([8]);
        play(game, 0, 8);
    });

    it('姫：出したら脱落', () => {
        const game = setupRound({ hands: [[9, 1], [3], [2]] });
        play(game, 0, 9);
        expect(game.out[0]).toBe(true);
    });

    it('出したカードが知られていたカードなら、残りの手札は分からなくなる', () => {
        const game = setupRound({ hands: [[2, 4], [7], [5]] });
        game.knowledge[1][0] = 4;
        game.knowledge[2][0] = 2;
        play(game, 0, 4);
        expect(game.knowledge[1][0]).toBeNull();
        expect(game.knowledge[2][0]).toBe(2);
    });
});

describe('ラウンドの終わり', () => {
    it('山札が尽きたら、手札の一番大きい人が好意の印をもらう', () => {
        const game = setupRound({ hands: [[4, 2], [7], [5]], deck: [] });
        play(game, 0, 4);
        expect(game.players.map(p => p.tokens)).toEqual([0, 1, 0]);
        expect(game.round).toBe(2);
        expect(game.events.find(e => e.type === 'roundEnd')).toMatchObject({ winners: [1], reveal: { 0: 2, 1: 7, 2: 5 } });
    });

    it('同じなら捨て札の合計が大きい人、それも同じなら全員', () => {
        const game = setupRound({ hands: [[4, 6], [6], [2]], deck: [], discards: [[], [1], []] });
        play(game, 0, 4);
        // 0 の捨て札は 4、1 は 1 → 0 の勝ち
        expect(game.players.map(p => p.tokens)).toEqual([1, 0, 0]);
        const tie = setupRound({ hands: [[4, 6], [6], [2]], deck: [], discards: [[], [4], []] });
        play(tie, 0, 4);
        expect(tie.players.map(p => p.tokens)).toEqual([1, 1, 0]);
    });

    it('残りが 1 人になったら、その人の勝ち', () => {
        const game = setupRound({ n: 2, hands: [[1, 2], [3]] });
        play(game, 0, 1, 1, 3);
        expect(game.players.map(p => p.tokens)).toEqual([1, 0]);
        expect(game.events.find(e => e.type === 'roundEnd').byElimination).toBe(true);
    });

    it('スパイ：残っている人のうち 1 人だけがスパイを捨てていれば、勝たなくても 1 つ', () => {
        const game = setupRound({ hands: [[4, 2], [7], [5]], deck: [], discards: [[0], [], []] });
        play(game, 0, 4);
        expect(game.players.map(p => p.tokens)).toEqual([1, 1, 0]);
        expect(game.events.find(e => e.type === 'roundEnd').spy).toBe(0);
    });

    it('スパイ：2 人が捨てていれば、どちらももらえない。脱落した人のスパイは数えない', () => {
        const two = setupRound({ hands: [[4, 2], [7], [5]], deck: [], discards: [[0], [0], []] });
        play(two, 0, 4);
        expect(two.players.map(p => p.tokens)).toEqual([0, 1, 0]);
        const outSpy = setupRound({ hands: [[4, 2], [7], []], deck: [], discards: [[0], [], [0]], out: [false, false, true] });
        play(outSpy, 0, 4);
        expect(outSpy.players.map(p => p.tokens)).toEqual([1, 1, 0]);
    });

    it('勝ったラウンドの勝者から、次のラウンドを始める', () => {
        const game = setupRound({ hands: [[4, 2], [7], [5]], deck: [] });
        play(game, 0, 4);
        expect(game.current).toBe(1);
        expect(game.hands[1]).toHaveLength(2);
    });

    it('好意の印が勝つのに要る数に届いたら、ゲームの勝ち', () => {
        const game = setupRound({ n: 2, hands: [[1, 2], [3]] });
        game.players[0].tokens = 5;
        play(game, 0, 1, 1, 3);
        expect(game.phase).toBe('end');
        expect(game.winner).toBe(0);
    });
});

describe('隠す情報と断る操作', () => {
    it('ビューに、ほかの人の手札・山札・伏せたカードは入らない', () => {
        const game = new Game(players(4), { seed: 8 });
        const view = createGameView(game, 1);
        expect(view.hand).toEqual(game.hands[1]);
        expect(view).not.toHaveProperty('deck');
        const json = JSON.stringify(view);
        expect(json).not.toContain('setAside":');
        expect(json).not.toContain('hands');
        // 引いたカードは、引いた人にだけ見える
        const drawn = createGameView(game, game.current === 1 ? 2 : 1).events.find(e => e.type === 'draw' && e.seat === game.current);
        expect(drawn.secret).toBeUndefined();
    });

    it('手番でない人・持っていないカード・守られた人・選べない人の操作は断り、状態を変えない', () => {
        const game = setupRound({ hands: [[1, 2], [3], [5]], protected: [false, true, false] });
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'play', card: 3, target: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 7, target: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 1, target: 1, guess: 3 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 1, target: 0, guess: 3 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 1, target: 2, guess: 12 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 2, target: null })).toBe(false);
        expect(game.applyCommand(0, { type: 'keep', card: 1, bottom: [] })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('通しの試合', () => {
    function playRandom(n, seed) {
        const game = new Game(players(n), { seed });
        const random = createRandom(seed * 5 + 3);
        const pick = list => list[Math.floor(random() * list.length)];
        let steps = 0;
        while (!game.isOver()) {
            const seat = game.current;
            const view = createGameView(game, seat);
            let command;
            if (game.phase === 'chancellor') {
                const hand = [...view.hand];
                const card = pick(hand);
                hand.splice(hand.indexOf(card), 1);
                command = { type: 'keep', card, bottom: hand };
            } else {
                const l = pick(view.legal.filter(x => x.card !== 9).length ? view.legal.filter(x => x.card !== 9) : view.legal);
                const target = l.targets.length ? pick(l.targets) : null;
                command = { type: 'play', card: l.card, target, guess: l.needsGuess && target !== null ? pick([0, 2, 3, 4, 5, 6, 7, 8, 9]) : null };
            }
            expect(game.applyCommand(seat, command)).toBe(true);
            // 21 枚が、どこかに必ずある
            if (game.phase !== 'end') {
                const total = game.deck.length + (game.setAside !== null ? 1 : 0) + game.faceUp.length
                    + game.hands.flat().length + game.discards.flat().length;
                expect(total).toBe(21);
            }
            if (++steps > 5000) throw new Error('終わらない');
        }
        return game;
    }

    it('でたらめな手でも 2〜6 人で最後まで進み、記録から同じ結果を再現できる', () => {
        for (let n = 2; n <= 6; n++) {
            for (let seed = 1; seed <= 6; seed++) {
                const game = playRandom(n, seed * 19 + n);
                expect(game.players[game.winner].tokens).toBeGreaterThanOrEqual(TOKENS_TO_WIN[n]);
                const again = Game.replay(players(n), game.options, game.commands);
                expect(snapshot(again)).toBe(snapshot(game));
            }
        }
    });
});
