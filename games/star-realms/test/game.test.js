import { describe, it, expect } from 'vitest';
import { TRADE_CARDS, CARDS } from '../public/js/cards.js';
import { newGame, setHand, putBase, setRow, stackDeck, handKeys, snapshot, make } from './helpers.js';

const play = (g, id, seat = 0) => expect(g.applyCommand(seat, { type: 'play', card: id }), g.lastError).toBe(true);
const choose = (g, answer, seat = 0) => expect(g.applyCommand(seat, { type: 'choose', ...answer }), g.lastError).toBe(true);

describe('準備', () => {
    it('交易デッキ80枚（4勢力20枚ずつ）、スカウト8・バイパー2、権威50、先手は3枚・後手は5枚', () => {
        expect(TRADE_CARDS.reduce((s, c) => s + c.count, 0)).toBe(80);
        ['federation', 'blob', 'machine', 'empire'].forEach(f => expect(TRADE_CARDS.filter(c => c.faction === f).reduce((s, c) => s + c.count, 0)).toBe(20));
        const g = newGame(1);
        expect(g.tradeRow.length).toBe(5);
        expect(g.tradeDeck.length).toBe(75);
        expect(g.explorers).toBe(10);
        expect(g.players.map(p => p.authority)).toEqual([50, 50]);
        expect(g.players.map(p => p.hand.length)).toEqual([3, 5]);
        expect(g.players.map(p => p.deck.length)).toEqual([7, 5]);
        const keys = [...g.players[0].hand, ...g.players[0].deck].map(id => g.keyOf(id)).sort();
        expect(keys).toEqual([...Array(8).fill('scout'), ...Array(2).fill('viper')].sort());
    });

    it('同じシードなら同じ並び', () => {
        expect(snapshot(newGame(4))).toBe(snapshot(newGame(4)));
    });
});

describe('出す・獲得する', () => {
    it('スカウトは交易1、バイパーは戦闘1', () => {
        const g = newGame(2);
        const [s, v] = setHand(g, 0, ['scout', 'viper']);
        play(g, s);
        play(g, v);
        expect([g.turn.trade, g.turn.combat]).toEqual([1, 1]);
        expect(g.players[0].inPlay).toEqual([s, v]);
    });

    it('交易の列から獲得すると捨て札へ。列はすぐ補充される。交易が足りなければ断る', () => {
        const g = newGame(3);
        const row = setRow(g, ['cutter', 'flagship', 'tradePod', 'ram', 'corvette']);
        g.turn.trade = 3;
        expect(g.applyCommand(0, { type: 'buy', card: row[1] })).toBe(false);
        expect(g.lastError).toContain('交易');
        const deck = g.tradeDeck.length;
        expect(g.applyCommand(0, { type: 'buy', card: row[0] })).toBe(true);
        expect(g.turn.trade).toBe(1);
        expect(g.players[0].discard).toContain(row[0]);
        expect(g.tradeRow.length).toBe(5);
        expect(g.tradeRow[0]).not.toBe(row[0]);
        expect(g.tradeDeck.length).toBe(deck - 1);
    });

    it('エクスプローラー：交易2で獲得。廃棄すると戦闘2、山に戻る', () => {
        const g = newGame(3);
        g.turn.trade = 2;
        g.applyCommand(0, { type: 'buy', card: 'explorer' });
        expect(g.explorers).toBe(9);
        const [e] = setHand(g, 0, ['explorer']);
        play(g, e);
        expect(g.turn.trade).toBe(2);
        expect(g.applyCommand(0, { type: 'scrap', card: e })).toBe(true);
        expect(g.turn.combat).toBe(2);
        expect(g.explorers).toBe(10);
        expect(g.players[0].inPlay).not.toContain(e);
    });

    it('手番の終わりに、出した艦と手札を捨て札にして5枚引く。基地は残る', () => {
        const g = newGame(5);
        const [s, base] = setHand(g, 0, ['scout', 'blobWheel', 'viper']);
        play(g, s);
        play(g, base);
        g.applyCommand(0, { type: 'end' });
        const p = g.players[0];
        expect(p.hand.length).toBe(5);
        expect(p.inPlay).toEqual([]);
        expect(p.bases).toEqual([base]);
        expect(g.current).toBe(1);
        expect(g.turn.trade).toBe(0);
    });
});

