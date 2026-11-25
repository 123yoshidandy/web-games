import { describe, it, expect } from 'vitest';
import Game, { rankPlayers } from '../public/js/game.js';
import { players, pick, setHand, stackDeck, setPile, snapshot, removeEverywhere } from './helpers.js';

const newGame = (n = 2, startPlayer = 0, seed = 1) => new Game(players(n), { seed, startPlayer });

// 山札から引いて、1枚目を手札に入れる（捨て札は置ける山に置く）
function drawAny(game, seat) {
    expect(game.applyCommand(seat, { type: 'drawDeck' })).toBe(true);
    const pile = game.discards[1].length === 0 ? 1 : 0;
    expect(game.applyCommand(seat, { type: 'keep', card: game.drawn[0], pile })).toBe(true);
}

// 手札の点が7点以上になる組み合わせ（貝4枚で6点＋カニの組で1点）
const sevenPoints = () => pick('shell', 'shell', 'shell', 'shell', 'crab', 'crab');

describe('準備', () => {
    it('捨て札の山に1枚ずつ、山札は56枚、手札は0枚から', () => {
        const game = newGame(3);
        expect(game.discards.map(p => p.length)).toEqual([1, 1]);
        expect(game.deck.length).toBe(56);
        expect(game.players.every(p => p.hand.length === 0)).toBe(true);
        expect(game.target).toBe(35);
        expect(new Game(players(2), { seed: 1 }).target).toBe(40);
        expect(new Game(players(4), { seed: 1 }).target).toBe(30);
    });

    it('同じシードなら同じ並びになる', () => {
        expect(snapshot(newGame(2, 0, 7))).toBe(snapshot(newGame(2, 0, 7)));
        expect(snapshot(newGame(2, 0, 7))).not.toBe(snapshot(newGame(2, 0, 8)));
    });
});

