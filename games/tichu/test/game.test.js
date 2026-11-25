import { describe, it, expect } from 'vitest';
import Game, { teamOf, partnerOf } from '../public/js/game.js';
import { MAHJONG, DOG, PHOENIX, DRAGON, cardOf, sortCards } from '../public/js/cards.js';
import { createGameView } from '../public/js/game-view.js';

const c = cardOf;
const players = () => [{ name: 'あなた' }, { name: 'A', isCPU: true }, { name: '味方', isCPU: true }, { name: 'B', isCPU: true }];
const snapshot = (g) => JSON.stringify({ hands: g.hands, table: g.table, won: g.won, phase: g.phase, current: g.current, calls: g.calls, scores: g.scores, wish: g.wish, passes: g.passes, exchange: g.exchange, commands: g.commands });

// 札を出す場面を作る（hands は席ごとの札）。足りない札は、ほかの札で埋めず、そのまま
function playing(hands, current = 0, extra = {}) {
    const g = new Game(players(), { seed: 1 });
    g.hands = hands.map(h => sortCards(h));
    g.grandDecided = [true, true, true, true];
    g.exchange = [[], [], [], []];
    g.phase = 'play';
    g.current = current;
    Object.assign(g, extra);
    return g;
}
const play = (g, seat, cards, wish) => g.applyCommand(seat, wish === undefined ? { type: 'play', cards } : { type: 'play', cards, wish });
const pass = (g, seat) => g.applyCommand(seat, { type: 'pass' });

describe('配る・宣言・受け渡し', () => {
    it('8枚ずつ配り、全員が大ティチューを決めたら残りの6枚を配る', () => {
        const g = new Game(players(), { seed: 3 });
        expect(g.phase).toBe('grand');
        expect(g.hands.map(h => h.length)).toEqual([8, 8, 8, 8]);
        expect(g.actors()).toEqual([0, 1, 2, 3]);
        g.applyCommand(1, { type: 'grand', call: true });
        expect(g.calls[1]).toBe('grand');
        expect(g.applyCommand(1, { type: 'grand', call: false })).toBe(false);
        [0, 2, 3].forEach(s => g.applyCommand(s, { type: 'grand', call: false }));
        expect(g.phase).toBe('exchange');
        expect(g.hands.map(h => h.length)).toEqual([14, 14, 14, 14]);
        expect(new Set(g.hands.flat()).size).toBe(56);
    });

    it('左・向かい・右に1枚ずつ渡し、麻雀を持つ人から出す', () => {
        const g = new Game(players(), { seed: 4 });
        [0, 1, 2, 3].forEach(s => g.applyCommand(s, { type: 'grand', call: false }));
        const gifts = [0, 1, 2, 3].map(s => g.hands[s].slice(0, 3));
        expect(g.applyCommand(0, { type: 'exchange', cards: [gifts[0][0], gifts[0][0], gifts[0][1]] })).toBe(false);
        expect(g.applyCommand(0, { type: 'exchange', cards: [gifts[1][0], gifts[0][1], gifts[0][2]] })).toBe(false);
        [0, 1, 2, 3].forEach(s => expect(g.applyCommand(s, { type: 'exchange', cards: gifts[s] })).toBe(true));
        expect(g.phase).toBe('play');
        expect(g.hands[1]).toContain(gifts[0][0]); // 席0の左（次の人）は席1
        expect(g.hands[2]).toContain(gifts[0][1]); // 向かい
        expect(g.hands[3]).toContain(gifts[0][2]); // 右
        expect(g.received[1][0]).toBe(gifts[0][0]);
        expect(g.hands.every(h => h.length === 14)).toBe(true);
        expect(g.hands[g.current]).toContain(MAHJONG);
    });

    it('小ティチューは、最初の札を出す前ならいつでも（大ティチューの人はできない）', () => {
        const g = new Game(players(), { seed: 5 });
        expect(g.applyCommand(0, { type: 'tichu' })).toBe(false); // 6枚を配る前
        g.applyCommand(0, { type: 'grand', call: true });
        [1, 2, 3].forEach(s => g.applyCommand(s, { type: 'grand', call: false }));
        expect(g.applyCommand(0, { type: 'tichu' })).toBe(false);
        expect(g.applyCommand(1, { type: 'tichu' })).toBe(true);
        expect(g.applyCommand(1, { type: 'tichu' })).toBe(false);
        const h = playing([[c(0, 3), c(0, 4)], [c(1, 9)], [c(2, 9)], [c(3, 9)]]);
        play(h, 0, [c(0, 3)]);
        expect(h.applyCommand(0, { type: 'tichu' })).toBe(false);
        expect(h.applyCommand(2, { type: 'tichu' })).toBe(true);
    });
});

