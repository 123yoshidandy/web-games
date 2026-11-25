import { describe, it, expect } from 'vitest';
import Game, { pointsOf, swordsOf, baseTakes, expeditionPayment } from '../public/js/game.js';
import { CARDS, CARD_COUNT, FIVE_PLAYER_EXPEDITION } from '../public/js/cards.js';
import { newGame, players, find, stackDeck, give, setCoins, coins, snapshot } from './helpers.js';

const ship = (color, swords, used) => find({ kind: 'ship', color, swords }, 1, used)[0];
const cmd = (game, type, extra = {}) => game.applyCommand(game.actors()[0], { type, ...extra });

describe('カードのデータ', () => {
    it('120枚：船50・人物60・遠征6・税金4', () => {
        expect(CARD_COUNT).toBe(120);
        const count = (kind) => CARDS.filter(c => c.kind === kind).length;
        expect([count('ship'), count('person'), count('expedition'), count('tax')]).toEqual([50, 60, 6, 4]);
    });

    it('船は5色×10枚。剣の内訳はルールブックのとおり', () => {
        const swords = (color) => CARDS.filter(c => c.kind === 'ship' && c.color === color).map(c => c.swords ?? 'skull');
        const tally = (list) => Object.fromEntries([...new Set(list)].map(v => [v, list.filter(x => x === v).length]));
        expect(tally(swords('yellow'))).toEqual({ 1: 4, 2: 3, 4: 3 });
        expect(tally(swords('blue'))).toEqual({ 1: 4, 2: 3, 5: 3 });
        expect(tally(swords('green'))).toEqual({ 1: 4, 3: 3, 5: 3 });
        expect(tally(swords('red'))).toEqual({ 1: 3, 3: 3, 6: 2, skull: 2 });
        expect(tally(swords('black'))).toEqual({ 2: 3, 4: 3, 7: 2, skull: 2 });
    });

    it('人物の枚数はルールブックのとおり', () => {
        const count = (role) => CARDS.filter(c => c.role === role).length;
        expect(['trader', 'settler', 'captain', 'priest', 'jack', 'sailor', 'pirate', 'mademoiselle', 'jester', 'admiral', 'governor'].map(count))
            .toEqual([10, 5, 5, 5, 3, 10, 3, 4, 5, 6, 4]);
        ['yellow', 'blue', 'green', 'red', 'black'].forEach(color => expect(CARDS.filter(c => c.role === 'trader' && c.color === color)).toHaveLength(2));
    });

    it('5人用の遠征は、3種の印を1つずつ', () => {
        expect(CARDS[FIVE_PLAYER_EXPEDITION].needs.sort()).toEqual(['anchor', 'cross', 'house']);
    });
});

describe('準備', () => {
    it('各自3コイン。5人用の遠征は5人のときだけ場に出し、それ以外は使わない', () => {
        const game = newGame(3);
        expect(coins(game)).toEqual([3, 3, 3]);
        expect(game.deck).toHaveLength(119 - 9);
        expect(game.deck).not.toContain(FIVE_PLAYER_EXPEDITION);
        expect(game.expeditions).toEqual([]);
        const five = newGame(5);
        expect(five.expeditions).toEqual([FIVE_PLAYER_EXPEDITION]);
        expect(five.deck).toHaveLength(119 - 15);
    });

    it('人数は2〜5人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(6))).toThrow();
    });
});

