import { describe, it, expect } from 'vitest';
import Game, { MERCHANTS, POINT_CARDS, maxTrades, applyUpgrades, scoreOf, endCount, total } from '../public/js/game.js';
import { DECK_IDS, STARTING_IDS } from '../public/js/cards.js';
import { createGameView } from '../public/js/game-view.js';

const names = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 }));
const newGame = (n = 2, seed = 1) => new Game(names(n), { seed });
const code = (c) => MERCHANTS.findIndex(m => m.code === c);
const point = (points, cost) => POINT_CARDS.findIndex(c => c.points === points && c.cost.join() === cost.join());
const snapshot = (g) => JSON.stringify({ ...g, lastError: null, logs: [] });

// 手番の人の手札に、カードを加える（テストのための準備）
function give(g, seat, c) {
    g.players[seat].hand.push(c);
    return c;
}

describe('カードのデータ', () => {
    it('商人カードは山43枚＋最初の手札2種類、得点カードは36枚', () => {
        expect(DECK_IDS).toHaveLength(43);
        expect(STARTING_IDS).toHaveLength(2);
        expect(MERCHANTS).toHaveLength(45);
        expect(POINT_CARDS).toHaveLength(36);
    });

    it('種類ごとの枚数（香辛料8・格上げ1・交換34）', () => {
        const deck = DECK_IDS.map(id => MERCHANTS[id]);
        expect(deck.filter(m => m.kind === 'produce')).toHaveLength(8);
        expect(deck.filter(m => m.kind === 'upgrade')).toHaveLength(1);
        expect(deck.filter(m => m.kind === 'trade')).toHaveLength(34);
    });

    it('得点カードは6〜20点で、必要な香辛料は4〜6個', () => {
        for (const c of POINT_CARDS) {
            expect(c.points).toBeGreaterThanOrEqual(6);
            expect(c.points).toBeLessThanOrEqual(20);
            expect(total(c.cost)).toBeGreaterThanOrEqual(4);
            expect(total(c.cost)).toBeLessThanOrEqual(6);
        }
        expect(POINT_CARDS.reduce((s, c) => s + c.points, 0)).toBe(468);
    });

    it('交換のカードは、出す香辛料の価値が入れる価値より高い', () => {
        const value = (s) => s[0] + s[1] * 2 + s[2] * 3 + s[3] * 4;
        for (const m of MERCHANTS.filter(m => m.kind === 'trade')) expect(value(m.out)).toBeGreaterThan(value(m.in));
    });
});

describe('準備', () => {
    it.each([2, 3, 4, 5])('%i人：商人カード6枚・得点カード5枚・金貨と銀貨は人数×2枚', (n) => {
        const g = newGame(n, 7);
        expect(g.market).toHaveLength(6);
        expect(g.deck).toHaveLength(37);
        expect(g.pointRow).toHaveLength(5);
        expect(g.pointDeck).toHaveLength(31);
        expect(g.coins).toEqual({ gold: n * 2, silver: n * 2 });
        expect(g.coinAt(0)).toBe('gold');
        expect(g.coinAt(1)).toBe('silver');
        for (const p of g.players) expect(p.hand).toEqual([0, 1]);
    });

    it('手番の順に、黄3／黄4／黄4／黄3赤1／黄3赤1をもらう', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const g = newGame(5, seed);
            const expected = [[3, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0], [3, 1, 0, 0], [3, 1, 0, 0]];
            for (let k = 0; k < 5; k++) expect(g.players[(g.first + k) % 5].caravan).toEqual(expected[k]);
            expect(g.current).toBe(g.first);
        }
    });

    it('最初の手番の人はシードで決まり、だれにもなりうる', () => {
        const firsts = new Set();
        for (let seed = 1; seed <= 40; seed++) firsts.add(newGame(3, seed).first);
        expect(firsts.size).toBe(3);
    });

    it('人数の範囲外は作れない', () => {
        expect(() => newGame(1)).toThrow();
        expect(() => newGame(6)).toThrow();
    });
});

