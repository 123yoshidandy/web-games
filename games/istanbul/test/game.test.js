import { describe, it, expect } from 'vitest';
import Game, { distance, sultanNeed, postRewards, COMMAND_FIELDS } from '../public/js/game.js';
import { LAYOUTS, CENTER_CELLS, BONUS_CARDS, SMALL_DEMANDS, LARGE_DEMANDS } from '../public/js/data.js';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, players, turnOf, clearSpecial, act, snapshot } from './helpers.js';

describe('準備', () => {
    it('お金は最初の人から2・3・4…リラ。カードを1枚ずつ配り、商人と助手4人は噴水、家族は警察署', () => {
        const game = makeGame(4, 3);
        for (let i = 0; i < 4; i++) expect(game.players[(game.startSeat + i) % 4].lira).toBe(2 + i);
        game.players.forEach(p => {
            expect(p.cards).toHaveLength(1);
            expect(p.merchant).toBe(7);
            expect(p.stack).toBe(4);
            expect(p.family).toBe(12);
            expect(p.goods).toEqual({ red: 0, green: 0, yellow: 0, blue: 0 });
        });
        expect(game.deck.length + game.players.length).toBe(26);
        expect(game.turn).toBe(game.startSeat);
        expect(game.governor).toBeGreaterThanOrEqual(2);
        expect(game.governor).toBeLessThanOrEqual(12);
    });

    it('人数でモスクのタイル・ルビー・宮殿・宝石商が変わる。2人は中立の商人を置く', () => {
        const two = makeGame(2);
        expect(two.mosqueTiles.red).toEqual([2, 4]);
        expect(two.neutrals).toEqual([14, 15, 16]);
        expect(two.gemPrice).toBe(15);
        expect(two.sultanCount).toBe(5);
        expect(two.rubyTarget()).toBe(6);
        const three = makeGame(3);
        expect(three.mosqueTiles.blue).toEqual([2, 3, 4]);
        expect(three.gemPrice).toBe(14);
        const five = makeGame(5);
        expect(five.mosqueTiles.green).toEqual([2, 3, 4, 5]);
        expect(five.mosqueRubies).toEqual({ 14: 4, 15: 4 });
        expect(five.gemPrice).toBe(12);
        expect(five.sultanCount).toBe(4);
        expect(five.rubyTarget()).toBe(5);
    });

    it('ボーナスカードは10種類26枚', () => {
        expect(Object.values(BONUS_CARDS).reduce((s, c) => s + c.count, 0)).toBe(26);
        expect(SMALL_DEMANDS).toHaveLength(5);
        expect(LARGE_DEMANDS).toHaveLength(5);
    });

    it('同じシードなら同じ並び・山札・総督の位置になる', () => {
        expect(snapshot(makeGame(3, 42, 'random'))).toBe(snapshot(makeGame(3, 42, 'random')));
        expect(snapshot(makeGame(3, 42, 'random'))).not.toBe(snapshot(makeGame(3, 43, 'random')));
    });

    it('ランダムな並びでは、噴水が真ん中の4マスにあり、闇市と茶屋が3マス以上離れる', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const { layout } = makeGame(2, seed, 'random');
            expect([...layout].sort((a, b) => a - b)).toEqual(LAYOUTS.order);
            expect(CENTER_CELLS).toContain(layout.indexOf(7));
            expect(distance(layout, 8, 9)).toBeGreaterThanOrEqual(3);
        }
    });

    it('基本の並びは、ランダムな並びの条件も満たす', () => {
        expect(CENTER_CELLS).toContain(LAYOUTS.short.indexOf(7));
        expect(distance(LAYOUTS.short, 8, 9)).toBe(3);
    });
});

