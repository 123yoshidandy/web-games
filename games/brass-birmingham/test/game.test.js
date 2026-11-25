import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { incomeLevel, topSpaceOf, buildDeck, buyPrice, sellPrice } from '../public/js/rules.js';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, setTurn, place, lay, apply, snapshot, locCard, indCard, players } from './helpers.js';

describe('収入の段と市場', () => {
    it('マスから収入へ、収入から一番上のマスへ', () => {
        expect(incomeLevel(0)).toBe(-10);
        expect(incomeLevel(10)).toBe(0);
        expect(incomeLevel(11)).toBe(1);
        expect(incomeLevel(12)).toBe(1);
        expect(incomeLevel(30)).toBe(10);
        expect(incomeLevel(31)).toBe(11);
        expect(incomeLevel(60)).toBe(20);
        expect(incomeLevel(61)).toBe(21);
        expect(incomeLevel(99)).toBe(30);
        [-10, -3, 0, 1, 7, 10, 11, 20, 21, 29].forEach(level => expect(incomeLevel(topSpaceOf(level))).toBe(level));
        expect(topSpaceOf(1)).toBe(12);
        expect(topSpaceOf(-3)).toBe(7);
    });

    it('石炭は £1〜£7 が2マスずつで、空なら £8。鉄は £1〜£5 で、空なら £6', () => {
        expect(buyPrice(14, 14)).toBe(1);
        expect(buyPrice(13, 14)).toBe(1);
        expect(buyPrice(12, 14)).toBe(2);
        expect(buyPrice(1, 14)).toBe(7);
        expect(buyPrice(0, 14)).toBe(8);
        expect(buyPrice(8, 10)).toBe(2);
        expect(buyPrice(0, 10)).toBe(6);
        expect(sellPrice(13, 14)).toBe(1);
        expect(sellPrice(0, 14)).toBe(7);
        expect(sellPrice(8, 10)).toBe(1);
    });
});

describe('準備', () => {
    it('人数ごとの山札は 40・54・64 枚で、1人1枚伏せて8枚ずつ配る', () => {
        expect(buildDeck(2)).toHaveLength(40);
        expect(buildDeck(3)).toHaveLength(54);
        expect(buildDeck(4)).toHaveLength(64);
        for (const n of [2, 3, 4]) {
            const game = makeGame(n, 3);
            const s = game.state;
            expect(s.players.every(p => p.hand.length === 8 && p.money === 17 && p.incomeSpace === 10)).toBe(true);
            expect(s.deck.length).toBe(buildDeck(n).length - 9 * n);
            expect(Object.keys(s.merchants)).toHaveLength({ 2: 5, 3: 7, 4: 9 }[n]);
            expect(s.coalMarket).toBe(13);
            expect(s.ironMarket).toBe(8);
            expect(s.actionsLeft).toBe(1);
        }
    });

    it('2人ではストークやダービーのカードを使わない', () => {
        const locs = new Set(buildDeck(2).filter(c => c.kind === 'loc').map(c => c.loc));
        expect(locs.has('stoke')).toBe(false);
        expect(locs.has('derby')).toBe(false);
        expect(locs.has('birmingham')).toBe(true);
    });

    it('同じシードなら同じ配り方、違うシードなら違う配り方', () => {
        expect(JSON.stringify(makeGame(3, 5).state)).toBe(JSON.stringify(makeGame(3, 5).state));
        expect(JSON.stringify(makeGame(3, 5).state)).not.toBe(JSON.stringify(makeGame(3, 6).state));
    });
});