describe('出す', () => {
    it('香辛料のカード：描かれた香辛料を得て、使用済みになる', () => {
        const g = newGame();
        const s = g.current;
        expect(g.applyCommand(s, { type: 'play', card: 0 })).toBe(true);
        expect(g.players[s].caravan[0]).toBe(5);
        expect(g.players[s].hand).toEqual([1]);
        expect(g.players[s].played).toEqual([0]);
        expect(g.current).not.toBe(s);
    });

    it('格上げ：1段ずつ、同じ香辛料を続けて上げられる。回数より少なくてもよい', () => {
        const g = newGame();
        const s = g.current;
        g.players[s].caravan = [3, 0, 0, 0];
        expect(g.applyCommand(s, { type: 'play', card: 1, steps: [0, 1] })).toBe(true);
        expect(g.players[s].caravan).toEqual([2, 0, 1, 0]);

        const h = newGame();
        const t = h.current;
        h.players[t].caravan = [3, 0, 0, 0];
        expect(h.applyCommand(t, { type: 'play', card: 1, steps: [0] })).toBe(true);
        expect(h.players[t].caravan).toEqual([2, 1, 0, 0]);
    });

    it('格上げ：回数を超える・茶を上げる・持っていない香辛料を上げる・0回は断る', () => {
        const g = newGame();
        const s = g.current;
        g.players[s].caravan = [1, 0, 0, 1];
        for (const steps of [[0, 1, 2], [3], [1], [], undefined, [0, 0]]) {
            const before = snapshot(g);
            expect(g.applyCommand(s, { type: 'play', card: 1, steps })).toBe(false);
            expect(snapshot(g)).toBe(before);
        }
        expect(applyUpgrades([1, 0, 0, 0], [0, 1, 2], 3)).toEqual([0, 0, 0, 1]);
    });

    it('交換：香辛料がある限り、何回でも続けて交換できる', () => {
        const g = newGame();
        const s = g.current;
        const c = give(g, s, code('T:YY>G'));
        g.players[s].caravan = [7, 0, 0, 0];
        expect(maxTrades(g.players[s].caravan, MERCHANTS[c])).toBe(3);
        expect(g.applyCommand(s, { type: 'play', card: c, times: 4 })).toBe(false);
        expect(g.applyCommand(s, { type: 'play', card: c, times: 0 })).toBe(false);
        expect(g.applyCommand(s, { type: 'play', card: c, times: 3 })).toBe(true);
        expect(g.players[s].caravan).toEqual([1, 0, 3, 0]);
    });

    it('手札にないカード・使用済みのカードは出せない', () => {
        const g = newGame();
        const s = g.current;
        expect(g.applyCommand(s, { type: 'play', card: 5 })).toBe(false);
        g.players[s].hand = [1];
        g.players[s].played = [0];
        expect(g.applyCommand(s, { type: 'play', card: 0 })).toBe(false);
    });
});