describe('移動と助手', () => {
    it('1〜2マス先にだけ動ける。斜めは2マスと数える', () => {
        const game = makeGame(3);
        clearSpecial(game);
        turnOf(game, 0);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'move', to: 16 })).toBe(false); // 3マス
        expect(game.applyCommand(0, { type: 'move', to: 7 })).toBe(false); // 動かない
        expect(snapshot(game)).toBe(before);
        act(game, 0, { type: 'move', to: 6 }); // 斜め下（2マス）
        expect(game.players[0].merchant).toBe(6);
    });

    it('自分の助手がいない場所では助手を1人置き、いる場所では連れ戻す', () => {
        const game = makeGame(3);
        clearSpecial(game);
        const p = turnOf(game, 0, { merchant: 7, stack: 2, assistants: [3] });
        act(game, 0, { type: 'move', to: 2 });
        expect(p.stack).toBe(1);
        expect(p.assistants).toEqual([3, 2]);
        turnOf(game, 0, { merchant: 7 });
        act(game, 0, { type: 'move', to: 3 });
        expect(p.stack).toBe(2);
        expect(p.assistants).toEqual([2]);
    });

    it('連れている助手がいなければ、行動できずに番が終わる。噴水なら行動できる', () => {
        const game = makeGame(3);
        clearSpecial(game);
        const p = turnOf(game, 0, { merchant: 2, stack: 0, assistants: [5, 14, 4, 8] });
        act(game, 0, { type: 'move', to: 3 });
        expect(game.turn).toBe(1);
        expect(p.goods.green).toBe(0);
        turnOf(game, 0, { merchant: 3, stack: 0, assistants: [5, 14, 4, 8] });
        act(game, 0, { type: 'move', to: 7 });
        expect(game.step.stage).toBe('action');
        act(game, 0, { type: 'act' });
        expect(p.stack).toBe(4);
        expect(p.assistants).toEqual([]);
    });

    it('ほかの商人がいれば1人2リラずつ払う。払わなければ番が終わる。噴水では払わない', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.players[1].merchant = 3;
        game.players[2].merchant = 3;
        const p = turnOf(game, 0, { lira: 10 });
        const otherLira = game.players[1].lira;
        act(game, 0, { type: 'move', to: 3 });
        expect(game.step.stage).toBe('pay');
        expect(game.step.payCost).toBe(4);
        act(game, 0, { type: 'pay', accept: true });
        expect(p.lira).toBe(6);
        expect(game.players[1].lira).toBe(otherLira + 2);
        act(game, 0, { type: 'act' });
        expect(p.goods.green).toBe(2);

        turnOf(game, 0, { merchant: 2, lira: 10, goods: {} });
        act(game, 0, { type: 'move', to: 3 });
        act(game, 0, { type: 'pay', accept: false });
        expect(game.turn).toBe(1);
        expect(p.goods.green).toBe(0);
        expect(p.lira).toBe(10);

        game.players[1].merchant = 7;
        turnOf(game, 0, { merchant: 2, lira: 0, assistants: [5] });
        act(game, 0, { type: 'move', to: 7 });
        expect(game.step.stage).toBe('action');
    });

    it('払えないときは、そのまま番が終わる', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.players[1].merchant = 3;
        turnOf(game, 0, { lira: 1, cards: [] });
        act(game, 0, { type: 'move', to: 3 });
        expect(game.turn).toBe(1);
    });

    it('2人のときの中立の商人：2リラを場に払い、その商人はサイコロで動く', () => {
        const game = makeGame(2);
        game.governor = 0;
        game.smuggler = 0;
        const p = turnOf(game, 0, { merchant: 2, lira: 5 });
        game.players[1].merchant = 1;
        act(game, 0, { type: 'move', to: 14 });
        expect(game.step.payCost).toBe(2);
        const otherLira = game.players[1].lira;
        act(game, 0, { type: 'pay', accept: true });
        expect(p.lira).toBe(3);
        expect(game.players[1].lira).toBe(otherLira);
        expect(game.neutrals[0]).toBeGreaterThanOrEqual(2);
        expect(game.neutrals[0]).toBeLessThanOrEqual(12);
    });
});

