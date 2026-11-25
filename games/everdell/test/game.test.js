import { describe, it, expect } from 'vitest';
import Game, { HAND_LIMIT, CITY_LIMIT } from '../public/js/game.js';
import { CARDS, buildDeck, SPECIAL_EVENTS } from '../public/js/cards.js';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, players, addCity, setup, answer, act, snapshot } from './helpers.js';
import { playMatch } from '../scripts/cpu-match.mjs';

describe('準備', () => {
    it('同じシードなら同じ山札・草原・手札になる', () => {
        expect(snapshot(makeGame(3, 7))).toBe(snapshot(makeGame(3, 7)));
        expect(snapshot(makeGame(3, 7))).not.toBe(snapshot(makeGame(3, 8)));
    });

    it('手札は最初の人から5・6・7・8枚、草原は8枚、ワーカーは2人', () => {
        const game = makeGame(4, 3);
        const order = [0, 1, 2, 3].map(i => game.players[(game.first + i) % 4]);
        expect(order.map(p => p.hand.length)).toEqual([5, 6, 7, 8]);
        expect(game.meadow.filter(Boolean)).toHaveLength(8);
        expect(game.players.every(p => p.workers === 2 && p.season === 0)).toBe(true);
        const total = game.deck.length + game.meadow.length + game.players.reduce((s, p) => s + p.hand.length, 0);
        expect(total).toBe(buildDeck().length);
    });

    it('森の場所は2人なら3か所、3〜4人なら4か所。特別な行事は4つ', () => {
        expect(makeGame(2).forest).toHaveLength(3);
        expect(makeGame(3).forest).toHaveLength(4);
        expect(makeGame(4).specials).toHaveLength(4);
    });

    it('カードは基本セットの48種', () => {
        expect(Object.keys(CARDS)).toHaveLength(48);
        expect(Object.values(CARDS).filter(c => c.kind === 'critter')).toHaveLength(24);
        // 住民が使う建造物は、その住民を pairs に持っている
        Object.entries(CARDS).filter(([, c]) => c.kind === 'critter').forEach(([id, c]) => {
            expect(CARDS[c.occupies].pairs, id).toContain(id);
        });
    });
});