describe('建てる', () => {
    it('場所カードなら、つながっていない町にも建てられる。お金を払い、ボードから外す', () => {
        const game = makeGame(3);
        const [card] = setTurn(game, 0, [locCard('birmingham'), locCard('leek')]);
        apply(game, 0, { type: 'build', card: card.id, slot: 'birmingham:0', industry: 'cotton' });
        const p = game.state.players[0];
        expect(p.money).toBe(5);
        expect(p.mat.cotton).toEqual([2, 2, 3, 3]);
        expect(game.state.board['birmingham:0']).toMatchObject({ owner: 0, industry: 'cotton', level: 1, flipped: false });
        expect(p.hand.map(c => c.id)).not.toContain(card.id);
        expect(game.state.actionsLeft).toBe(1);
    });

    it('産業カードは自分のネットワークの町だけ。盤面に何もなければどこでもよい', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [indCard('coal'), indCard('coal'), locCard('birmingham')]);
        place(game, { 'birmingham:0': { owner: 0, industry: 'cotton', level: 1 } });
        expect(game.applyCommand(0, { type: 'build', card: hand[0].id, slot: 'dudley:0', industry: 'coal' })).toBe(false);
        lay(game, { 'birmingham-dudley': 0 });
        apply(game, 0, { type: 'build', card: hand[0].id, slot: 'dudley:0', industry: 'coal' });
        expect(game.state.board['dudley:0']).toMatchObject({ industry: 'coal', cubes: 2 }); // 商人につながっていないので市場に売らない
    });

    it('その産業だけの場所が空いていれば、先にそこへ建てる', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('birmingham')]);
        place(game, { 'dudley:0': { owner: 1, industry: 'coal', level: 2, cubes: 3 } });
        lay(game, { 'birmingham-dudley': 1 });
        expect(game.applyCommand(0, { type: 'build', card: hand[0].id, slot: 'birmingham:0', industry: 'manufacturer' })).toBe(false);
        expect(game.lastError).toContain('製造所だけの場所');
        apply(game, 0, { type: 'build', card: hand[0].id, slot: 'birmingham:1', industry: 'manufacturer' });
    });

    it('運河の時代は、1つの町に自分のタイルは1枚まで', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('birmingham')]);
        place(game, { 'birmingham:0': { owner: 0, industry: 'cotton', level: 1 } });
        expect(game.applyCommand(0, { type: 'build', card: hand[0].id, slot: 'birmingham:2', industry: 'iron' })).toBe(false);
        expect(game.lastError).toContain('1枚まで');
    });

    it('石炭はつながった炭鉱から取る（ほかの人のものでも）。使い切った炭鉱は裏返り、持ち主の収入が上がる', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('birmingham')]);
        place(game, { 'dudley:0': { owner: 1, industry: 'coal', level: 2, cubes: 1 } });
        lay(game, { 'birmingham-dudley': 1 });
        apply(game, 0, { type: 'build', card: hand[0].id, slot: 'birmingham:1', industry: 'manufacturer' });
        expect(game.state.players[0].money).toBe(17 - 8);
        expect(game.state.board['dudley:0']).toMatchObject({ cubes: 0, flipped: true });
        expect(game.state.players[1].incomeSpace).toBe(10 + 7);
        expect(game.state.coalMarket).toBe(13);
    });

    it('つながった炭鉱がなければ、商人につながっているときだけ市場から買える。買えないときは状態を変えない', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('birmingham')]);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'build', card: hand[0].id, slot: 'birmingham:1', industry: 'manufacturer' })).toBe(false);
        expect(game.lastError).toContain('石炭');
        expect(snapshot(game)).toBe(before);
        lay(game, { 'birmingham-oxford': 2 });
        apply(game, 0, { type: 'build', card: hand[0].id, slot: 'birmingham:1', industry: 'manufacturer' });
        expect(game.state.coalMarket).toBe(12);
        expect(game.state.players[0].money).toBe(17 - 8 - 1);
    });

    it('製鉄所は、市場に空きがある分だけ鉄を売る。売り切れば裏返る', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('coalbrookdale')]);
        place(game, { 'coalbrookdale:2': { owner: 1, industry: 'coal', level: 2, cubes: 3 } });
        game.state.ironMarket = 4;
        apply(game, 0, { type: 'build', card: hand[0].id, slot: 'coalbrookdale:1', industry: 'iron' });
        expect(game.state.ironMarket).toBe(8);
        expect(game.state.players[0].money).toBe(17 - 5 + 3 + 3 + 2 + 2);
        expect(game.state.board['coalbrookdale:1']).toMatchObject({ cubes: 0, flipped: true });
        expect(game.state.players[0].incomeSpace).toBe(13);
    });

    it('炭鉱は、商人につながっていれば市場に売る', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('leek')]);
        lay(game, { 'leek-stoke': 1, 'warrington-stoke': 2 });
        game.state.coalMarket = 10;
        apply(game, 0, { type: 'build', card: hand[0].id, slot: 'leek:1', industry: 'coal' });
        expect(game.state.coalMarket).toBe(12);
        expect(game.state.players[0].money).toBe(17 - 5 + 2 + 2);
        expect(game.state.board['leek:1'].flipped).toBe(true);
    });

    it('ほかの人のタイルの上に建てられるのは、資源がなくなった炭鉱・製鉄所だけ', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('dudley'), locCard('dudley')]);
        game.state.players[0].mat.coal = [0, 2, 2, 2];
        place(game, { 'dudley:0': { owner: 1, industry: 'coal', level: 1, cubes: 0, flipped: true } });
        expect(game.applyCommand(0, { type: 'build', card: hand[0].id, slot: 'dudley:0', industry: 'coal' })).toBe(false);
        game.state.coalMarket = 0;
        apply(game, 0, { type: 'build', card: hand[0].id, slot: 'dudley:0', industry: 'coal' });
        expect(game.state.board['dudley:0']).toMatchObject({ owner: 0, level: 2, cubes: 3 });
    });

    it('鉄道の時代は、レベル1を建てられず、運河の時代は陶器 Lv5 を建てられない', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('stafford')]);
        game.state.players[0].mat.pottery = [0, 0, 0, 0, 1];
        expect(game.applyCommand(0, { type: 'build', card: hand[0].id, slot: 'stafford:1', industry: 'pottery' })).toBe(false);
        game.state.era = 'rail';
        game.state.players[0].mat.pottery = [1, 1, 1, 1, 1];
        expect(game.applyCommand(0, { type: 'build', card: hand[0].id, slot: 'stafford:1', industry: 'pottery' })).toBe(false);
        expect(game.lastError).toContain('レベル1');
    });
});