describe('取る', () => {
    it('左のカードに香辛料を1個ずつ置き、右のカードが詰めて、山から足される', () => {
        const g = newGame();
        const s = g.current;
        const row = g.market.map(m => m.card);
        const top = g.deck[0];
        const yellow = g.players[s].caravan[0];
        expect(g.applyCommand(s, { type: 'acquire', index: 2, pay: [0, 0] })).toBe(true);
        expect(g.players[s].caravan[0]).toBe(yellow - 2);
        expect(g.players[s].hand).toContain(row[2]);
        expect(g.market.map(m => m.card)).toEqual([row[0], row[1], row[3], row[4], row[5], top]);
        expect(g.market[0].spices).toEqual([1, 0, 0, 0]);
        expect(g.market[1].spices).toEqual([1, 0, 0, 0]);
        expect(g.market[2].spices).toEqual([0, 0, 0, 0]);
    });

    it('左端は無料。取ったカードの上の香辛料ももらえる', () => {
        const g = newGame();
        const s = g.current;
        g.market[0].spices = [2, 1, 0, 0];
        const before = [...g.players[s].caravan];
        expect(g.applyCommand(s, { type: 'acquire', index: 0, pay: [] })).toBe(true);
        expect(g.players[s].caravan).toEqual([before[0] + 2, before[1] + 1, 0, 0]);
    });

    it('置く香辛料の色は自由に選べる', () => {
        const g = newGame();
        const s = g.current;
        g.players[s].caravan = [1, 1, 1, 0];
        expect(g.applyCommand(s, { type: 'acquire', index: 3, pay: [2, 0, 1] })).toBe(true);
        expect(g.market[0].spices).toEqual([0, 0, 1, 0]);
        expect(g.market[1].spices).toEqual([1, 0, 0, 0]);
        expect(g.market[2].spices).toEqual([0, 1, 0, 0]);
        expect(g.players[s].caravan).toEqual([0, 0, 0, 0]);
    });

    it('置く数が合わない・香辛料が足りないときは断る', () => {
        const g = newGame();
        const s = g.current;
        g.players[s].caravan = [2, 0, 0, 0];
        for (const cmd of [{ index: 3, pay: [0, 0] }, { index: 3, pay: [0, 0, 0] }, { index: 1, pay: [1] }, { index: 6, pay: [0, 0, 0, 0, 0, 0] }]) {
            const before = snapshot(g);
            expect(g.applyCommand(s, { type: 'acquire', ...cmd })).toBe(false);
            expect(snapshot(g)).toBe(before);
        }
    });

    it('山が尽きたら、並びは減っていく', () => {
        const g = newGame();
        g.deck = [];
        expect(g.applyCommand(g.current, { type: 'acquire', index: 0, pay: [] })).toBe(true);
        expect(g.market).toHaveLength(5);
    });
});

describe('休む', () => {
    it('使用済みのカードを全部手札に戻す。使用済みがなければ休めない', () => {
        const g = newGame();
        const s = g.current;
        expect(g.applyCommand(s, { type: 'rest' })).toBe(false);
        g.players[s].hand = [1];
        g.players[s].played = [0, 5];
        expect(g.applyCommand(s, { type: 'rest' })).toBe(true);
        expect([...g.players[s].hand].sort((a, b) => a - b)).toEqual([0, 1, 5]);
        expect(g.players[s].played).toEqual([]);
    });
});

describe('得点カードを買う', () => {
    it('香辛料を払う。左端は金貨、2番目は銀貨、3番目以降はなし', () => {
        for (const [index, coin] of [[0, 'gold'], [1, 'silver'], [2, null]]) {
            const g = newGame();
            const s = g.current;
            const id = g.pointRow[index];
            g.players[s].caravan = [5, 5, 5, 5];
            expect(g.applyCommand(s, { type: 'claim', index })).toBe(true);
            expect(g.players[s].points).toEqual([id]);
            expect(g.players[s].caravan).toEqual([0, 1, 2, 3].map(i => 5 - POINT_CARDS[id].cost[i]));
            expect(g.players[s].gold).toBe(coin === 'gold' ? 1 : 0);
            expect(g.players[s].silver).toBe(coin === 'silver' ? 1 : 0);
            expect(g.pointRow).toHaveLength(5);
            expect(g.pointRow).not.toContain(id);
        }
    });

    it('香辛料が足りなければ買えない', () => {
        const g = newGame();
        const s = g.current;
        g.players[s].caravan = [0, 0, 0, 0];
        const before = snapshot(g);
        expect(g.applyCommand(s, { type: 'claim', index: 0 })).toBe(false);
        expect(snapshot(g)).toBe(before);
    });

    it('金貨が尽きたら、銀貨が左端に移る。両方尽きたらおまけはない', () => {
        const g = newGame();
        g.coins = { gold: 0, silver: 1 };
        expect(g.coinAt(0)).toBe('silver');
        expect(g.coinAt(1)).toBe(null);
        const s = g.current;
        g.players[s].caravan = [5, 5, 5, 5];
        expect(g.applyCommand(s, { type: 'claim', index: 0 })).toBe(true);
        expect(g.players[s].silver).toBe(1);
        expect(g.coins).toEqual({ gold: 0, silver: 0 });
        expect(g.coinAt(0)).toBe(null);
    });

    it('最後の金貨を取ると、次からは左端が銀貨になる', () => {
        const g = newGame();
        g.coins.gold = 1;
        const s = g.current;
        g.players[s].caravan = [5, 5, 5, 5];
        g.applyCommand(s, { type: 'claim', index: 0 });
        expect(g.coinAt(0)).toBe('silver');
    });
});