describe('出す・パス・場を取る', () => {
    it('同じ形のより強い組だけ出せる。全員がパスしたら最後に出した人が取り、次を出す', () => {
        const g = playing([[c(0, 3), c(0, 12)], [c(1, 5), c(1, 2)], [c(2, 4), c(2, 8)], [c(3, 6), c(3, 7)]]);
        expect(pass(g, 0)).toBe(false); // 最初に出す人はパスできない
        expect(play(g, 0, [c(0, 3)])).toBe(true);
        expect(play(g, 1, [c(1, 2)])).toBe(false);
        expect(play(g, 1, [c(1, 5)])).toBe(true);
        expect(pass(g, 2)).toBe(true);
        expect(pass(g, 3)).toBe(true);
        expect(pass(g, 0)).toBe(true);
        expect(g.won[1].sort()).toEqual([c(0, 3), c(1, 5)].sort());
        expect(g.current).toBe(1);
        expect(g.table).toEqual([]);
    });

    it('場を取った人が上がっていれば、次の人が出す', () => {
        const g = playing([[c(0, 14)], [c(1, 5), c(1, 2)], [c(2, 4), c(2, 8)], [c(3, 6), c(3, 7)]]);
        play(g, 0, [c(0, 14)]);
        expect(g.finished).toEqual([0]);
        pass(g, 1);
        pass(g, 2);
        pass(g, 3);
        expect(g.won[0]).toEqual([c(0, 14)]);
        expect(g.current).toBe(1);
    });

    it('犬：味方に出す番を渡す。味方が上がっていれば、その次の人', () => {
        const g = playing([[DOG, c(0, 3)], [c(1, 5)], [c(2, 4)], [c(3, 6)]]);
        expect(play(g, 0, [DOG])).toBe(true);
        expect(g.current).toBe(2);
        expect(g.table).toEqual([]);
        const h = playing([[DOG, c(0, 3)], [c(1, 5), c(1, 9)], [], [c(3, 6)]], 0, { finished: [2] });
        play(h, 0, [DOG]);
        expect(h.current).toBe(3);
        // 犬は場があるときには出せない
        const k = playing([[c(0, 3), c(0, 9)], [DOG, c(1, 9)], [c(2, 4)], [c(3, 6)]]);
        play(k, 0, [c(0, 3)]);
        expect(play(k, 1, [DOG])).toBe(false);
    });

    it('竜で取った場は、相手のどちらかに渡す', () => {
        const g = playing([[c(0, 3), c(0, 9)], [DRAGON, c(1, 9)], [c(2, 4), c(2, 10)], [c(3, 6), c(3, 13)]]);
        play(g, 0, [c(0, 3)]);
        play(g, 1, [DRAGON]);
        pass(g, 2);
        pass(g, 3);
        pass(g, 0);
        expect(g.phase).toBe('dragon');
        expect(g.actors()).toEqual([1]);
        expect(g.applyCommand(1, { type: 'dragon', to: 3 })).toBe(false); // 味方には渡せない
        expect(g.applyCommand(1, { type: 'dragon', to: 2 })).toBe(true);
        expect(g.won[2].sort()).toEqual([c(0, 3), DRAGON].sort());
        expect(g.current).toBe(1);
        expect(g.phase).toBe('play');
    });

    it('爆弾は、番でなくても場の組に勝てば出せる（場がないときは出せない）', () => {
        const bomb = [c(0, 2), c(1, 2), c(2, 2), c(3, 2)];
        const g = playing([[c(0, 9), c(0, 10)], [c(1, 12), c(1, 13)], [...bomb, c(2, 5)], [c(3, 6), c(3, 14)]]);
        expect(play(g, 2, bomb)).toBe(false);
        play(g, 0, [c(0, 9)]);
        expect(play(g, 2, [c(2, 5)])).toBe(false);
        expect(play(g, 2, bomb)).toBe(true);
        expect(g.current).toBe(3);
        pass(g, 3);
        pass(g, 0);
        pass(g, 1);
        expect(g.won[2].length).toBe(5);
    });

    it('麻雀の願い：願いの数を出せる人は出さなければならず、パスもできない。出たら願いは消える', () => {
        const g = playing([[MAHJONG, c(0, 3)], [c(1, 8), c(1, 12)], [c(2, 4), c(2, 9)], [c(3, 6), c(3, 8)]]);
        expect(play(g, 0, [MAHJONG], 15)).toBe(false);
        expect(play(g, 0, [MAHJONG], 8)).toBe(true);
        expect(g.wish).toBe(8);
        expect(pass(g, 1)).toBe(false);
        expect(play(g, 1, [c(1, 12)])).toBe(false);
        expect(g.lastError).toContain('願い');
        expect(play(g, 1, [c(1, 8)])).toBe(true);
        expect(g.wish).toBe(null);
        // 持っていない人は自由
        expect(pass(g, 2)).toBe(true);
    });

    it('麻雀の願い：場に勝てないなら出さなくてよい。不死鳥を使えば出せるなら、出さなければならない', () => {
        const g = playing([[MAHJONG, c(0, 3)], [c(1, 13), c(1, 9)], [c(2, 5), PHOENIX], [c(3, 6)]]);
        play(g, 0, [MAHJONG], 5);
        play(g, 1, [c(1, 13)]);
        expect(pass(g, 2)).toBe(true); // 5 は K に勝てない
        const h = playing([[c(0, 9), c(1, 9)], [c(1, 12), MAHJONG], [c(2, 12), PHOENIX, c(2, 3)], [c(3, 6)]], 0, { wish: 12 });
        play(h, 0, [c(0, 9), c(1, 9)]);
        expect(h.playOptions(1).wishBound).toBe(false); // Q が1枚ではペアにできない
        expect(pass(h, 1)).toBe(true);
        expect(pass(h, 2)).toBe(false); // Q と不死鳥でペアにできる
        expect(play(h, 2, [c(2, 12), PHOENIX])).toBe(true);
    });

    it('通らない操作は状態を変えない', () => {
        const g = playing([[c(0, 3), c(0, 4)], [c(1, 9)], [c(2, 9)], [c(3, 9)]]);
        const before = snapshot(g);
        expect(play(g, 1, [c(1, 9)])).toBe(false);
        expect(play(g, 0, [c(0, 3), c(0, 4)])).toBe(false);
        expect(play(g, 0, [c(1, 9)])).toBe(false);
        expect(g.applyCommand(0, { type: 'dragon', to: 1 })).toBe(false);
        expect(g.applyCommand(0, { type: 'grand', call: true })).toBe(false);
        expect(g.applyCommand(0, { type: 'fly' })).toBe(false);
        expect(g.applyCommand(9, { type: 'pass' })).toBe(false);
        expect(snapshot(g)).toBe(before);
    });
});