describe('ネットワーク', () => {
    it('運河は £3 で、自分のネットワークに隣り合うところだけ', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('leek'), locCard('leek')]);
        place(game, { 'birmingham:0': { owner: 0, industry: 'cotton', level: 1 } });
        expect(game.applyCommand(0, { type: 'network', card: hand[0].id, links: ['leek-stoke'] })).toBe(false);
        expect(game.applyCommand(0, { type: 'network', card: hand[0].id, links: ['birmingham-redditch'] })).toBe(false); // 鉄道だけ
        apply(game, 0, { type: 'network', card: hand[0].id, links: ['birmingham-coventry'] });
        expect(game.state.links['birmingham-coventry']).toBe(0);
        expect(game.state.players[0].money).toBe(14);
    });

    it('鉄道は £5＋石炭1。2本なら £15＋石炭2＋ビール1', () => {
        const game = makeGame(3);
        game.state.era = 'rail';
        const hand = setTurn(game, 0, [locCard('leek'), locCard('leek')]);
        apply(game, 0, { type: 'network', card: hand[0].id, links: ['birmingham-oxford'] });
        expect(game.state.players[0].money).toBe(17 - 5 - 1);
        expect(game.state.coalMarket).toBe(12);
        game.state.players[0].money = 40;
        expect(game.applyCommand(0, { type: 'network', card: hand[1].id, links: ['birmingham-coventry', 'walsall-birmingham'] })).toBe(false);
        expect(game.lastError).toContain('ビール');
        place(game, { 'worcester:0': { owner: 0, industry: 'brewery', level: 2, cubes: 2 } });
        apply(game, 0, { type: 'network', card: hand[1].id, links: ['birmingham-coventry', 'walsall-birmingham'] });
        expect(game.state.players[0].money).toBe(40 - 15 - 2 - 2);
        expect(game.state.board['worcester:0'].cubes).toBe(1);
    });
});