describe('ワーカー', () => {
    it('基本の場所で資源を得る。1人だけの場所には2人目を置けない（断っても状態は変わらない）', () => {
        const game = makeGame(2, 1);
        const a = game.turn;
        const b = 1 - a;
        act(game, a, { type: 'place', loc: 'b-twig3' });
        expect(game.players[a].res.twig).toBe(3);
        expect(game.turn).toBe(b);
        const before = snapshot(game);
        expect(game.applyCommand(b, { type: 'place', loc: 'b-twig3' })).toBe(false);
        expect(game.applyCommand(a, { type: 'place', loc: 'b-berry' })).toBe(false); // 手番ではない
        expect(snapshot(game)).toBe(before);
        act(game, b, { type: 'place', loc: 'b-twig2' });
        expect(game.players[b].res.twig).toBe(2);
    });

    it('ワーカーを全部置くまで季節の準備はできない。春の準備でワーカーが増え、緑のカードが動く', () => {
        const game = makeGame(2, 2);
        const a = game.turn;
        addCity(game, a, 'farm', 'mine');
        expect(game.applyCommand(a, { type: 'prepare' })).toBe(false);
        game.players[a].placed = ['b-berry', 'b-berry'];
        act(game, a, { type: 'prepare' });
        const p = game.players[a];
        expect(p.season).toBe(1);
        expect(p.workers).toBe(3);
        expect(p.placed).toEqual([]);
        expect(p.res.berry).toBe(1);
        expect(p.res.pebble).toBe(1);
    });

    it('夏の準備で草原から2枚まで取れる。秋はワーカーが2人増える', () => {
        const game = makeGame(2, 3);
        const a = game.turn;
        const p = game.players[a];
        p.season = 1;
        p.workers = 3;
        p.placed = ['b-berry', 'b-berry', 'b-berry'];
        p.hand = ['farm'];
        act(game, a, { type: 'prepare' });
        expect(game.prompt.tag).toBe('meadow-take');
        expect(game.prompt.max).toBe(2);
        const taken = [game.meadow[0], game.meadow[1]];
        answer(game, ['m0', 'm1']);
        expect(p.hand).toEqual(['farm', ...taken]);
        expect(game.meadow.filter(Boolean)).toHaveLength(8);
        game.turn = a;
        p.placed = ['b-berry', 'b-berry', 'b-berry', 'b-berry'];
        act(game, a, { type: 'prepare' });
        expect(p.season).toBe(3);
        expect(p.workers).toBe(6);
    });

    it('旅は秋だけ。手札を捨てて点を得る', () => {
        const game = makeGame(2, 4);
        const a = game.turn;
        const p = game.players[a];
        p.hand = ['farm', 'mine', 'inn'];
        expect(game.applyCommand(a, { type: 'place', loc: 'journey-3' })).toBe(false);
        p.season = 3;
        p.workers = 6;
        act(game, a, { type: 'place', loc: 'journey-3' });
        answer(game, ['h0', 'h1', 'h2']);
        expect(p.hand).toEqual([]);
        expect(game.scoreOf(a).journey).toBe(3);
    });

    it('港では2枚捨てるごとに好きな資源を1つ得る', () => {
        const game = makeGame(2, 5);
        const a = game.turn;
        setup(game, { hand: { [a]: ['farm', 'mine', 'inn', 'wife', 'king'] } });
        act(game, a, { type: 'place', loc: 'haven' });
        answer(game, ['h0', 'h1', 'h2', 'h3', 'h4']);
        answer(game, ['pebble']);
        answer(game, ['resin']);
        expect(game.players[a].res).toMatchObject({ pebble: 1, resin: 1 });
        expect(game.players[a].hand).toEqual([]);
        expect(game.prompt).toBe(null);
    });

    it('相手の宿屋を使うと、持ち主に1点が入る', () => {
        const game = makeGame(2, 6);
        const a = game.turn;
        const b = 1 - a;
        const [inn] = addCity(game, b, 'inn');
        setup(game, { res: { [a]: { berry: 0 } }, meadow: ['wanderer', 'farm', 'mine', 'king', 'queen', 'inn', 'ruins', 'judge'] });
        act(game, a, { type: 'place', loc: `card-${inn.uid}` });
        expect(game.players[b].points).toBe(1);
        // 放浪者（ベリー2）は3つ安くなって無料
        expect(game.prompt.options.map(o => o.value)).toContain('m0');
        answer(game, ['m0']);
        expect(game.players[a].city.map(c => c.id)).toEqual(['wanderer']);
    });
});