describe('1. 発見', () => {
    it('最初の1枚は必ずめくる。めくると港に置かれる', () => {
        const game = newGame();
        expect(cmd(game, 'stop')).toBe(false);
        const person = find({ kind: 'ship', color: 'yellow' })[0];
        stackDeck(game, [person]);
        expect(cmd(game, 'draw')).toBe(true);
        expect(game.harbor).toEqual([person]);
        expect(cmd(game, 'stop')).toBe(true);
        expect(game.phase).toBe('trade');
    });

    it('同じ色の船が2隻目なら失敗。港は捨て札へ、手番は次の人', () => {
        const game = newGame();
        const used = new Set();
        const [a, b] = [ship('blue', 1, used), ship('blue', 2, used)];
        const other = ship('red', 1, used);
        stackDeck(game, [a, other, b]);
        cmd(game, 'draw');
        cmd(game, 'draw');
        cmd(game, 'draw');
        expect(game.harbor).toEqual([]);
        expect(game.discardPile).toEqual(expect.arrayContaining([a, b, other]));
        expect(game.current).toBe(1);
        expect(game.phase).toBe('discover');
    });

    it('剣が足りれば撃退できる（選べる）。足りなければ港へ。ドクロは撃退できない', () => {
        const game = newGame();
        give(game, 0, find({ role: 'pirate' }, 1));
        const used = new Set();
        const weak = ship('yellow', 2, used);
        const strong = ship('blue', 5, used);
        const skull = find({ kind: 'ship', color: 'red', swords: null })[0];
        stackDeck(game, [weak, strong, skull]);
        cmd(game, 'draw');
        expect(game.phase).toBe('repel');
        expect(cmd(game, 'repel')).toBe(true);
        expect(game.discardPile).toContain(weak);
        cmd(game, 'draw');
        expect(game.phase).toBe('discover');
        expect(game.harbor).toEqual([strong]);
        cmd(game, 'draw');
        expect(game.harbor).toEqual([strong, skull]);
    });

    it('同じ色でも撃退すれば失敗しない。撃退しなければ失敗', () => {
        const game = newGame();
        give(game, 0, find({ role: 'sailor' }, 1));
        const used = new Set();
        const [a, b] = [ship('green', 1, used), ship('green', 1, used)];
        stackDeck(game, [a, b]);
        cmd(game, 'draw');
        cmd(game, 'keep');
        cmd(game, 'draw');
        expect(game.phase).toBe('repel');
        cmd(game, 'repel');
        expect(game.harbor).toEqual([a]);
        expect(game.current).toBe(0);
    });

    it('失敗したら、道化を持つ人は道化1人につき1コイン', () => {
        const game = newGame();
        give(game, 2, find({ role: 'jester' }, 2));
        const used = new Set();
        stackDeck(game, [ship('black', 2, used), ship('black', 4, used)]);
        cmd(game, 'draw');
        cmd(game, 'draw');
        expect(coins(game)).toEqual([3, 3, 5]);
    });

    it('税金：12コイン以上の人は半分（切り捨て）を捨て、剣の最も多い人（同点はみな）に1コイン', () => {
        const game = newGame();
        setCoins(game, 1, 13);
        setCoins(game, 2, 11);
        give(game, 2, find({ role: 'sailor' }, 1));
        stackDeck(game, [find({ kind: 'tax', bonus: 'swords' })[0]]);
        cmd(game, 'draw');
        expect(coins(game)).toEqual([3, 7, 12]);
    });

    it('税金：点の最も少ない人（同点はみな）に1コイン', () => {
        const game = newGame();
        give(game, 0, find({ role: 'settler' }, 1));
        stackDeck(game, [find({ kind: 'tax', bonus: 'points' })[0]]);
        cmd(game, 'draw');
        expect(coins(game)).toEqual([3, 4, 4]);
    });

    it('遠征は港とは別の場に置き、手番の人が条件の人物を捨てて取る（何でも屋はどれにもなる）', () => {
        const game = newGame();
        const exp = find({ kind: 'expedition' }).find(id => CARDS[id].needs.join() === 'cross,cross') ?? CARDS.find(c => c.kind === 'expedition' && c.needs.join() === 'cross,cross').id;
        const priest = find({ role: 'priest' }, 1);
        const jack = find({ role: 'jack' }, 1);
        give(game, 0, [...priest, ...jack]);
        stackDeck(game, [exp]);
        cmd(game, 'draw');
        expect(game.expeditions).toEqual([exp]);
        expect(game.harbor).toEqual([]);
        expect(expeditionPayment(game.players[0], exp)).toEqual(expect.arrayContaining([...priest, ...jack]));
        expect(cmd(game, 'claim', { card: exp })).toBe(true);
        expect(game.players[0].display).toEqual([]);
        expect(game.players[0].expeditions).toEqual([exp]);
        expect(pointsOf(game.players[0])).toBe(4);
        expect(coins(game)[0]).toBe(5);
    });

    it('条件を満たさない遠征と、ほかの人の手番の遠征は取れない', () => {
        const game = newGame();
        const exp = CARDS.find(c => c.kind === 'expedition' && c.needs.join() === 'anchor,anchor').id;
        game.deck = game.deck.filter(id => id !== exp);
        game.expeditions = [exp];
        give(game, 0, find({ role: 'captain' }, 1));
        give(game, 1, find({ role: 'captain' }, 2));
        expect(cmd(game, 'claim', { card: exp })).toBe(false);
        expect(game.applyCommand(1, { type: 'claim', card: exp })).toBe(false);
    });
});