describe('ラウンドの終わりと点', () => {
    it('ダブル勝利：味方どうしが1・2番目なら200点（札の点は数えない）。宣言は数える', () => {
        const g = playing([[c(0, 14)], [c(1, 5), c(1, 2)], [c(2, 13)], [c(3, 6), c(3, 7)]], 0, { calls: ['tichu', null, null, null] });
        play(g, 0, [c(0, 14)]);
        pass(g, 1);
        pass(g, 2);
        pass(g, 3);
        play(g, 1, [c(1, 2)]);
        play(g, 2, [c(2, 13)]);
        const r = g.rounds.at(-1);
        expect(r.detail).toBe('double');
        expect(r.total).toEqual([300, 0]);
        expect(g.scores).toEqual([300, 0]);
        expect(g.round).toBe(2);
        expect(g.phase).toBe('grand');
    });

    it('最後の人の手札は相手のチームへ、取った札は1番目に上がった人へ', () => {
        const g = playing([[c(0, 2)], [c(1, 3)], [c(2, 4)], [c(3, 10), c(3, 13), c(3, 5)]], 0, {
            won: [[], [], [], [c(0, 13), DRAGON]], finished: []
        });
        play(g, 0, [c(0, 2)]); // 席0が1番目
        play(g, 1, [c(1, 3)]); // 席1が2番目
        play(g, 2, [c(2, 4)]); // 席2が3番目。残りは席3
        const r = g.rounds.at(-1);
        // 席3の手札（10・K・5 = 25点）は相手（チーム0）へ。席3の取った札（K・竜 = 35点）は席0へ（チーム0）。場（2・3・4）は席2が取る
        expect(r.cardPoints).toEqual([60, 0]);
        expect(r.finished).toEqual([0, 1, 2, 3]);
    });

    it('宣言：1番目に上がれば +100（大は +200）、上がれなければ −100（−200）', () => {
        const g = playing([[c(0, 2)], [c(1, 3)], [c(2, 4)], [c(3, 6), c(3, 7)]], 0, { calls: [null, 'grand', null, 'tichu'] });
        play(g, 0, [c(0, 2)]);
        play(g, 1, [c(1, 3)]);
        play(g, 2, [c(2, 4)]);
        expect(g.rounds.at(-1).bonus).toEqual([0, -300]);
    });

    it('目標に届き、点が違えば終わり。同じならもう1ラウンド', () => {
        const g = playing([[c(0, 14)], [c(1, 5), c(1, 2)], [c(2, 13)], [c(3, 6), c(3, 7)]], 0, { scores: [850, 900] });
        play(g, 0, [c(0, 14)]);
        pass(g, 1);
        pass(g, 2);
        pass(g, 3);
        play(g, 1, [c(1, 2)]);
        play(g, 2, [c(2, 13)]);
        expect(g.scores).toEqual([1050, 900]);
        expect(g.isOver()).toBe(true);
        expect(g.winner).toBe(0);
        const h = playing([[c(0, 14)], [c(1, 5), c(1, 2)], [c(2, 13)], [c(3, 6), c(3, 7)]], 0, { scores: [900, 1100] });
        play(h, 0, [c(0, 14)]);
        pass(h, 1);
        pass(h, 2);
        pass(h, 3);
        play(h, 1, [c(1, 2)]);
        play(h, 2, [c(2, 13)]);
        expect(h.scores).toEqual([1100, 1100]);
        expect(h.isOver()).toBe(false);
    });

    it('目標は 1000 か 500', () => {
        expect(new Game(players(), { seed: 1 }).options.target).toBe(1000);
        expect(new Game(players(), { seed: 1, target: 500 }).options.target).toBe(500);
        expect(new Game(players(), { seed: 1, target: 77 }).options.target).toBe(1000);
    });
});