describe('場所の行動', () => {
    const at = (place, fields = {}, n = 3) => {
        const game = makeGame(n, 7);
        clearSpecial(game);
        game.players.forEach(q => { q.merchant = 0; });
        const p = turnOf(game, 0, { merchant: 0, ...fields });
        game.step = { stage: 'action', place, actPlace: place, via: 'merchant', yellowUsed: false, acted: false };
        p.merchant = place;
        return { game, p };
    };

    it('手押し車工房：7リラで拡張。3つ目でルビー', () => {
        const { game, p } = at(1, { lira: 7, ext: 2 });
        act(game, 0, { type: 'act' });
        expect(p.ext).toBe(3);
        expect(p.lira).toBe(0);
        expect(p.rubies).toBe(1);
    });

    it('倉庫：いっぱいまで積む。緑のタイルで2リラ払って1つ足せる', () => {
        const { game, p } = at(4, { ext: 1, goods: { yellow: 1 }, tiles: ['green'], lira: 3 });
        expect(game.applyCommand(0, { type: 'act', extra: 'yellow' })).toBe(false);
        act(game, 0, { type: 'act', extra: 'blue' });
        expect(p.goods.yellow).toBe(3);
        expect(p.goods.blue).toBe(1);
        expect(p.lira).toBe(1);
    });

    it('郵便局：見えている4マスをもらい、印が1つずつ下りて、5回で元に戻る', () => {
        expect(postRewards(0)).toEqual([{ good: 'green' }, { lira: 1 }, { good: 'yellow' }, { lira: 1 }]);
        expect(postRewards(2)).toEqual([{ good: 'red' }, { lira: 2 }, { good: 'yellow' }, { lira: 1 }]);
        const { game, p } = at(5, { ext: 3, lira: 0 });
        act(game, 0, { type: 'act' });
        expect(p.lira).toBe(2);
        expect(p.goods).toEqual({ red: 0, green: 1, yellow: 1, blue: 0 });
        expect(game.post).toBe(1);
        game.post = 4;
        turnOf(game, 0);
        game.step = { stage: 'action', actPlace: 5, via: 'merchant' };
        act(game, 0, { type: 'act' });
        expect(game.post).toBe(0);
    });

    it('隊商宿：捨て札の上からも引け、2枚引いて1枚捨てる', () => {
        const { game, p } = at(6, { cards: [] });
        game.discard = ['gem2'];
        act(game, 0, { type: 'act' });
        act(game, 0, { type: 'draw', from: 'discard' });
        expect(p.cards).toEqual(['gem2']);
        act(game, 0, { type: 'draw', from: 'deck' });
        expect(game.step.stage).toBe('caravanDiscard');
        act(game, 0, { type: 'discard', index: 0 });
        expect(p.cards).toHaveLength(1);
        expect(game.discard.at(-1)).toBe('gem2');
    });

    it('隊商宿で引いている間は、ボーナスカードを使えない', () => {
        const { game } = at(6, { cards: ['lira5'] });
        act(game, 0, { type: 'act' });
        expect(game.applyCommand(0, { type: 'bonus', card: 'lira5' })).toBe(false);
    });

    it('噴水：置いた助手を好きなだけ戻す', () => {
        const { game, p } = at(7, { stack: 1, assistants: [2, 3, 5] });
        act(game, 0, { type: 'act', places: [2, 5] });
        expect(p.stack).toBe(3);
        expect(p.assistants).toEqual([3]);
    });

    it('闇市：サイコロの出目で宝石、そのあと布・香辛料・果物から1つ', () => {
        const { game, p } = at(8, { ext: 3 });
        act(game, 0, { type: 'act' });
        const dice = game.events.filter(e => e.type === 'dice').at(-1).dice;
        const sum = dice[0] + dice[1];
        expect(p.goods.blue).toBe(sum >= 11 ? 3 : sum >= 9 ? 2 : sum >= 7 ? 1 : 0);
        expect(game.step.stage).toBe('blackGood');
        expect(game.applyCommand(0, { type: 'good', good: 'blue' })).toBe(false);
        act(game, 0, { type: 'good', good: 'red' });
        expect(p.goods.red).toBe(1);
    });

    it('茶屋：賭けた数以上ならその数、届かなければ2リラ', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const { game, p } = at(9, { lira: 0 });
            game.rngState = seed;
            act(game, 0, { type: 'act', bet: 7 });
            const dice = game.events.filter(e => e.type === 'dice').at(-1).dice;
            expect(p.lira).toBe(dice[0] + dice[1] >= 7 ? 7 : 2);
        }
    });

    it('赤のタイル：サイコロを1つ4にできる', () => {
        const { game, p } = at(9, { lira: 0, tiles: ['red'] });
        act(game, 0, { type: 'act', bet: 12 });
        expect(game.step.stage).toBe('dice');
        game.step.dice = [6, 2];
        act(game, 0, { type: 'dice', mode: 'four', die: 1 });
        expect(p.lira).toBe(2);
        const second = at(9, { lira: 0, tiles: ['red'] });
        act(second.game, 0, { type: 'act', bet: 10 });
        second.game.step.dice = [6, 1];
        act(second.game, 0, { type: 'dice', mode: 'four', die: 1 });
        expect(second.p.lira).toBe(10);
    });

    it('市場：需要タイルの品物だけを売り、数で売り上げが決まる。タイルは下へ回る', () => {
        const { game, p } = at(10, { ext: 3, goods: { red: 3, green: 3, yellow: 3, blue: 3 }, lira: 0 });
        const top = game.demand.large[0];
        const demand = LARGE_DEMANDS[top];
        const sell = { ...demand };
        expect(game.applyCommand(0, { type: 'act', sell: { ...demand, red: demand.red + 1 } })).toBe(false);
        act(game, 0, { type: 'act', sell });
        expect(p.lira).toBe(25);
        expect(game.demand.large.at(-1)).toBe(top);

        const small = at(11, { goods: { red: 2 }, lira: 0, cards: ['market'] });
        const smallDemand = SMALL_DEMANDS[small.game.demand.small[0]];
        if (smallDemand.red < 2) expect(small.game.applyCommand(0, { type: 'act', sell: { red: 2 } })).toBe(false);
        act(small.game, 0, { type: 'act', sell: { red: 2 }, card: 'market' });
        expect(small.p.lira).toBe(5);
        expect(small.p.cards).toEqual([]);
    });

    it('警察署：家族を送り、その場所の行動をする。ほかの商人がいても払わない', () => {
        const { game, p } = at(12, { lira: 0 });
        game.players[1].merchant = 3;
        act(game, 0, { type: 'act', to: 3 });
        expect(p.family).toBe(3);
        expect(game.step.actPlace).toBe(3);
        act(game, 0, { type: 'act' });
        expect(p.goods.green).toBe(2);
        expect(p.lira).toBe(0);
    });

    it('スルタンの宮殿：覆われていないマスの品物を全部渡してルビー。次はマスが1つ増える', () => {
        expect(sultanNeed(5)).toEqual({ blue: 1, red: 1, green: 1, yellow: 1, any: 1 });
        expect(sultanNeed(7)).toEqual({ blue: 2, red: 2, green: 1, yellow: 1, any: 1 });
        expect(sultanNeed(11)).toBe(null);
        const { game, p } = at(13, { goods: { red: 2, green: 1, yellow: 1, blue: 1 } });
        act(game, 0, { type: 'act' });
        expect(p.rubies).toBe(1);
        expect(p.goods).toEqual({ red: 0, green: 0, yellow: 0, blue: 0 });
        expect(game.sultanCount).toBe(6);
    });

    it('モスク：品物がそろえばタイルを取って1つ払う。青は5人目の助手、2枚そろうとルビー', () => {
        const { game, p } = at(15, { goods: { blue: 2, yellow: 2 }, stack: 1, tiles: ['yellow'] });
        act(game, 0, { type: 'act', tile: 'blue' });
        expect(p.goods.blue).toBe(1);
        expect(p.stack).toBe(2);
        expect(p.rubies).toBe(1);
        expect(game.mosqueTiles.blue).toEqual([3, 4]);
        expect(game.mosqueRubies[15]).toBe(2);
        const second = at(14, { goods: { red: 1 } });
        expect(second.game.applyCommand(0, { type: 'act', tile: 'red' })).toBe(false);
        expect(second.game.applyCommand(0, { type: 'act', tile: 'blue' })).toBe(false);
    });

    it('宝石商：今の値段を払ってルビー。値段は1つ上がる', () => {
        const { game, p } = at(16, { lira: 14 });
        act(game, 0, { type: 'act' });
        expect(p.rubies).toBe(1);
        expect(p.lira).toBe(0);
        expect(game.gemPrice).toBe(15);
    });

    it('行動できない場所では、行動を飛ばす', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.players.forEach(q => { q.merchant = 0; });
        turnOf(game, 0, { lira: 0, cards: [], merchant: 7 });
        act(game, 0, { type: 'move', to: 1 }); // お金がないので、手押し車工房では何もできない
        expect(game.turn).toBe(1);
    });
});