describe('売る・借りる・開発・偵察', () => {
    it('商人につながり、ビールがあれば売れる。商人のビールを使うとおまけ（オックスフォードは収入+2）', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('leek'), locCard('leek')]);
        place(game, { 'birmingham:0': { owner: 0, industry: 'cotton', level: 1 } });
        game.state.merchants['oxford:0'] = { tile: 'cotton', beer: 0 };
        game.state.merchants['oxford:1'] = { tile: 'blank', beer: 0 };
        const sale = { type: 'sell', card: hand[0].id, sales: [{ slot: 'birmingham:0', merchant: 'oxford:0' }] };
        expect(game.applyCommand(0, sale)).toBe(false); // つながっていない
        lay(game, { 'birmingham-oxford': 1 });
        expect(game.applyCommand(0, sale)).toBe(false); // ビールがない
        expect(game.lastError).toContain('ビール');
        game.state.merchants['oxford:0'].beer = 1;
        apply(game, 0, sale);
        expect(game.state.board['birmingham:0'].flipped).toBe(true);
        expect(game.state.players[0].incomeSpace).toBe(10 + 5 + 2);
        expect(game.state.merchants['oxford:0'].beer).toBe(0);
    });

    it('その品を買わない商人には売れない', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('leek')]);
        place(game, { 'birmingham:0': { owner: 0, industry: 'cotton', level: 1 } });
        lay(game, { 'birmingham-oxford': 1 });
        game.state.merchants['oxford:0'] = { tile: 'pottery', beer: 1 };
        expect(game.applyCommand(0, { type: 'sell', card: hand[0].id, sales: [{ slot: 'birmingham:0', merchant: 'oxford:0' }] })).toBe(false);
    });

    it('借りると £30 と収入 −3。−10 より下がるなら借りられない', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('leek'), locCard('leek')]);
        apply(game, 0, { type: 'loan', card: hand[0].id });
        expect(game.state.players[0].money).toBe(47);
        expect(game.state.players[0].incomeSpace).toBe(7);
        game.state.players[0].incomeSpace = 1; // 収入 −9
        expect(game.applyCommand(0, { type: 'loan', card: hand[1].id })).toBe(false);
    });

    it('開発は鉄を1つずつ払う。電球の印（陶器 Lv1）は外せない', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('leek'), locCard('leek')]);
        expect(game.applyCommand(0, { type: 'develop', card: hand[0].id, industries: ['pottery'] })).toBe(false);
        apply(game, 0, { type: 'develop', card: hand[0].id, industries: ['cotton', 'cotton'] });
        expect(game.state.players[0].mat.cotton).toEqual([1, 2, 3, 3]);
        expect(game.state.ironMarket).toBe(6);
        expect(game.state.players[0].money).toBe(17 - 2 - 2);
    });

    it('偵察は3枚捨ててワイルドカードを2枚。持っている間はもう偵察できない', () => {
        const game = makeGame(3);
        const hand = setTurn(game, 0, [locCard('leek'), locCard('leek'), locCard('leek'), locCard('leek'), locCard('leek'), locCard('leek')]);
        apply(game, 0, { type: 'scout', cards: hand.slice(0, 3).map(c => c.id) });
        expect(game.state.players[0].hand.map(c => c.kind)).toEqual(['loc', 'loc', 'loc', 'wildLoc', 'wildInd']);
        expect(game.state.wild).toEqual({ loc: 3, ind: 3 });
        expect(game.applyCommand(0, { type: 'scout', cards: hand.slice(3, 6).map(c => c.id) })).toBe(false);
        // ワイルドの場所カードで、つながっていない町に建てる。使ったワイルドカードは戻る
        apply(game, 0, { type: 'build', card: 'wl', slot: 'dudley:0', industry: 'coal' });
        expect(game.state.wild.loc).toBe(4);
    });
});

