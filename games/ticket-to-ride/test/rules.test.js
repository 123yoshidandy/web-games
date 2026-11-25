import { describe, it, expect } from 'vitest';
import Game, { connected, longestPath, paymentOptions, DECK_SLOT } from '../public/js/game.js';
import { CITIES, ROUTES, TICKETS, COLORS, LOCO } from '../public/js/map.js';
import { createGameView } from '../public/js/game-view.js';
import { players, started, setHand, snapshot } from './helpers.js';

// 2都市の路線（複線なら color で選ぶ）
const route = (a, b, color) => ROUTES.find(r => ((r.a === a && r.b === b) || (r.a === b && r.b === a)) && (!color || r.color === color)).id;
const total = (game) => {
    const inHands = game.players.reduce((s, p) => s + [...COLORS, LOCO].reduce((t, c) => t + p.hand[c], 0), 0);
    return game.deck.length + game.discard.length + game.faceUp.filter(c => c !== null).length + inHands;
};

describe('カードと地図', () => {
    it('列車カードは110枚（8色×12枚と機関車14枚）。4枚ずつ配り、5枚を表にする', () => {
        const game = new Game(players(3), { seed: 1 });
        expect(total(game)).toBe(110);
        game.players.forEach(p => expect([...COLORS, LOCO].reduce((t, c) => t + p.hand[c], 0)).toBe(4));
        expect(game.faceUp.length).toBe(5);
        const all = [...game.deck, ...game.discard, ...game.faceUp, ...game.players.flatMap(p => [...COLORS, LOCO].flatMap(c => Array(p.hand[c]).fill(c)))];
        COLORS.forEach(c => expect(all.filter(x => x === c).length).toBe(12));
        expect(all.filter(x => x === LOCO).length).toBe(14);
    });

    it('都市36・路線100本（複線22組）。8色の路線の長さは27両ずつ、灰色は93両', () => {
        expect(Object.keys(CITIES).length).toBe(36);
        expect(ROUTES.length).toBe(100);
        expect(ROUTES.filter(r => r.pair !== null).length).toBe(44);
        COLORS.forEach(c => expect(ROUTES.filter(r => r.color === c).reduce((s, r) => s + r.len, 0)).toBe(27));
        expect(ROUTES.filter(r => r.color === 'gray').reduce((s, r) => s + r.len, 0)).toBe(93);
        ROUTES.forEach(r => {
            expect(CITIES[r.a] && CITIES[r.b]).toBeTruthy();
            expect(r.len).toBeGreaterThanOrEqual(1);
            expect(r.len).toBeLessThanOrEqual(6);
        });
    });

    it('目的地は30枚。都市はどれも地図にある', () => {
        expect(TICKETS.length).toBe(30);
        TICKETS.forEach(t => expect(CITIES[t.a] && CITIES[t.b]).toBeTruthy());
        expect(TICKETS.reduce((s, t) => s + t.points, 0)).toBe(349);
    });
});

describe('はじめの目的地', () => {
    it('3枚から2枚以上を、全員が同時に選ぶ。戻した目的地は山の下へ', () => {
        const game = new Game(players(3), { seed: 2 });
        expect(game.phase).toBe('choose');
        expect(game.actors()).toEqual([0, 1, 2]);
        const p = game.players[1];
        expect(game.applyCommand(1, { type: 'keep', tickets: [p.offered[0]] })).toBe(false);
        expect(game.applyCommand(1, { type: 'keep', tickets: [p.offered[0], 99] })).toBe(false);
        expect(game.applyCommand(0, { type: 'draw', slot: DECK_SLOT })).toBe(false);
        const back = p.offered[2];
        expect(game.applyCommand(1, { type: 'keep', tickets: p.offered.slice(0, 2) })).toBe(true);
        expect(game.ticketDeck.at(-1)).toBe(back);
        expect(game.actors()).toEqual([0, 2]);
        [0, 2].forEach(i => game.applyCommand(i, { type: 'keep', tickets: [...game.players[i].offered] }));
        expect(game.phase).toBe('play');
        expect(game.actors()).toEqual([0]);
    });
});