describe('出会い', () => {
    it('ほかの人の家族を警察署へ送り、3リラかカードをもらう', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.players[1].family = 3;
        game.players.forEach(q => { q.merchant = 0; });
        const p = turnOf(game, 0, { merchant: 7, lira: 0 });
        act(game, 0, { type: 'move', to: 3 });
        act(game, 0, { type: 'act' });
        expect(game.step.stage).toBe('encounter');
        act(game, 0, { type: 'catch', reward: 'lira' });
        expect(game.players[1].family).toBe(12);
        expect(p.lira).toBe(3);
        expect(game.turn).toBe(1);
    });

    it('総督：カードを引いて2リラ払い、総督はサイコロで動く。密輸人：品物をもらい品物で払える', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.governor = 3;
        game.smuggler = 3;
        game.players.forEach(q => { q.merchant = 0; });
        const p = turnOf(game, 0, { merchant: 7, lira: 2, cards: [] });
        act(game, 0, { type: 'move', to: 3 });
        act(game, 0, { type: 'skip' });
        act(game, 0, { type: 'governor', use: true, pay: 'lira' });
        expect(p.cards).toHaveLength(1);
        expect(p.lira).toBe(0);
        expect(game.governor).toBeGreaterThanOrEqual(2);
        expect(game.applyCommand(0, { type: 'smuggler', use: true, good: 'blue', pay: 'lira' })).toBe(false);
        act(game, 0, { type: 'smuggler', use: true, good: 'blue', pay: 'blue' });
        expect(p.goods.blue).toBe(0);
        expect(game.turn).toBe(1);
    });
});