describe('2. 取引と雇用', () => {
    // 港を決めて、取引と雇用へ進める
    function harborWith(game, ids) {
        stackDeck(game, ids);
        ids.forEach(() => cmd(game, 'draw'));
        cmd(game, 'stop');
    }

    it('取れる枚数：船の色が 0〜3 なら1枚、4なら2枚、5なら3枚', () => {
        const used = new Set();
        const ships = ['yellow', 'blue', 'green', 'red', 'black'].map(c => find({ kind: 'ship', color: c }, 1, used)[0]);
        expect(baseTakes(ships.slice(0, 3))).toBe(1);
        expect(baseTakes(ships.slice(0, 4))).toBe(2);
        expect(baseTakes(ships)).toBe(3);
        expect(baseTakes([...find({ kind: 'person' }, 3)])).toBe(1);
    });

    it('船を取るとそのコイン（同じ色の商人1人につき+1）。人物は費用を払って雇う（マドモアゼルで安くなる）', () => {
        const game = newGame();
        give(game, 0, [find({ role: 'trader', color: 'yellow' })[0], ...find({ role: 'mademoiselle' }, 1)]);
        setCoins(game, 0, 5);
        const used = new Set();
        const y = ship('yellow', 4, used);
        const b = ship('blue', 1, used);
        const g = ship('green', 1, used);
        const r = ship('red', 1, used);
        const admiral = find({ role: 'admiral', cost: 7 })[0];
        harborWith(game, [y, b, g, r, admiral]);
        expect(game.takesLeft).toBe(2);
        cmd(game, 'take', { card: y });
        expect(coins(game)[0]).toBe(5 + CARDS[y].coins + 1);
        const before = coins(game)[0];
        expect(cmd(game, 'take', { card: admiral })).toBe(true);
        expect(coins(game)[0]).toBe(before - 6);
    });

    it('取る順に力が効く：先に船でコインを得て、そのコインで雇える', () => {
        const game = newGame();
        setCoins(game, 0, 0);
        const used = new Set();
        const ships = ['yellow', 'blue', 'green', 'red'].map(c => ship(c, 1, used));
        const sailor = find({ role: 'sailor', cost: 3 })[0];
        harborWith(game, [...ships, sailor]);
        expect(game.takesLeft).toBe(2);
        expect(game.canTake(0, sailor)).toBe(false);
        const rich = ships.find(id => CARDS[id].coins >= 2) ?? ships[0];
        expect(cmd(game, 'take', { card: rich })).toBe(true);
        if (game.players[0].coins.length >= 3) {
            expect(cmd(game, 'take', { card: sailor })).toBe(true);
            expect(game.players[0].display).toContain(sailor);
        }
    });

    it('ほかの人は手番の人に1コイン払って1枚取れる（船ならそのコインから払える）', () => {
        const game = newGame();
        setCoins(game, 1, 0);
        const used = new Set();
        const a = ship('yellow', 1, used);
        const b = ship('blue', 1, used);
        harborWith(game, [a, b]);
        expect(cmd(game, 'take', { card: a })).toBe(true);
        expect(game.taker).toBe(1);
        const before = coins(game);
        expect(game.applyCommand(1, { type: 'take', card: b })).toBe(true);
        const after = coins(game);
        expect(after[0]).toBe(before[0] + 1);
        expect(after[1]).toBe(before[1] + CARDS[b].coins - 1);
    });

    it('総督は1枚多く取れる。提督は取る番に港が5枚以上なら2コイン', () => {
        const game = newGame();
        give(game, 0, [...find({ role: 'governor' }, 1), ...find({ role: 'admiral' }, 1)]);
        const persons = find({ role: 'settler' }, 5);
        harborWith(game, persons);
        expect(game.takesLeft).toBe(2);
        expect(coins(game)[0]).toBe(5);
    });

    it('手番でない人は、取る番に港が空なら、道化1人につき1コイン', () => {
        const game = newGame();
        give(game, 1, find({ role: 'jester' }, 1));
        const a = find({ kind: 'ship', color: 'yellow' })[0];
        harborWith(game, [a]);
        cmd(game, 'take', { card: a });
        expect(coins(game)[1]).toBe(4);
        expect(game.current).toBe(1);
        expect(game.phase).toBe('discover');
    });

    it('コインが足りない人物は雇えず、状態は変わらない', () => {
        const game = newGame();
        const gov = find({ role: 'governor' })[0];
        harborWith(game, [gov, ...find({ role: 'settler' }, 1)]);
        const before = snapshot(game);
        expect(cmd(game, 'take', { card: gov })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('取り終えたら残りは捨て札。手番の人も取らずに終えられる', () => {
        const game = newGame();
        const settler = find({ kind: 'ship', color: 'red', swords: 1 }, 1);
        harborWith(game, settler);
        expect(cmd(game, 'pass')).toBe(true);
        // ほかの人が取らなければ捨て札へ
        while (game.phase === 'trade') game.applyCommand(game.actors()[0], { type: 'pass' });
        expect(game.discardPile).toContain(settler[0]);
        expect(game.harbor).toEqual([]);
    });
});

describe('終わり', () => {
    it('12点に届いたら、その巡の終わり（最初の手番の人の右隣のあと）で終わる', () => {
        const game = newGame(3);
        // 12点ぶんの人物を持たせ、点の判定を起こす
        give(game, 1, find({ role: 'admiral', cost: 9 }, 2));
        give(game, 1, find({ role: 'mademoiselle', cost: 9 }, 2));
        game.checkTrigger(1);
        expect(game.endTriggered).toBe(true);
        const finishTurn = () => {
            const settler = find({ kind: 'person', role: 'priest' }, 1, new Set([...game.players.flatMap(p => p.display), ...game.discardPile]));
            stackDeck(game, settler);
            game.applyCommand(game.current, { type: 'draw' });
            game.applyCommand(game.current, { type: 'stop' });
            while (game.phase === 'trade') game.applyCommand(game.actors()[0], { type: 'pass' });
        };
        finishTurn();
        expect(game.isOver()).toBe(false);
        finishTurn();
        expect(game.isOver()).toBe(false);
        finishTurn();
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
    });

    it('同点はコインの多い人、それも同じなら同点の人がみな勝ち', () => {
        const game = newGame(3);
        give(game, 0, find({ role: 'settler' }, 2));
        give(game, 1, find({ role: 'captain' }, 2));
        setCoins(game, 0, 4);
        setCoins(game, 1, 6);
        game.finish();
        expect(game.winners).toEqual([1]);
        const tie = newGame(3);
        give(tie, 0, find({ role: 'settler' }, 1));
        give(tie, 2, find({ role: 'captain' }, 1));
        tie.finish();
        expect(tie.winners).toEqual([0, 2]);
    });

    it('点は人物と遠征の合計、剣は船乗りと海賊の合計', () => {
        const game = newGame();
        give(game, 0, [...find({ role: 'sailor', cost: 5 }, 1), ...find({ role: 'pirate', cost: 9 }, 1)]);
        expect(pointsOf(game.players[0])).toBe(5);
        expect(swordsOf(game.players[0])).toBe(3);
    });

    it('手番の始めに山も捨て札もなければ、その時点で終わる', () => {
        const game = newGame(2);
        game.players[1].coins.push(...game.deck);
        game.deck = [];
        game.discardPile = [];
        game.endTurn();
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・今はできない操作は断り、状態を変えない', () => {
        const game = newGame();
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'draw' })).toBe(false);
        expect(game.applyCommand(0, { type: 'bogus' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(game.applyCommand(0, { type: 'take', card: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'repel' })).toBe(false);
        expect(game.applyCommand(0, { type: 'claim', card: 999 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});