describe('カードを引く', () => {
    it('2枚引いたら次の人。表から取ったら山から補う', () => {
        const game = started(2, 3);
        game.faceUp = ['red', 'blue', 'green', 'white', 'black'];
        game.deck.push('orange');
        expect(game.applyCommand(0, { type: 'draw', slot: 0 })).toBe(true);
        expect(game.faceUp[0]).toBe('orange');
        expect(game.current).toBe(0);
        expect(game.applyCommand(0, { type: 'draw', slot: DECK_SLOT })).toBe(true);
        expect(game.current).toBe(1);
        expect(game.players[0].hand.red).toBeGreaterThanOrEqual(1);
    });

    it('表の機関車は1枚で手番が終わる。2枚目に表の機関車は取れない（山の機関車はよい）', () => {
        const game = started(2, 4);
        game.faceUp = [LOCO, 'blue', 'green', 'white', 'black'];
        game.deck.push('red');
        game.applyCommand(0, { type: 'draw', slot: 0 });
        expect(game.current).toBe(1);
        game.faceUp = [LOCO, 'blue', 'green', 'white', 'black'];
        game.applyCommand(1, { type: 'draw', slot: 1 });
        expect(game.applyCommand(1, { type: 'draw', slot: 0 })).toBe(false);
        game.deck.push(LOCO);
        const before = game.players[1].hand[LOCO];
        expect(game.applyCommand(1, { type: 'draw', slot: DECK_SLOT })).toBe(true);
        expect(game.players[1].hand[LOCO]).toBe(before + 1);
        expect(game.current).toBe(0);
    });

    it('表に機関車が3枚並んだら、5枚とも捨てて並べ直す', () => {
        const game = started(2, 5);
        game.faceUp = [LOCO, LOCO, 'red', 'blue', 'green'];
        game.deck.push(game.deck.splice(game.deck.lastIndexOf(LOCO), 1)[0]);   // 山の機関車を一番上へ
        game.applyCommand(0, { type: 'draw', slot: 2 });
        expect(game.faceUp.filter(c => c === LOCO).length).toBeLessThan(3);
        expect(game.discard).toEqual(expect.arrayContaining([LOCO, LOCO, LOCO, 'blue', 'green']));
    });

    it('山がなくなったら、捨て札を切り直す', () => {
        const game = started(2, 6);
        game.discard.push(...game.deck);
        game.deck = [];
        const before = game.discard.length;
        game.applyCommand(0, { type: 'draw', slot: DECK_SLOT });
        expect(game.deck.length).toBe(before - 1);
        expect(game.discard.length).toBe(0);
    });
});