describe('記録と見え方', () => {
    it('記録から同じゲームを作り直せる', () => {
        const g = new Game(players(), { seed: 8 });
        [0, 1, 2, 3].forEach(s => g.applyCommand(s, { type: 'grand', call: false, extra: 1 }));
        [0, 1, 2, 3].forEach(s => g.applyCommand(s, { type: 'exchange', cards: g.hands[s].slice(0, 3) }));
        const s = g.current;
        g.applyCommand(s, { type: 'play', cards: [MAHJONG], wish: 7 });
        expect(g.commands[0].command).toEqual({ type: 'grand', call: false });
        const saved = JSON.parse(JSON.stringify(g.persist()));
        const r = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(r)).toBe(snapshot(g));
    });

    it('ほかの人の手札・渡した札は見えない。自分の番なら出せる組が付く', () => {
        const g = new Game(players(), { seed: 9 });
        [0, 1, 2, 3].forEach(s => g.applyCommand(s, { type: 'grand', call: false }));
        g.applyCommand(1, { type: 'exchange', cards: g.hands[1].slice(0, 3) });
        const view = createGameView(g, 0);
        expect(view.hand).toEqual(g.hands[0]);
        expect(view.players[1].count).toBe(14);
        expect(view.players[1].exchanged).toBe(true);
        expect(JSON.stringify(view)).not.toContain(JSON.stringify(g.exchange[1]));
        expect(view.myExchange).toBe(null);
        expect(createGameView(g, null).hand).toBe(null);
        const h = playing([[c(0, 3), c(0, 4)], [c(1, 9)], [c(2, 9)], [c(3, 9)]]);
        expect(createGameView(h, 0).options.combos.length).toBe(2);
        expect(createGameView(h, 1).options).toBe(null);
    });

    it('番でなくても、場に勝てる爆弾は付く', () => {
        const bomb = [c(0, 2), c(1, 2), c(2, 2), c(3, 2)];
        const g = playing([[c(0, 9), c(0, 10)], [c(1, 12)], [...bomb, c(2, 5)], [c(3, 6)]]);
        play(g, 0, [c(0, 9)]);
        expect(createGameView(g, 2).bombs.length).toBe(1);
        expect(teamOf(2)).toBe(0);
        expect(partnerOf(1)).toBe(3);
    });
});