describe('キャラバンの上限', () => {
    it('10個を超えたら、手番を終える前に選んで戻す', () => {
        const g = newGame();
        const s = g.current;
        g.players[s].caravan = [8, 1, 0, 0];
        expect(g.applyCommand(s, { type: 'play', card: 0 })).toBe(true);
        expect(g.phase).toBe('discard');
        expect(g.current).toBe(s);
        expect(g.applyCommand(s, { type: 'rest' })).toBe(false);
        expect(g.applyCommand(s, { type: 'discard', spices: [2, 0, 0, 0] })).toBe(false);
        expect(g.applyCommand(s, { type: 'discard', spices: [0, 0, 1, 0] })).toBe(false);
        expect(g.applyCommand(s, { type: 'discard', spices: [0, 1, 0, 0] })).toBe(true);
        expect(g.players[s].caravan).toEqual([10, 0, 0, 0]);
        expect(g.phase).toBe('play');
        expect(g.current).not.toBe(s);
    });

    it('ちょうど10個なら戻さない', () => {
        const g = newGame();
        const s = g.current;
        g.players[s].caravan = [8, 0, 0, 0];
        g.applyCommand(s, { type: 'play', card: 0 });
        expect(g.phase).toBe('play');
    });
});

describe('終わりと得点', () => {
    // 手番の人に、得点カードをすぐ買えるだけの香辛料を持たせて買わせる
    function claimNow(g) {
        // 10個以下で、どの得点カードも買える量を持たせる
        const cost = POINT_CARDS[g.pointRow[2]].cost;
        g.players[g.current].caravan = [...cost];
        expect(g.applyCommand(g.current, { type: 'claim', index: 2 })).toBe(true);
    }
    const pass = (g) => {
        const p = g.players[g.current];
        if (p.played.length) return g.applyCommand(g.current, { type: 'rest' });
        return g.applyCommand(g.current, { type: 'play', card: p.hand[0], steps: [0] });
    };

    it.each([[2, 6], [3, 6], [4, 5], [5, 5]])('%i人は%i枚目を取った巡の終わりで終わる', (n, count) => {
        expect(endCount(n)).toBe(count);
        const g = newGame(n, 3);
        const first = g.first;
        // 最初の手番の人が count 枚目を取るまで、ほかの人は休むか、黄を上げる
        for (let k = 0; k < count; k++) {
            claimNow(g);
            for (let i = 1; i < n; i++) {
                g.players[g.current].caravan = [3, 0, 0, 0];
                pass(g);
            }
        }
        expect(g.lastRound).toBe(true);
        expect(g.isOver()).toBe(true);

        // 2番目の人が取った場合は、残りの人の手番まで続く
        const h = newGame(n, 3);
        for (let k = 0; k < count; k++) {
            if (h.current === first) { h.players[h.current].caravan = [3, 0, 0, 0]; pass(h); }
            claimNow(h);
            for (let i = 2; i < n; i++) { h.players[h.current].caravan = [3, 0, 0, 0]; pass(h); }
            if (h.isOver()) break;
        }
        expect(h.lastRound).toBe(true);
        expect(h.isOver()).toBe(true);
        expect(h.current).toBe((first + n - 1) % n);
    });

    it('得点は、得点カード＋金貨3点・銀貨1点＋黄以外の香辛料1個1点', () => {
        const p = { points: [point(20, [0, 0, 0, 5]), point(6, [2, 2, 0, 0])], gold: 1, silver: 2, caravan: [5, 1, 2, 3] };
        expect(scoreOf(p)).toBe(20 + 6 + 3 + 2 + 6);
    });

    it('同点なら、手番の順が後の人の勝ち', () => {
        const g = newGame(3, 5);
        g.players.forEach(p => { p.caravan = [0, 1, 0, 0]; });
        g.endGame();
        expect(g.winner).toBe((g.first + 2) % 3);
        const h = newGame(3, 5);
        h.players.forEach(p => { p.caravan = [0, 1, 0, 0]; });
        h.players[h.first].caravan = [0, 2, 0, 0];
        h.endGame();
        expect(h.winner).toBe(h.first);
    });

    it('終わったあとは操作できない', () => {
        const g = newGame();
        g.endGame();
        expect(g.applyCommand(g.current, { type: 'rest' })).toBe(false);
        expect(g.actors()).toEqual([]);
    });
});