describe('ラウンドと時代', () => {
    it('最初のラウンドは1アクション。次の順は、使ったお金の少ない順', () => {
        const game = makeGame(3, 8);
        const [a, b, c] = game.state.order;
        const first = (seat) => game.state.players[seat].hand[0].id;
        apply(game, a, { type: 'loan', card: first(a) });
        game.state.players[b].hand[0] = locCard('birmingham');
        apply(game, b, { type: 'build', card: first(b), slot: 'birmingham:0', industry: 'cotton' });
        apply(game, c, { type: 'pass', card: first(c) });
        expect(game.state.round).toBe(2);
        expect(game.state.order).toEqual([a, c, b]);
        expect(game.state.actionsLeft).toBe(2);
        expect(game.state.players.every(p => p.hand.length === 8)).toBe(true);
        expect(game.state.players[a].money).toBe(17 + 30 - 3); // 借りて収入 −3 を払った
    });

    it('運河の時代の終わりに、リンクと裏返ったタイルを数え、運河とレベル1を外して鉄道の時代へ', () => {
        const game = makeGame(3, 2);
        const s = game.state;
        const last = s.order[2];
        s.deck = [];
        s.players.forEach(p => { p.hand = []; });
        s.turnIdx = 2;
        s.actionsLeft = 1;
        s.round = 9;
        s.players[last].hand = [locCard('leek')];
        place(game, {
            'birmingham:0': { owner: 0, industry: 'cotton', level: 2, flipped: true },
            'coventry:0': { owner: 1, industry: 'pottery', level: 1, flipped: true }
        });
        lay(game, { 'birmingham-oxford': 0, 'birmingham-coventry': 1 });
        apply(game, last, { type: 'pass', card: s.players[last].hand[0].id });
        const t = game.state;
        // 0：リンク（バーミンガム2＋オックスフォード2）＋タイル5。1：リンク（バーミンガム2＋コヴェントリー1）＋陶器 10
        expect(t.players[0].vp).toBe(9);
        expect(t.players[1].vp).toBe(13);
        expect(t.era).toBe('rail');
        expect(t.round).toBe(1);
        expect(t.links).toEqual({});
        expect(t.board['coventry:0']).toBeUndefined();
        expect(t.board['birmingham:0']).toBeDefined();
        expect(t.players.every(p => p.hand.length === 8)).toBe(true);
        expect(t.deck).toHaveLength(54 - 24);
        expect(t.actionsLeft).toBe(2);
    });

    it('鉄道の時代の終わりで決着し、得点・収入・お金の順で順位を決める', () => {
        const game = makeGame(2, 4);
        const s = game.state;
        s.era = 'rail';
        s.deck = [];
        s.players.forEach(p => { p.hand = []; });
        const last = s.order[1];
        s.turnIdx = 1;
        s.actionsLeft = 1;
        s.players[last].hand = [locCard('birmingham')];
        s.players[0].vp = 50;
        s.players[1].vp = 50;
        s.players[1].incomeSpace = 20;
        apply(game, last, { type: 'pass', card: s.players[last].hand[0].id });
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
        expect(game.results().map(r => r.rank)).toEqual([1, 2]);
        expect(game.applyCommand(0, { type: 'pass', card: 'x' })).toBe(false);
    });
});

describe('操作の受け付けと記録', () => {
    it('断った操作は状態を変えない', () => {
        const game = makeGame(3, 9);
        const seat = game.turn;
        const other = (seat + 1) % 3;
        const card = game.state.players[seat].hand[0].id;
        const before = snapshot(game);
        const bad = [
            [other, { type: 'pass', card: game.state.players[other].hand[0].id }],
            [seat, { type: 'pass', card: 'nope' }],
            [seat, { type: 'build', card, slot: 'nowhere:0', industry: 'cotton' }],
            [seat, { type: 'build', card, slot: 'birmingham:2', industry: 'cotton' }],
            [seat, { type: 'network', card, links: ['a', 'b', 'c'] }],
            [seat, { type: 'develop', card, industries: ['pottery'] }],
            [seat, { type: 'sell', card, sales: [] }],
            [seat, { type: 'scout', cards: [card, card, card] }],
            [seat, { type: 'proxy', card }],
            [seat, null]
        ];
        bad.forEach(([s, command]) => expect(game.applyCommand(s, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を再現できる。余計な項目は記録しない', () => {
        const game = makeGame(3, 11);
        const seat = game.turn;
        apply(game, seat, { type: 'loan', card: game.state.players[seat].hand[0].id, extra: 'x'.repeat(50) });
        expect(game.commands[0].command).toEqual({ type: 'loan', card: expect.any(String) });
        const copy = Game.replay(game.setup, game.options, JSON.parse(JSON.stringify(game.commands)));
        expect(JSON.stringify(copy.state)).toBe(JSON.stringify(game.state));
    });

    it('ビューには、自分の手札だけと山札の枚数だけを入れる', () => {
        const game = new Game(players(3), { seed: 3 });
        const view = createGameView(game, 1);
        expect(view.state.players[1].hand).toHaveLength(8);
        expect(view.state.players[0].hand).toEqual([]);
        expect(view.state.players[0].handCount).toBe(8);
        expect(view.state.deck).toEqual([]);
        expect(view.state.deckCount).toBe(game.state.deck.length);
        expect(view.state.rng).toBe(0);
    });
});