describe('ボーナスカードとタイル', () => {
    it('3〜4マス動く・居残り', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.players.forEach(q => { q.merchant = 0; });
        const p = turnOf(game, 0, { merchant: 7, cards: ['move34', 'stay'], lira: 40 });
        expect(game.applyCommand(0, { type: 'move', to: 16 })).toBe(false);
        act(game, 0, { type: 'move', to: 16, card: 'move34' });
        act(game, 0, { type: 'act' });
        expect(p.rubies).toBe(1);
        turnOf(game, 0);
        const stack = p.stack;
        act(game, 0, { type: 'move', to: 16, card: 'stay' });
        expect(p.stack).toBe(stack - 1);
        expect(p.assistants.filter(x => x === 16)).toHaveLength(2);
        act(game, 0, { type: 'act' });
        expect(p.rubies).toBe(2);
    });

    it('5リラ・品物・助手を戻す・家族の帰還はいつでも使える', () => {
        const game = makeGame(3);
        const p = turnOf(game, 0, { cards: ['lira5', 'good', 'return', 'family'], lira: 0, stack: 0, assistants: [2], family: 9 });
        act(game, 0, { type: 'bonus', card: 'lira5' });
        act(game, 0, { type: 'bonus', card: 'good', good: 'blue' });
        act(game, 0, { type: 'bonus', card: 'return', from: 2 });
        act(game, 0, { type: 'bonus', card: 'family', reward: 'lira' });
        expect(p.lira).toBe(8);
        expect(p.goods.blue).toBe(1);
        expect(p.stack).toBe(1);
        expect(p.family).toBe(12);
        expect(p.cards).toEqual([]);
    });

    it('宮殿で2回：行動のあと、もう一度ルビーを取れる', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.players.forEach(q => { q.merchant = 0; });
        const p = turnOf(game, 0, { merchant: 1, ext: 3, cards: ['gem2'], lira: 40 });
        act(game, 0, { type: 'move', to: 16 });
        act(game, 0, { type: 'act' });
        expect(game.step.stage).toBe('after');
        act(game, 0, { type: 'bonus', card: 'gem2' });
        expect(p.rubies).toBe(2);
        expect(p.lira).toBe(40 - 14 - 15);
    });

    it('黄のタイル：番に1回、2リラで助手を戻す', () => {
        const game = makeGame(3);
        const p = turnOf(game, 0, { tiles: ['yellow'], lira: 4, stack: 0, assistants: [2, 3] });
        act(game, 0, { type: 'yellow', from: 3 });
        expect(game.applyCommand(0, { type: 'yellow', from: 2 })).toBe(false);
        expect(p.stack).toBe(1);
        expect(p.lira).toBe(2);
    });
});