describe('引く', () => {
    it('山札から2枚引いて1枚を手札に、もう1枚を選んだ捨て札の山に置く', () => {
        const game = newGame();
        const [a, b] = game.deck.slice(0, 2);
        expect(game.applyCommand(0, { type: 'drawDeck' })).toBe(true);
        expect(game.phase).toBe('keep');
        expect(game.applyCommand(0, { type: 'keep', card: b, pile: 1 })).toBe(true);
        expect(game.players[0].hand).toEqual([b]);
        expect(game.discards[1].at(-1)).toBe(a);
        expect(game.phase).toBe('play');
    });

    it('空の捨て札の山があれば、そこにしか置けない', () => {
        const game = newGame();
        game.discards[0] = [];
        game.applyCommand(0, { type: 'drawDeck' });
        const card = game.drawn[0];
        expect(game.applyCommand(0, { type: 'keep', card, pile: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'keep', card, pile: 0 })).toBe(true);
    });

    it('山札が1枚なら、その1枚を手札に入れる', () => {
        const game = newGame();
        const last = game.deck[0];
        game.deck = [last];
        game.applyCommand(0, { type: 'drawDeck' });
        expect(game.players[0].hand).toEqual([last]);
        expect(game.phase).toBe('play');
    });

    it('捨て札の一番上を取れる。空の山からは取れない', () => {
        const game = newGame();
        const top = game.discards[0].at(-1);
        expect(game.applyCommand(0, { type: 'takeDiscard', pile: 0 })).toBe(true);
        expect(game.players[0].hand).toEqual([top]);
        game.applyCommand(0, { type: 'endTurn' });
        expect(game.applyCommand(1, { type: 'takeDiscard', pile: 0 })).toBe(false);
    });

    it('手番でない人と、今できない操作は断り、状態を変えない', () => {
        const game = newGame();
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'drawDeck' })).toBe(false);
        expect(game.applyCommand(0, { type: 'endTurn' })).toBe(false);
        expect(game.applyCommand(0, { type: 'takeDiscard', pile: 2 })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(game.applyCommand(0, { type: 'stop' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('2枚組', () => {
    // 手番の引く段を済ませた状態にする
    const ready = (game, hand) => {
        game.applyCommand(0, { type: 'takeDiscard', pile: 0 });
        setHand(game, 0, hand);
    };

    it('組にならない2枚や、手札にないカードは出せない', () => {
        const game = newGame();
        ready(game, pick('crab', 'boat', 'shell'));
        const [crab, boat] = game.players[0].hand;
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'duo', cards: [crab, boat] })).toBe(false);
        expect(game.applyCommand(0, { type: 'duo', cards: [crab, crab] })).toBe(false);
        expect(game.applyCommand(0, { type: 'duo', cards: [crab, 57] })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('カニ：捨て札の山を1つ選んで中を見て、1枚を手札に入れる', () => {
        const game = newGame();
        const [c1, c2, s1, s2, s3] = pick('crab', 'crab', 'shell', 'shell', 'shell');
        ready(game, [c1, c2]);
        setPile(game, 1, [s1, s2, s3]);
        expect(game.applyCommand(0, { type: 'duo', cards: [c1, c2] })).toBe(true);
        expect(game.phase).toBe('crab');
        expect(game.applyCommand(0, { type: 'crabTake', card: s1 })).toBe(false); // 先に山を選ぶ
        expect(game.applyCommand(0, { type: 'crabLook', pile: 1 })).toBe(true);
        expect(game.applyCommand(0, { type: 'crabTake', card: s1 })).toBe(true); // 一番下でも取れる
        expect(game.players[0].hand).toContain(s1);
        expect(game.discards[1]).toEqual([s2, s3]);
        expect(game.players[0].duos).toEqual([[c1, c2]]);
        expect(game.phase).toBe('play');
    });

    it('カニ：捨て札が両方空なら効果なし', () => {
        const game = newGame();
        const [c1, c2] = pick('crab', 'crab');
        ready(game, [c1, c2]);
        game.discards = [[], []];
        expect(game.applyCommand(0, { type: 'duo', cards: [c1, c2] })).toBe(true);
        expect(game.phase).toBe('play');
    });

    it('ボート：手番をもう1回行う', () => {
        const game = newGame();
        const [b1, b2] = pick('boat', 'boat');
        ready(game, [b1, b2]);
        game.applyCommand(0, { type: 'duo', cards: [b1, b2] });
        game.applyCommand(0, { type: 'endTurn' });
        expect(game.current).toBe(0);
        expect(game.phase).toBe('draw');
        game.applyCommand(0, { type: 'drawDeck' });
        game.applyCommand(0, { type: 'keep', card: game.drawn[0], pile: 0 });
        game.applyCommand(0, { type: 'endTurn' });
        expect(game.current).toBe(1);
    });

    it('魚：山札の上を1枚手札に入れる', () => {
        const game = newGame();
        const [f1, f2, top] = pick('fish', 'fish', 'octopus');
        ready(game, [f1, f2]);
        stackDeck(game, [top]);
        game.applyCommand(0, { type: 'duo', cards: [f1, f2] });
        expect(game.players[0].hand).toEqual([top]);
    });

    it('泳ぐ人とサメ：相手を選び、その手札から1枚をランダムに取る', () => {
        const game = newGame(3);
        const [sw, sh, o1, o2] = pick('swimmer', 'shark', 'octopus', 'octopus');
        ready(game, [sw, sh]);
        setHand(game, 2, [o1, o2]);
        game.players[1].hand = [];
        // 手札のない人は選べない。相手は必ず選ぶ
        expect(game.applyCommand(0, { type: 'duo', cards: [sw, sh], target: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'duo', cards: [sw, sh] })).toBe(false);
        expect(game.applyCommand(0, { type: 'duo', cards: [sw, sh], target: 2 })).toBe(true);
        expect(game.players[0].hand.length).toBe(1);
        expect(game.players[2].hand.length).toBe(1);
        expect([o1, o2]).toContain(game.players[0].hand[0]);
    });

    it('泳ぐ人とサメ：取れる相手がいなければ、効果なしで出せる', () => {
        const game = newGame();
        const [sw, sh] = pick('swimmer', 'shark');
        ready(game, [sw, sh]);
        game.players[1].hand = [];
        expect(game.applyCommand(0, { type: 'duo', cards: [sw, sh] })).toBe(true);
        expect(game.players[0].duos.length).toBe(1);
    });
});

describe('ラウンドの終わり', () => {
    const toPlay = (game, seat, hand) => {
        game.current = seat;
        game.phase = 'play';
        setHand(game, seat, hand);
    };

    it('7点に届かないと、ストップもラストチャンスもできない', () => {
        const game = newGame();
        toPlay(game, 0, pick('shell', 'shell', 'shell'));
        expect(game.applyCommand(0, { type: 'stop' })).toBe(false);
        expect(game.applyCommand(0, { type: 'lastChance' })).toBe(false);
    });

    it('ストップ：全員がカードの点を得る。次のラウンドは宣言した人の次から', () => {
        const game = newGame(3);
        toPlay(game, 1, sevenPoints());
        setHand(game, 2, pick({ type: 'penguin', color: 'purple' }, { type: 'penguin', color: 'pink' }));
        expect(game.applyCommand(1, { type: 'stop' })).toBe(true);
        expect(game.players.map(p => p.score)).toEqual([0, 7, 3]);
        expect(game.phase).toBe('roundEnd');
        // ラウンドの結果は、だれが進めてもよい
        expect(game.applyCommand(0, { type: 'nextRound' })).toBe(true);
        expect(game.round).toBe(2);
        expect(game.current).toBe(2);
        expect(game.players.every(p => p.hand.length === 0 && p.duos.length === 0)).toBe(true);
    });

    // 宣言した人（席0）と相手（席1）の手札を決めて、ラストチャンスから最後まで進める
    function lastChance(callerHand, otherHand) {
        const game = newGame();
        toPlay(game, 0, callerHand);
        setHand(game, 1, otherHand);
        expect(game.applyCommand(0, { type: 'lastChance' })).toBe(true);
        expect(game.current).toBe(1);
        drawAny(game, 1);
        // 引いたカードで点が変わらないように、引いたものを捨てたことにする
        game.players[1].hand = [...otherHand];
        game.applyCommand(1, { type: 'endTurn' });
        expect(game.phase).toBe('roundEnd');
        return game;
    }

    it('ラストチャンス：宣言した人の点が一番多ければ、点＋色のボーナス。ほかの人は色のボーナスだけ', () => {
        const caller = pick({ type: 'shell', color: 'darkBlue' }, { type: 'shell', color: 'lightBlue' }, { type: 'shell', color: 'black' },
            { type: 'shell', color: 'yellow' }, { type: 'crab', color: 'darkBlue' }, { type: 'crab', color: 'darkBlue' });
        const other = pick({ type: 'octopus', color: 'purple' }, { type: 'penguin', color: 'purple' });
        const game = lastChance(caller, other);
        // 宣言した人：7点＋紺3枚、相手：紫2枚
        expect(game.roundResult.success).toBe(true);
        expect(game.players.map(p => p.score)).toEqual([10, 2]);
    });

    it('ラストチャンス：同点でも成功', () => {
        const game = lastChance(sevenPoints(), pick('penguin', 'penguin', 'penguin', 'boat', 'boat', 'fish', 'fish'));
        expect(game.roundResult.points).toEqual([7, 7]);
        expect(game.roundResult.success).toBe(true);
    });

    it('ラストチャンス：ほかの人のほうが多ければ失敗。宣言した人は色のボーナスだけ、ほかの人はカードの点', () => {
        const other = pick('octopus', 'octopus', 'octopus', 'octopus');
        const game = lastChance(sevenPoints(), other);
        expect(game.roundResult.points).toEqual([7, 9]);
        expect(game.roundResult.success).toBe(false);
        expect(game.players[1].score).toBe(9);
        expect(game.players[0].score).toBe(game.roundResult.bonus[0]);
    });

    it('ラストチャンスの最中は、公開した手札を取れず、ラウンドを終えられない', () => {
        const game = newGame(3);
        toPlay(game, 0, sevenPoints());
        game.applyCommand(0, { type: 'lastChance' });
        const [sw, sh] = pick('swimmer', 'shark');
        drawAny(game, 1);
        setHand(game, 1, [sw, sh]);
        setHand(game, 2, pick('octopus'));
        expect(game.stealTargets(1)).toEqual([2]);
        expect(game.applyCommand(1, { type: 'duo', cards: [sw, sh], target: 0 })).toBe(false);
        game.applyCommand(1, { type: 'endTurn' });
        expect(game.current).toBe(2);
        expect(game.stealTargets(2)).toEqual([]);
    });

    it('手番の終わりに山札がなければ、点なしで終わる', () => {
        const game = newGame();
        toPlay(game, 0, sevenPoints());
        game.deck = [];
        game.applyCommand(0, { type: 'endTurn' });
        expect(game.phase).toBe('roundEnd');
        expect(game.roundResult.reason).toBe('deckEmpty');
        expect(game.players.map(p => p.score)).toEqual([0, 0]);
    });

    it('山札がなくても、ストップは点を数える', () => {
        const game = newGame();
        toPlay(game, 0, sevenPoints());
        game.deck = [];
        game.applyCommand(0, { type: 'stop' });
        expect(game.players[0].score).toBe(7);
    });
});

describe('ゲームの終わり', () => {
    it('人魚を4枚持ったら、その場で勝ち', () => {
        const game = newGame();
        const mermaids = pick('mermaid', 'mermaid', 'mermaid', 'mermaid');
        setHand(game, 0, mermaids.slice(0, 3));
        stackDeck(game, [mermaids[3]]);
        game.applyCommand(0, { type: 'drawDeck' });
        game.applyCommand(0, { type: 'keep', card: mermaids[3], pile: 0 });
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toBe('mermaids');
        expect(game.winners).toEqual([0]);
    });

    it('目標の点に届いたら終わる', () => {
        const game = newGame();
        game.players[0].score = 35;
        game.current = 0;
        game.phase = 'play';
        setHand(game, 0, sevenPoints());
        game.applyCommand(0, { type: 'stop' });
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toBe('target');
        expect(game.winners).toEqual([0]);
    });

    it('同点なら、最後のラウンドで手番の順が後の人が勝つ', () => {
        const ps = [{ id: 0, score: 40 }, { id: 1, score: 40 }, { id: 2, score: 38 }];
        expect(rankPlayers(ps, 0)[0].id).toBe(1);
        expect(rankPlayers(ps, 1)[0].id).toBe(0);
    });
});

describe('記録', () => {
    it('操作の記録から同じゲームを再現でき、余計な項目は記録しない', () => {
        const game = newGame(3, 1, 11);
        game.applyCommand(1, { type: 'drawDeck', extra: 'x' });
        game.applyCommand(1, { type: 'keep', card: game.drawn[1], pile: 0 });
        game.applyCommand(1, { type: 'endTurn' });
        game.applyCommand(2, { type: 'takeDiscard', pile: 0 });
        expect(game.commands[0].command).toEqual({ type: 'drawDeck' });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('取り除いたカードを使う道具が、山札の枚数を合わせる', () => {
        const game = newGame();
        const total = () => game.deck.length + game.discards.flat().length + game.players.flatMap(p => [...p.hand, ...p.duos.flat()]).length;
        setHand(game, 0, pick('crab', 'crab'));
        removeEverywhere(game, []);
        expect(total()).toBe(58);
    });
});