describe('同盟と基地', () => {
    it('同じ勢力がほかに場にあれば、同盟の能力を使う（あとから出しても、前のカードの分も出る）', () => {
        const g = newGame(6);
        const [cutter, shuttle] = setHand(g, 0, ['cutter', 'federationShuttle']);
        play(g, cutter);
        expect(g.turn.combat).toBe(0);
        play(g, shuttle);
        expect(g.turn.combat).toBe(4);            // カッターの同盟
        expect(g.players[0].authority).toBe(58); // カッター+4、シャトルの同盟+4
    });

    it('前の手番からある基地も同盟に数える。同盟の能力は1手番1回', () => {
        const g = newGame(6);
        putBase(g, 0, 'blobWheel');
        stackDeck(g, 0, ['scout', 'scout', 'scout']);
        const [f1, f2] = setHand(g, 0, ['blobFighter', 'blobFighter']);
        play(g, f1);
        expect(g.players[0].hand.length).toBe(2); // 1枚引いた
        play(g, f2);
        expect(g.players[0].hand.length).toBe(2); // 2枚目も引き、1枚目は引かない
        expect(g.turn.combat).toBe(6);
    });

    it('基地は手番の始めに毎回効果を使う', () => {
        const g = newGame(7);
        putBase(g, 0, 'theHive');
        g.startTurn();
        expect(g.turn.combat).toBe(3);
    });

    it('メックの星は、すべての勢力の同盟として数える', () => {
        const g = newGame(7);
        putBase(g, 0, 'mechWorld');
        const [pod] = setHand(g, 0, ['tradePod']);
        play(g, pod);
        expect([g.turn.trade, g.turn.combat]).toEqual([3, 2]);
    });
});

describe('攻撃', () => {
    it('前哨がある間は、ほかの基地も権威も攻撃できない。基地は耐久以上の戦闘で壊し、持ち主の捨て札へ', () => {
        const g = newGame(8);
        const post = putBase(g, 1, 'tradingPost');
        const wheel = putBase(g, 1, 'blobWheel');
        g.turn.combat = 12;
        expect(g.applyCommand(0, { type: 'attack', target: 'player' })).toBe(false);
        expect(g.applyCommand(0, { type: 'attack', target: wheel })).toBe(false);
        expect(g.lastError).toContain('前哨');
        expect(g.applyCommand(0, { type: 'attack', target: post })).toBe(true);
        expect(g.turn.combat).toBe(8);
        expect(g.players[1].discard).toContain(post);
        expect(g.applyCommand(0, { type: 'attack', target: wheel })).toBe(true);
        expect(g.applyCommand(0, { type: 'attack', target: 'player' })).toBe(true);
        expect(g.players[1].authority).toBe(47);
        expect(g.turn.combat).toBe(0);
    });

    it('前哨でない基地があっても、権威を攻撃できる。戦闘が耐久より少なければ壊せない', () => {
        const g = newGame(8);
        const wheel = putBase(g, 1, 'blobWheel');
        g.turn.combat = 4;
        expect(g.applyCommand(0, { type: 'attack', target: wheel })).toBe(false);
        expect(g.applyCommand(0, { type: 'attack', target: 'player' })).toBe(true);
        expect(g.players[1].authority).toBe(46);
    });

    it('権威が0以下で負け。そのあとは操作を受け付けない', () => {
        const g = newGame(9);
        g.players[1].authority = 3;
        g.turn.combat = 5;
        g.applyCommand(0, { type: 'attack', target: 'player' });
        expect(g.isOver()).toBe(true);
        expect(g.winner).toBe(0);
        expect(g.applyCommand(0, { type: 'end' })).toBe(false);
    });
});