describe('終わり', () => {
    it('ルビーが5個になったら、そのラウンドの最後の人まで続けて終わる', () => {
        const game = makeGame(3);
        clearSpecial(game);
        game.startSeat = 0;
        game.players.forEach(q => { q.merchant = 0; });
        const p = turnOf(game, 1, { merchant: 1, rubies: 4, lira: 20 });
        act(game, 1, { type: 'move', to: 16 });
        act(game, 1, { type: 'act' });
        expect(p.rubies).toBe(5);
        expect(game.endTriggered).toBe(true);
        expect(game.isOver()).toBe(false);
        expect(game.turn).toBe(2);
        game.players[2].merchant = 7;
        act(game, 2, { type: 'move', to: 2 });
        if (game.step?.stage === 'action') act(game, 2, { type: 'skip' });
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
    });

    it('同じルビーの数なら、リラ → 品物 → カードの順で比べる。残った5リラのカードはリラになる', () => {
        const game = makeGame(3);
        game.players[0].rubies = 5;
        game.players[1].rubies = 5;
        game.players[0].lira = 3;
        game.players[0].cards = ['lira5'];
        game.players[1].lira = 7;
        game.endGame();
        expect(game.players[0].lira).toBe(8);
        expect(game.winners).toEqual([0]);
    });
});

describe('記録とビュー', () => {
    it('断った操作は状態を変えない（でたらめな操作を大量に送る）', () => {
        const game = makeGame(4, 5);
        const types = Object.keys(COMMAND_FIELDS);
        const values = [undefined, null, -1, 0, 1, 3, 7, 12, 16, 17, 'red', 'blue', 'lira', 'card', 'deck', 'discard', 'keep', 'four', true, false, [2], { red: 1 }, 'market', 'lira5', 'move34'];
        let seed = 1;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 4000 && !game.isOver(); i++) {
            const command = { type: types[Math.floor(rnd() * types.length)] };
            COMMAND_FIELDS[command.type].forEach(key => { command[key] = values[Math.floor(rnd() * values.length)]; });
            const before = snapshot(game);
            const ok = game.applyCommand(game.turn, command);
            if (!ok) expect(snapshot(game)).toBe(before);
        }
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('ビューには、ほかの人の手札と山札の並びを入れない', () => {
        const game = new Game(players(3), { seed: 2 });
        const view = createGameView(game, 0);
        expect(view.players[0].cards).toEqual(game.players[0].cards);
        expect(view.players[1].cards).toBe(null);
        expect(view.players[1].cardCount).toBe(1);
        expect(view.deck).toBeUndefined();
        expect(JSON.stringify(view)).not.toContain('"deck"');
    });
});