describe('カードを出す', () => {
    it('費用を払って街に出す。ユニークなカードは2枚目を出せない', () => {
        const game = makeGame(2, 7);
        const a = game.turn;
        setup(game, { res: { [a]: { twig: 3, resin: 2, pebble: 2 } }, hand: { [a]: ['courthouse', 'courthouse', 'farm'] } });
        act(game, a, { type: 'play', source: 'hand', index: 0, method: 'pay' });
        expect(game.players[a].city.map(c => c.id)).toEqual(['courthouse']);
        expect(game.players[a].res).toMatchObject({ twig: 2, resin: 1, pebble: 0 });
        game.turn = a;
        const before = snapshot(game);
        expect(game.applyCommand(a, { type: 'play', source: 'hand', index: 0, method: 'pay' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        // 裁判所：建造物を出したあとに資源を1つ
        act(game, a, { type: 'play', source: 'hand', index: 1, method: 'pay' });
        expect(game.prompt.tag).toBe('gain');
        expect(game.prompt.options.map(o => o.value)).toEqual(['twig', 'resin', 'pebble']);
        answer(game, ['pebble']);
        expect(game.players[a].res.pebble).toBe(1);
    });

    it('建造物があれば、対応する住民を1回だけ無料で出せる', () => {
        const game = makeGame(2, 8);
        const a = game.turn;
        const [farm] = addCity(game, a, 'farm');
        setup(game, { hand: { [a]: ['husband', 'wife'] } });
        const methods = game.playOptions(a).filter(o => o.source === 'hand').map(o => o.method);
        expect(methods).toEqual(['occupy', 'occupy']);
        act(game, a, { type: 'play', source: 'hand', index: 0, method: 'occupy' });
        expect(farm.occupied).toBe(true);
        game.turn = a;
        expect(game.applyCommand(a, { type: 'play', source: 'hand', index: 0, method: 'occupy' })).toBe(false);
    });

    it('夫と妻は組で1枠。妻は組なら3点を足す', () => {
        const game = makeGame(2, 9);
        const a = game.turn;
        addCity(game, a, 'husband', 'wife');
        expect(game.slotsUsed(game.players[a])).toBe(1);
        expect(game.scoreOf(a).cards).toBe(4);
        expect(game.scoreOf(a).bonus).toBe(3);
    });

    it('街は15枠まで。放浪者は枠を使わない', () => {
        const game = makeGame(2, 10);
        const a = game.turn;
        addCity(game, a, ...Array(CITY_LIMIT).fill('farm'));
        setup(game, { res: { [a]: { twig: 9, resin: 9, pebble: 9, berry: 9 } }, hand: { [a]: ['mine', 'wanderer'] } });
        expect(game.playOptions(a).map(o => o.id)).toEqual(['wanderer']);
        const hand = game.players[a].hand.length;
        act(game, a, { type: 'play', source: 'hand', index: 1, method: 'pay' });
        expect(game.players[a].hand.length).toBe(Math.min(HAND_LIMIT, hand - 1 + 3));
    });

    it('クレーンを捨てると、建造物が3つ安くなる。裁判官は足りない資源1つをほかで払える', () => {
        const game = makeGame(2, 11);
        const a = game.turn;
        addCity(game, a, 'crane');
        setup(game, { res: { [a]: { pebble: 1 } }, hand: { [a]: ['mine'] } });
        const crane = game.playOptions(a).find(o => o.method === 'crane');
        expect(crane.cost).toMatchObject({ twig: 0, resin: 0, pebble: 0 });
        act(game, a, { type: 'play', source: 'hand', index: 0, method: 'crane' });
        expect(game.players[a].city.map(c => c.id)).toEqual(['mine']);
        expect(game.players[a].res.pebble).toBe(2); // 鉱山の生産で1つ増える

        const g2 = makeGame(2, 12);
        const b = g2.turn;
        addCity(g2, b, 'judge');
        setup(g2, { res: { [b]: { twig: 2, berry: 1 } }, hand: { [b]: ['farm'] } });
        const pay = g2.playOptions(b).find(o => o.method === 'pay');
        expect(pay.cost).toMatchObject({ twig: 2, resin: 0, berry: 1 });
    });

    it('遺跡は建造物を捨て、その費用を受け取ってカードを2枚引く', () => {
        const game = makeGame(2, 13);
        const a = game.turn;
        const [mine] = addCity(game, a, 'mine');
        setup(game, { hand: { [a]: ['ruins'] } });
        act(game, a, { type: 'play', source: 'hand', index: 0, method: 'pay' });
        answer(game, [String(mine.uid)]);
        const p = game.players[a];
        expect(p.city.map(c => c.id)).toEqual(['ruins']);
        expect(p.res).toMatchObject({ twig: 1, resin: 1, pebble: 1 });
        expect(p.hand).toHaveLength(2);
    });

    it('道化は相手の街に出て −2 点', () => {
        const game = makeGame(2, 14);
        const a = game.turn;
        const b = 1 - a;
        setup(game, { res: { [a]: { berry: 3 } }, hand: { [a]: ['fool'] } });
        const opt = game.playOptions(a).find(o => o.id === 'fool');
        expect(opt.target).toBe(b);
        act(game, a, { type: 'play', source: 'hand', index: 0, method: 'pay', target: b });
        expect(game.players[b].city.map(c => c.id)).toEqual(['fool']);
        expect(game.scoreOf(b).cards).toBe(-2);
    });

    it('歴史家・店主はほかのカードを出したあとに効く', () => {
        const game = makeGame(2, 15);
        const a = game.turn;
        addCity(game, a, 'historian', 'shopkeeper');
        setup(game, { res: { [a]: { berry: 2 } }, hand: { [a]: ['wife'] } });
        act(game, a, { type: 'play', source: 'hand', index: 0, method: 'pay' });
        expect(game.players[a].hand).toHaveLength(1);
        expect(game.players[a].res.berry).toBe(1);
    });

    it('紫の繁栄は終わりに加点する', () => {
        const game = makeGame(2, 16);
        const a = game.turn;
        addCity(game, a, 'castle', 'farm', 'farm', 'mine', 'palace', 'school', 'husband', 'architect');
        game.players[a].res = { twig: 0, resin: 4, pebble: 4, berry: 0 };
        // 城：ふつうの建造物3、宮殿：ユニークな建造物3（城・宮殿・学校）、学校：ふつうの住民1、建築家：6まで
        expect(game.scoreOf(a).bonus).toBe(3 + 3 + 1 + 6);
    });
});

describe('行事と目的地', () => {
    it('基本の行事は、色のカードがそろえば達成できて3点', () => {
        const game = makeGame(2, 17);
        const a = game.turn;
        expect(game.applyCommand(a, { type: 'place', loc: 'e-prod' })).toBe(false);
        addCity(game, a, 'farm', 'farm', 'mine', 'twigBarge');
        act(game, a, { type: 'place', loc: 'e-prod' });
        expect(game.claimed['e-prod']).toBe(a);
        expect(game.scoreOf(a).events).toBe(3);
        game.turn = 1 - a;
        addCity(game, 1 - a, 'farm', 'farm', 'mine', 'twigBarge');
        expect(game.applyCommand(1 - a, { type: 'place', loc: 'e-prod' })).toBe(false);
    });

    it('特別な行事：花火の夕べは小枝を置いて1つ2点', () => {
        const game = makeGame(2, 18);
        game.specials = ['s-fireworks', ...game.specials.filter(id => id !== 's-fireworks').slice(0, 3)];
        const a = game.turn;
        addCity(game, a, 'lookout', 'minerMole');
        game.players[a].res.twig = 5;
        act(game, a, { type: 'place', loc: 's-fireworks' });
        answer(game, ['3']);
        expect(game.players[a].res.twig).toBe(2);
        expect(game.scoreOf(a).events).toBe(6);
    });

    it('礼拝堂は使うたびにトークンが増え、その2倍のカードを引く', () => {
        const game = makeGame(2, 19);
        const a = game.turn;
        const [chapel] = addCity(game, a, 'chapel');
        game.players[a].hand = [];
        act(game, a, { type: 'place', loc: `card-${chapel.uid}` });
        expect(chapel.tokens).toBe(1);
        expect(game.players[a].hand).toHaveLength(2);
        expect(game.scoreOf(a).tokens).toBe(1);
    });

    it('修道院のワーカーは季節の準備でも戻らない', () => {
        const game = makeGame(2, 20);
        const a = game.turn;
        const [monastery] = addCity(game, a, 'monastery');
        game.players[a].res = { twig: 1, resin: 1, pebble: 0, berry: 0 };
        act(game, a, { type: 'place', loc: `card-${monastery.uid}` });
        answer(game, ['twig']);
        answer(game, ['resin']);
        expect(game.players[a].points).toBe(4);
        expect(game.players[1 - a].res).toMatchObject({ twig: 1, resin: 1 });
        game.turn = a;
        game.players[a].placed.push('b-berry');
        act(game, a, { type: 'prepare' });
        expect(game.players[a].placed).toEqual([`card-${monastery.uid}`]);
        expect(game.available(game.players[a])).toBe(2);
    });

    it('時計塔：季節の準備の前に、トークンを1つ外して場所をもう一度使える', () => {
        const game = makeGame(2, 21);
        const a = game.turn;
        const [tower] = addCity(game, a, 'clockTower');
        game.players[a].placed = ['b-twig3', 'b-berry'];
        act(game, a, { type: 'prepare' });
        expect(game.prompt.tag).toBe('clock');
        answer(game, ['b-twig3']);
        expect(tower.tokens).toBe(2);
        expect(game.players[a].res.twig).toBe(3);
        expect(game.players[a].season).toBe(1);
    });
});

describe('進行と記録', () => {
    it('秋に全員が終えると終わり、点の多い人が勝つ', () => {
        const game = makeGame(2, 22);
        const a = game.turn;
        expect(game.applyCommand(a, { type: 'pass' })).toBe(false);
        game.players.forEach(p => { p.season = 3; });
        addCity(game, 1 - a, 'king');
        act(game, a, { type: 'pass' });
        expect(game.turn).toBe(1 - a);
        act(game, 1 - a, { type: 'pass' });
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1 - a]);
    });

    it('CPU の試合を記録から再現すると、同じ状態になる', () => {
        [[2, 31], [3, 32], [4, 33]].forEach(([n, seed]) => {
            const game = playMatch({ profiles: Array(n).fill('normal'), seed });
            expect(game.isOver()).toBe(true);
            const again = Game.replay(game.persist().players, game.options, game.commands);
            expect(snapshot(again)).toBe(snapshot(game));
        });
    });

    it('ランダムな操作をしても、断った操作で状態は変わらない', () => {
        const game = new Game(players(3), { seed: 40 });
        let r = 12345;
        const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
        for (let step = 0; step < 300 && !game.isOver(); step++) {
            const seat = game.actors()[0];
            const before = snapshot(game);
            const bad = [{ type: 'place', loc: 'nowhere' }, { type: 'play', source: 'hand', index: 99, method: 'pay' }, { type: 'answer', id: -1, values: [] }, { type: 'pass' }];
            const cmd = bad[Math.floor(rnd() * bad.length)];
            if (game.applyCommand(seat, cmd)) continue; // 秋の pass は正しい操作として受け付けられる
            expect(snapshot(game)).toBe(before);
            if (game.prompt) {
                const p = game.prompt;
                answer(game, p.options.slice(0, p.min).map(o => o.value));
                continue;
            }
            const p = game.players[seat];
            const options = [
                ...game.allLocations(p).filter(loc => game.checkPlace(p, loc) === null).map(loc => ({ type: 'place', loc })),
                ...game.playOptions(seat).map(o => ({ type: 'play', source: o.source, index: o.index, method: o.method, target: o.target }))
            ];
            if (game.canPrepare(p)) options.push({ type: 'prepare' });
            if (p.season === 3) options.push({ type: 'pass' });
            act(game, seat, options[Math.floor(rnd() * options.length)]);
        }
    });
});

describe('ビュー', () => {
    it('ほかの人の手札と山札の並び、ほかの人の選択の中身は見せない', () => {
        const game = makeGame(3, 50);
        const a = game.turn;
        const other = (a + 1) % 3;
        const view = createGameView(game, other);
        expect(view.players[a].hand).toBe(null);
        expect(view.players[other].hand).toEqual(game.players[other].hand);
        expect(view.deck).toBeUndefined();
        expect(view.deckCount).toBe(game.deck.length);
        game.players[a].hand = ['farm', 'mine'];
        act(game, a, { type: 'place', loc: 'haven' });
        expect(createGameView(game, other).prompt).toEqual({ player: a, waiting: true });
        expect(createGameView(game, a).prompt.options).toHaveLength(2);
        expect(JSON.parse(JSON.stringify(createGameView(game, a)))).toBeTruthy();
    });
});

describe('特別な行事のデータ', () => {
    it('条件のカードはすべて実在する', () => {
        SPECIAL_EVENTS.filter(e => !e.needsTypes).forEach(e => e.needs.forEach(id => expect(CARDS[id], `${e.id} ${id}`).toBeTruthy()));
    });
});