describe('選ぶ効果', () => {
    it('どちらか：交易所は権威1か交易1。選ぶまでほかの操作はできない', () => {
        const g = newGame(10);
        const [post, scout] = setHand(g, 0, ['tradingPost', 'scout']);
        play(g, post);
        expect(g.prompts[0].kind).toBe('or');
        expect(g.applyCommand(0, { type: 'play', card: scout })).toBe(false);
        expect(g.applyCommand(0, { type: 'choose', option: 2 })).toBe(false);
        choose(g, { option: 1 });
        expect(g.turn.trade).toBe(1);
    });

    it('相手は1枚捨てる：相手の次の手番の始めに、相手が選んで捨てる', () => {
        const g = newGame(11);
        const [f] = setHand(g, 0, ['imperialFighter']);
        play(g, f);
        expect(g.players[1].pendingDiscard).toBe(1);
        g.applyCommand(0, { type: 'end' });
        expect(g.actors()).toEqual([1]);
        expect(g.prompts[0]).toMatchObject({ kind: 'discard', seat: 1, count: 1 });
        expect(g.applyCommand(1, { type: 'end' })).toBe(false);
        const card = g.players[1].hand[2];
        choose(g, { cards: [card] }, 1);
        expect(g.players[1].hand.length).toBe(4);
        expect(g.players[1].discard).toContain(card);
    });

    it('捨てるのは、基地の効果より先（基地の効果で引いた札は捨てる対象にならない）', () => {
        const g = newGame(11);
        putBase(g, 1, 'theHive');
        putBase(g, 1, 'blobWheel');
        g.players[1].pendingDiscard = 1;
        g.applyCommand(0, { type: 'end' });
        expect(g.turn.combat).toBe(0);
        expect(g.players[1].hand.length).toBe(5);
        choose(g, { cards: [g.players[1].hand[0]] }, 1);
        expect(g.turn.combat).toBe(4);            // ハイヴ3＋ブロブの輪1
        expect(g.players[1].hand.length).toBe(5); // 4枚＋ハイヴの同盟で1枚
    });

    it('手札か捨て札の廃棄（交易ボット）。選ばなくてもよい', () => {
        const g = newGame(12);
        const [bot] = setHand(g, 0, ['tradeBot']);
        const viper = make(g, 'viper');
        g.players[0].discard.push(viper);
        play(g, bot);
        choose(g, { cards: [viper] });
        expect(g.players[0].discard).not.toContain(viper);
        expect(g.scrapHeap).toContain(viper);
        const [bot2] = setHand(g, 0, ['tradeBot']);
        play(g, bot2);
        choose(g, { cards: [] });
        expect(g.turn.combat).toBe(4); // 2枚目を出すと、2枚とも同盟の能力が出る
    });

    it('交易の列の廃棄（バトルポッド）と、基地の破壊（ミサイルメック。前哨があっても選べる）', () => {
        const g = newGame(13);
        const row = setRow(g, ['flagship', 'cutter', 'ram', 'corvette', 'tradePod']);
        const [pod, mech] = setHand(g, 0, ['battlePod', 'missileMech']);
        play(g, pod);
        choose(g, { cards: [row[0]] });
        expect(g.scrapHeap).toContain(row[0]);
        expect(g.tradeRow.length).toBe(5);
        putBase(g, 1, 'battleStation');
        const wheel = putBase(g, 1, 'blobWheel');
        play(g, mech);
        choose(g, { cards: [wheel] });
        expect(g.players[1].bases.map(id => g.keyOf(id))).toEqual(['battleStation']);
    });

    it('ステルスニードル：ほかの艦を写し、その勢力にもなる（同盟が出る）', () => {
        const g = newGame(14);
        stackDeck(g, 0, ['scout', 'scout', 'scout']);
        const [fighter, needle] = setHand(g, 0, ['blobFighter', 'stealthNeedle']);
        play(g, fighter);
        play(g, needle);
        choose(g, { cards: [fighter] });
        expect(g.turn.combat).toBe(6);
        expect(g.players[0].hand.length).toBe(2); // 戦闘機とニードルの同盟で1枚ずつ
    });

    it('艦隊司令部：出したあとに出す艦ごとに戦闘+1（前に出した艦には付かない）', () => {
        const g = newGame(15);
        const [v1, hq, v2] = setHand(g, 0, ['viper', 'fleetHq', 'viper']);
        play(g, v1);
        play(g, hq);
        play(g, v2);
        expect(g.turn.combat).toBe(3);
    });

    it('ブロブの星：この手番に出したブロブのカード1枚につき1枚引く（自分も数える）', () => {
        const g = newGame(16);
        stackDeck(g, 0, ['scout', 'scout', 'scout', 'scout']);
        const [fighter, world] = setHand(g, 0, ['blobFighter', 'blobWorld']);
        play(g, fighter);
        play(g, world); // ブロブ戦闘機の同盟でも1枚
        const before = g.players[0].hand.length;
        choose(g, { option: 1 });
        expect(g.players[0].hand.length).toBe(before + 2);
    });

    it('リサイクルステーション：2枚まで捨てて、同じ数だけ引く', () => {
        const g = newGame(17);
        putBase(g, 0, 'recyclingStation');
        setHand(g, 0, ['viper', 'scout', 'scout']);
        g.startTurn();
        choose(g, { option: 1 });
        const [a, b] = g.players[0].hand;
        choose(g, { cards: [a, b] });
        expect(g.players[0].hand.length).toBe(3);
        expect(g.players[0].discard).toEqual(expect.arrayContaining([a, b]));
    });

    it('機械基地：1枚引いてから、手札1枚を必ず廃棄する', () => {
        const g = newGame(18);
        const [mb, s] = setHand(g, 0, ['machineBase', 'scout']);
        play(g, mb);
        expect(g.players[0].hand.length).toBe(2);
        expect(g.applyCommand(0, { type: 'choose', cards: [] })).toBe(false);
        choose(g, { cards: [s] });
        expect(g.scrapHeap).toContain(s);
    });

    it('頭脳の星：2枚まで廃棄し、その数だけ引く', () => {
        const g = newGame(19);
        const [bw] = setHand(g, 0, ['brainWorld']);
        const d = [make(g, 'viper'), make(g, 'viper')];
        g.players[0].discard.push(...d);
        play(g, bw);
        choose(g, { cards: d });
        expect(g.players[0].hand.length).toBe(2);
    });

    it('大使館ヨット：基地が2つ以上なら2枚引く', () => {
        const g = newGame(20);
        putBase(g, 0, 'blobWheel');
        putBase(g, 0, 'battleStation');
        const [y] = setHand(g, 0, ['embassyYacht']);
        play(g, y);
        expect(g.players[0].hand.length).toBe(2);
        expect([g.turn.trade, g.players[0].authority]).toEqual([2, 53]);
    });

    it('大使館ヨット：この手番に出した基地も数える', () => {
        const g = newGame(20);
        putBase(g, 0, 'blobWheel');
        const [station, y] = setHand(g, 0, ['battleStation', 'embassyYacht']);
        play(g, station);
        play(g, y);
        expect(g.players[0].hand.length).toBe(2);
    });

    it('貨物船の同盟：次に獲得する艦を山札の上に置く', () => {
        const g = newGame(21);
        const row = setRow(g, ['cutter', 'tradingPost', 'ram', 'corvette', 'tradePod']);
        const [fr, sh] = setHand(g, 0, ['freighter', 'federationShuttle']);
        play(g, fr);
        play(g, sh);
        g.applyCommand(0, { type: 'buy', card: row[1] }); // 基地は捨て札へ
        expect(g.players[0].discard).toContain(row[1]);
        g.applyCommand(0, { type: 'buy', card: row[0] });
        expect(g.players[0].deck[0]).toBe(row[0]);
    });

    it('ブロブ空母の同盟：交易の列の艦をただで獲得し、山札の上に置く', () => {
        const g = newGame(22);
        const row = setRow(g, ['tradingPost', 'flagship', 'ram', 'corvette', 'tradePod']);
        const [carrier, fighter] = setHand(g, 0, ['blobCarrier', 'blobFighter']);
        play(g, carrier);
        stackDeck(g, 0, ['scout']);
        play(g, fighter);
        expect(g.prompts[0].kind).toBe('freeShip');
        expect(g.applyCommand(0, { type: 'choose', cards: [row[0]] })).toBe(false); // 基地は選べない
        choose(g, { cards: [row[1]] });
        expect(g.players[0].deck[0]).toBe(row[1]);
        expect(g.turn.trade).toBe(0);
    });
});

describe('断る操作', () => {
    it('断った操作では状態が変わらない', () => {
        const g = newGame(30);
        const before = snapshot(g);
        [null, { type: 'fly' }, { type: 'play', card: 999 }, { type: 'buy', card: 'explorer' }, { type: 'attack', target: 'player' },
            { type: 'scrap', card: 0 }, { type: 'choose', option: 0 }].forEach(c => expect(g.applyCommand(0, c)).toBe(false));
        expect(g.applyCommand(1, { type: 'end' })).toBe(false);
        expect(snapshot(g)).toBe(before);
        expect(CARDS.scout.cost).toBe(0);
        expect(handKeys(g, 0).length).toBe(3);
    });
});