describe('路線を引く', () => {
    it('色の路線は同じ色で。灰色はどの色でも1色に。機関車はどの色にもなる', () => {
        const game = started(2, 7);
        const p = game.players[0];
        setHand(p, { red: 2, blue: 3, loco: 1 });
        const helenaOmaha = route('helena', 'omaha');   // 赤5
        expect(game.applyCommand(0, { type: 'claim', route: helenaOmaha, color: 'red', locos: 1 })).toBe(false);   // 赤2＋機関車1 では足りない
        expect(game.applyCommand(0, { type: 'claim', route: route('denver', 'oklahomacity'), color: 'blue', locos: 1 })).toBe(false);   // 赤の路線に青
        const lv = route('losangeles', 'lasvegas');   // 灰2
        expect(game.applyCommand(0, { type: 'claim', route: lv, color: 'blue', locos: 1 })).toBe(true);
        expect(p.hand).toMatchObject({ blue: 2, loco: 0, red: 2 });
        expect(p.trains).toBe(43);
        expect(p.points).toBe(2);
        expect(game.claimed[lv]).toBe(0);
        expect(game.discard.slice(-2)).toEqual(['blue', LOCO]);
        expect(game.current).toBe(1);
    });

    it('払い方の一覧は、色ごとに機関車の一番少ない払い方と、機関車だけの払い方', () => {
        const r = ROUTES[route('losangeles', 'phoenix')];   // 灰3
        expect(paymentOptions({ red: 3, blue: 1, green: 0, yellow: 0, orange: 0, pink: 0, white: 0, black: 0, loco: 3 }, r))
            .toEqual([{ color: 'red', locos: 0 }, { color: 'blue', locos: 2 }, { color: LOCO, locos: 3 }]);
    });

    it('複線：1人で両方は引けない。2〜3人なら片方しか使えない。4人以上なら両方使える', () => {
        const g2 = started(2, 8);
        const [a, b] = [route('newyork', 'washington', 'orange'), route('newyork', 'washington', 'black')];
        setHand(g2.players[0], { orange: 2, black: 2 });
        setHand(g2.players[1], { black: 2 });
        g2.applyCommand(0, { type: 'claim', route: a, color: 'orange', locos: 0 });
        expect(g2.applyCommand(1, { type: 'claim', route: b, color: 'black', locos: 0 })).toBe(false);
        const g4 = started(4, 8);
        setHand(g4.players[0], { orange: 2, black: 2 });
        setHand(g4.players[1], { black: 2 });
        g4.applyCommand(0, { type: 'claim', route: a, color: 'orange', locos: 0 });
        expect(g4.routeBlock(g4.players[0], b)).toContain('両方');
        expect(g4.applyCommand(1, { type: 'claim', route: b, color: 'black', locos: 0 })).toBe(true);
    });

    it('カードを1枚引いたあとは、路線を引けない', () => {
        const game = started(2, 9);
        setHand(game.players[0], { red: 6 });
        game.faceUp = ['red', 'blue', 'green', 'white', 'black'];
        game.applyCommand(0, { type: 'draw', slot: 1 });
        expect(game.applyCommand(0, { type: 'claim', route: route('losangeles', 'lasvegas'), color: 'red', locos: 0 })).toBe(false);
    });
});

describe('目的地を引く', () => {
    it('3枚引いて1枚以上を残し、手番が終わる', () => {
        const game = started(2, 10);
        const left = game.ticketDeck.length;
        game.applyCommand(0, { type: 'tickets' });
        const p = game.players[0];
        expect(p.offered.length).toBe(3);
        expect(game.applyCommand(0, { type: 'draw', slot: DECK_SLOT })).toBe(false);
        expect(game.applyCommand(0, { type: 'keep', tickets: [] })).toBe(false);
        expect(game.applyCommand(0, { type: 'keep', tickets: [p.offered[1]] })).toBe(true);
        expect(game.ticketDeck.length).toBe(left - 1);
        expect(game.current).toBe(1);
    });
});

describe('得点', () => {
    it('つながりと、一番長い線路（枝分かれは片方、輪は1周まで）', () => {
        const ids = [route('seattle', 'portland', 'gray'), route('portland', 'saltlakecity'), route('saltlakecity', 'denver', 'red'), route('helena', 'saltlakecity')];
        expect(connected(ids, 'seattle', 'denver')).toBe(true);
        expect(connected(ids, 'seattle', 'omaha')).toBe(false);
        expect(longestPath(ids)).toBe(1 + 6 + 3);
        const loop = [route('kansascity', 'omaha'), route('omaha', 'denver'), route('denver', 'kansascity', 'black'), route('kansascity', 'saintlouis', 'blue')];
        expect(longestPath(loop)).toBe(1 + 4 + 4 + 2);
    });

    it('目的地はつながれば足し、つながらなければ引く。一番長い線路に10点（同じなら全員）', () => {
        const game = started(2, 11);
        const [a, b] = game.players;
        a.tickets = [TICKETS.findIndex(t => t.a === 'denver' && t.b === 'elpaso')];   // 4点
        b.tickets = [TICKETS.findIndex(t => t.a === 'kansascity' && t.b === 'houston')];   // 5点
        a.routes = [route('denver', 'santafe'), route('elpaso', 'santafe')];
        b.routes = [route('kansascity', 'oklahomacity', 'gray'), route('dallas', 'oklahomacity', 'gray')];
        a.points = 4;
        b.points = 4;
        const s = game.scores();
        expect(s[0]).toMatchObject({ ticketPlus: 4, ticketMinus: 0, longest: 4, bonus: 10, total: 18 });
        expect(s[1]).toMatchObject({ ticketPlus: 0, ticketMinus: 5, longest: 4, bonus: 10, total: 9 });
    });

    it('同点なら、達成した目的地の多い人の勝ち', () => {
        const game = started(2, 12);
        const [a, b] = game.players;
        a.tickets = [];
        b.tickets = [TICKETS.findIndex(t => t.a === 'denver' && t.b === 'elpaso')];
        b.routes = [route('denver', 'santafe'), route('elpaso', 'santafe')];
        a.routes = [route('chicago', 'saintlouis', 'green'), route('saintlouis', 'nashville')];
        a.points = 8;
        b.points = 4;
        game.finish();
        expect(game.results[0].total).toBe(game.results[1].total);
        expect(game.winners).toEqual([1]);
    });
});