describe('受け付けない操作', () => {
    it('手番でない人・知らない操作・形の違う操作は断り、状態を変えない', () => {
        const g = newGame(3);
        const other = (g.current + 1) % 3;
        const before = snapshot(g);
        expect(g.applyCommand(other, { type: 'play', card: 0 })).toBe(false);
        expect(g.applyCommand(g.current, null)).toBe(false);
        expect(g.applyCommand(g.current, { type: 'fly' })).toBe(false);
        expect(g.applyCommand(g.current, { type: 'discard', spices: [0, 0, 0, 0] })).toBe(false);
        expect(g.applyCommand(g.current, { type: 'claim', index: 'x' })).toBe(false);
        expect(g.applyCommand(g.current, { type: 'acquire', index: 1, pay: 'Y' })).toBe(false);
        expect(snapshot(g)).toBe(before);
        expect(g.commands).toEqual([]);
    });
});

describe('記録と再現', () => {
    it('記録する項目だけを残し、同じゲームを作り直せる', () => {
        const g = newGame(3, 11);
        g.applyCommand(g.current, { type: 'play', card: 0, extra: 'x' });
        g.applyCommand(g.current, { type: 'acquire', index: 1, pay: [0] });
        g.applyCommand(g.current, { type: 'play', card: 1, steps: [0, 0] });
        expect(g.commands[0].command).toEqual({ type: 'play', card: 0 });
        const saved = JSON.parse(JSON.stringify(g.persist()));
        const r = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(r)).toBe(snapshot(g));
    });

    it('同じシードなら同じ並び', () => {
        expect(snapshot(newGame(4, 99))).toBe(snapshot(newGame(4, 99)));
        expect(newGame(4, 99).market).not.toEqual(newGame(4, 100).market);
    });
});

describe('見え方', () => {
    it('他の人の手札と山の並びは見えない。使用済み・香辛料・得点は見える', () => {
        const g = newGame(3, 2);
        const s = g.current;
        g.applyCommand(s, { type: 'play', card: 0 });
        const other = (s + 1) % 3;
        const view = createGameView(g, other);
        expect(view.players[other].hand).toEqual([0, 1]);
        expect(view.players[s].hand).toBe(null);
        expect(view.players[s].handCount).toBe(1);
        expect(view.players[s].played).toEqual([0]);
        expect(view.deck).toBeUndefined();
        expect(view.pointDeck).toBeUndefined();
        expect(view.deckCount).toBe(37);
        expect(JSON.stringify(view)).not.toContain(JSON.stringify(g.deck));
        const spectator = createGameView(g, null);
        expect(spectator.players.every(p => p.hand === null)).toBe(true);
    });

    it('since より後の出来事だけを返す', () => {
        const g = newGame();
        g.applyCommand(g.current, { type: 'play', card: 0 });
        g.applyCommand(g.current, { type: 'play', card: 0 });
        expect(createGameView(g, 0, { since: 1 }).events.map(e => e.seq)).toEqual([2]);
    });

    it('終わったら、全員の手札が見える', () => {
        const g = newGame();
        g.endGame();
        expect(createGameView(g, null).players.every(p => Array.isArray(p.hand))).toBe(true);
    });
});