describe('終わり', () => {
    it('列車が2両以下になったら、その人を含めて全員があと1回ずつ手番をして終わる', () => {
        const game = started(3, 13);
        game.current = 1;
        const p = game.players[1];
        p.trains = 4;
        setHand(p, { red: 2 });
        game.applyCommand(1, { type: 'claim', route: route('losangeles', 'lasvegas'), color: 'red', locos: 0 });
        expect(game.lastPlayer).toBe(1);
        [2, 0].forEach(seat => {
            expect(game.current).toBe(seat);
            game.applyCommand(seat, { type: 'draw', slot: DECK_SLOT });
            game.applyCommand(seat, { type: 'draw', slot: DECK_SLOT });
        });
        expect(game.isOver()).toBe(false);
        game.applyCommand(1, { type: 'draw', slot: DECK_SLOT });
        game.applyCommand(1, { type: 'draw', slot: DECK_SLOT });
        expect(game.isOver()).toBe(true);
    });

    it('何もできないときだけ、見送れる', () => {
        const game = started(2, 14);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
        game.deck = [];
        game.discard = [];
        game.faceUp = [null, null, null, null, null];
        game.ticketDeck = [];
        setHand(game.players[0], {});
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(game.current).toBe(1);
    });
});

describe('ビューと記録', () => {
    it('ほかの人の手札と目的地は、枚数だけ見える。終わったら目的地は見える', () => {
        const game = started(3, 15);
        const view = createGameView(game, 0);
        expect(view.players[0].hand).not.toBe(null);
        expect(view.players[1].hand).toBe(null);
        expect(view.players[1].tickets).toBe(null);
        expect(view.players[1].handCount).toBe(4);
        expect(view.players[1].score.ticketPlus).toBeUndefined();
        expect(JSON.stringify(view)).not.toContain('"deck"');
        game.applyCommand(0, { type: 'tickets' });
        expect(createGameView(game, 1).players[0].offered).toBe(null);
        expect(createGameView(game, 0).players[0].offered.length).toBe(3);
        game.finish();
        expect(createGameView(game, 0).players[1].tickets.length).toBeGreaterThan(0);
    });

    it('断る操作は状態を変えない', () => {
        const game = started(2, 16);
        const before = snapshot(game);
        [{ type: 'claim', route: 0, color: 'red', locos: 0 }, { type: 'draw', slot: 9 }, { type: 'keep', tickets: [1] }, { type: 'pass' },
            { type: 'claim', route: 999, color: 'red', locos: 0 }, { type: 'nope' }, null]
            .forEach(c => expect(game.applyCommand(0, c)).toBe(false));
        expect(game.applyCommand(1, { type: 'draw', slot: DECK_SLOT })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('人数は2〜5人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(6))).toThrow();
        expect(() => new Game(players(5))).not.toThrow();
    });
});
