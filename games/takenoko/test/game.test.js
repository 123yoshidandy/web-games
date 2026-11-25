import { describe, it, expect } from 'vitest';
import Game, { key, edgeKey } from '../public/js/game.js';
import { PLOTS, CARDS, cardIdsOf, OBJECTIVES_TO_END } from '../public/js/data.js';
import { createGameView } from '../public/js/game-view.js';
import { newGame, PLAYERS, put, freshTurn, playRandom, snapshot } from './helpers.js';

describe('部品のデータ', () => {
    it('区画27枚：緑11・黄9・桃7、改良の印つきは各色3枚（緑は池2・囲い2・肥料1）', () => {
        const by = c => PLOTS.filter(p => p.color === c);
        expect(PLOTS).toHaveLength(27);
        expect([by('green').length, by('yellow').length, by('pink').length]).toEqual([11, 9, 7]);
        expect(by('green').filter(p => p.improvement === 'watershed')).toHaveLength(2);
        expect(by('pink').filter(p => p.improvement)).toHaveLength(3);
    });
    it('目標は各15枚。パンダは緑2本3点×5、黄2本4点×4、桃2本5点×3、3色6点×3', () => {
        for (const type of ['plot', 'gardener', 'panda']) expect(cardIdsOf(type)).toHaveLength(15);
        const panda = cardIdsOf('panda').map(id => CARDS[id]);
        expect(panda.filter(c => c.need.green === 2 && c.points === 3)).toHaveLength(5);
        expect(panda.filter(c => c.need.green === 1 && c.need.yellow === 1 && c.need.pink === 1 && c.points === 6)).toHaveLength(3);
        const total = Object.values(CARDS).reduce((s, c) => s + c.points, 0);
        // 区画 51点・庭師 81点・パンダ 64点
        expect(total).toBe(51 + 81 + 64);
    });
});

describe('準備', () => {
    it('池だけの庭、区画27枚、チップ各3、水路20、手札は各種類1枚', () => {
        const game = newGame(3, 5);
        expect(Object.keys(game.tiles)).toEqual([key(0, 0)]);
        expect(game.plotDeck).toHaveLength(27);
        expect(game.tokens).toEqual({ watershed: 3, enclosure: 3, fertilizer: 3 });
        expect(game.irrigationLeft).toBe(20);
        for (const p of game.players) expect(p.hand.map(id => CARDS[id].type)).toEqual(['plot', 'gardener', 'panda']);
        expect(game.decks.plot).toHaveLength(12);
    });
    it('最初の1巡は天気のダイスを振らない', () => {
        const game = newGame(2, 1);
        expect(game.turnState.weather).toBe(null);
        expect(game.round).toBe(1);
    });
});

describe('区画', () => {
    it('3枚引いて1枚を置き、残りは山の下へ。池の隣か、2枚の隣に置ける', () => {
        const game = newGame(2, 3);
        const seat = game.current;
        const top3 = game.plotDeck.slice(-3).reverse();
        game.applyCommand(seat, { type: 'drawPlots' });
        expect(game.turnState.drawn).toEqual(top3);
        expect(game.applyCommand(seat, { type: 'placePlot', choice: 0, q: 2, r: 0 })).toBe(false); // 池から離れている
        expect(game.applyCommand(seat, { type: 'placePlot', choice: 1, q: 1, r: 0 })).toBe(true);
        expect(game.tiles[key(1, 0)].color).toBe(PLOTS[top3[1]].color);
        expect(game.plotDeck.slice(0, 2)).toEqual([top3[0], top3[2]]);
        // 池の隣なので灌漑され、竹が1つ
        expect(game.tiles[key(1, 0)].bamboo).toBe(1);
    });

    it('2枚の区画の隣なら、池から離れていても置ける', () => {
        const game = newGame(2, 3);
        put(game, 1, 0, 'green');
        put(game, 1, -1, 'green');
        const spots = game.plotSpots().map(([q, r]) => key(q, r));
        expect(spots).toContain(key(2, -1)); // (1,0) と (1,-1) の隣
        expect(spots).not.toContain(key(2, 0)); // (1,0) だけの隣
    });
});

describe('灌漑', () => {
    it('池の隣は灌漑され、離れた区画は水路がなければ灌漑されない', () => {
        const game = newGame(2, 3);
        put(game, 1, 0, 'green');
        put(game, 1, -1, 'green');
        put(game, 2, -1, 'yellow');
        expect(game.isIrrigated(1, 0)).toBe(true);
        expect(game.isIrrigated(2, -1)).toBe(false);
    });

    it('水路は池か水路につながる区画の境目にだけ置け、両側の区画が初めて灌漑されたら竹が1つ', () => {
        const game = newGame(2, 3);
        put(game, 1, 0, 'green');
        put(game, 1, -1, 'green');
        const far = put(game, 2, -1, 'yellow');
        far.wet = false;
        const spots = game.irrigationSpots().map(([a, b]) => edgeKey(a, b));
        // (1,0)-(1,-1) の辺は端が池に接する
        expect(spots).toContain(edgeKey([1, 0], [1, -1]));
        // (1,0)-(2,-1) の辺は、まだどこにもつながらない
        expect(spots).not.toContain(edgeKey([1, 0], [2, -1]));
        freshTurn(game);
        expect(game.applyCommand(game.current, { type: 'irrigate', a: [1, 0], b: [2, -1] })).toBe(false);
        expect(game.applyCommand(game.current, { type: 'irrigate', a: [1, 0], b: [1, -1] })).toBe(true);
        // 今度は (1,0)-(2,-1) がつながる
        expect(game.irrigationSpots().map(([a, b]) => edgeKey(a, b))).toContain(edgeKey([1, 0], [2, -1]));
        game.turnState.actions = [];
        game.applyCommand(game.current, { type: 'irrigate', a: [1, 0], b: [2, -1] });
        expect(game.isIrrigated(2, -1)).toBe(true);
        expect(far.bamboo).toBe(1);
        expect(game.irrigationLeft).toBe(18);
    });

    it('池の改良の区画は、水路がなくても灌漑されて竹が生える', () => {
        const game = newGame(2, 3);
        put(game, 1, 0, 'green');
        put(game, 1, -1, 'green');
        const t = put(game, 2, -1, 'pink', { improvement: 'watershed' });
        t.wet = false;
        game.updateIrrigation();
        expect(game.isIrrigated(2, -1)).toBe(true);
        expect(t.bamboo).toBe(1);
    });
});

describe('庭師とパンダ', () => {
    function garden(game) {
        put(game, 1, 0, 'green', { bamboo: 1 });
        put(game, 2, 0, 'green', { bamboo: 1 });
        put(game, 1, -1, 'green', { bamboo: 3 });
        put(game, 0, -1, 'yellow', { bamboo: 1 });
        // (2,0) は池から離れているので、灌漑されていない
        freshTurn(game);
    }

    it('庭師はまっすぐ進み、止まった区画と隣の同じ色の灌漑された区画が伸びる（最大4）', () => {
        const game = newGame(2, 3);
        garden(game);
        expect(game.reachable([0, 0]).map(p => key(...p))).toEqual(expect.arrayContaining([key(1, 0), key(2, 0), key(1, -1), key(0, -1)]));
        game.applyCommand(game.current, { type: 'gardener', q: 1, r: 0 });
        expect(game.tiles[key(1, 0)].bamboo).toBe(2);
        expect(game.tiles[key(1, -1)].bamboo).toBe(4);
        expect(game.tiles[key(2, 0)].bamboo).toBe(1); // 灌漑されていない
        expect(game.tiles[key(0, -1)].bamboo).toBe(1); // 色が違う
    });

    it('肥料の区画は2つ伸びる。空きは越えられない', () => {
        const game = newGame(2, 3);
        put(game, 1, 0, 'pink', { improvement: 'fertilizer', bamboo: 1 });
        put(game, 3, 0, 'pink');
        freshTurn(game);
        expect(game.reachable([0, 0]).map(p => key(...p))).not.toContain(key(3, 0));
        game.applyCommand(game.current, { type: 'gardener', q: 1, r: 0 });
        expect(game.tiles[key(1, 0)].bamboo).toBe(3);
    });

    it('パンダは止まった区画の竹を1つ食べる。囲いの区画では食べない', () => {
        const game = newGame(2, 3);
        put(game, 1, 0, 'yellow', { bamboo: 2 });
        put(game, 0, 1, 'pink', { improvement: 'enclosure', bamboo: 2 });
        freshTurn(game);
        const seat = game.current;
        game.applyCommand(seat, { type: 'panda', q: 1, r: 0 });
        expect(game.tiles[key(1, 0)].bamboo).toBe(1);
        expect(game.players[seat].eaten.yellow).toBe(1);
        freshTurn(game, seat);
        game.panda = [0, 0];
        game.applyCommand(seat, { type: 'panda', q: 0, r: 1 });
        expect(game.tiles[key(0, 1)].bamboo).toBe(2);
        expect(game.players[seat].eaten.pink).toBe(0);
    });
});

describe('行動と天気', () => {
    it('2つの行動は違うものでなければならない。風なら同じでよい', () => {
        const game = newGame(2, 4);
        put(game, 1, 0, 'green', { bamboo: 1 });
        put(game, 0, 1, 'green', { bamboo: 1 });
        freshTurn(game);
        const seat = game.current;
        game.applyCommand(seat, { type: 'gardener', q: 1, r: 0 });
        expect(game.applyCommand(seat, { type: 'gardener', q: 0, r: 0 })).toBe(false);
        freshTurn(game, seat, { repeat: true });
        game.applyCommand(seat, { type: 'gardener', q: 0, r: 0 });
        expect(game.applyCommand(seat, { type: 'gardener', q: 0, r: 1 })).toBe(true);
    });

    it('晴れなら3つの違う行動', () => {
        const game = newGame(2, 4);
        put(game, 1, 0, 'green', { bamboo: 1 });
        freshTurn(game, game.current, { max: 3 });
        const seat = game.current;
        game.applyCommand(seat, { type: 'gardener', q: 1, r: 0 });
        game.applyCommand(seat, { type: 'panda', q: 1, r: 0 });
        expect(game.canEndTurn()).toBe(false);
        game.applyCommand(seat, { type: 'drawObjective', kind: 'plot' });
        expect(game.canEndTurn()).toBe(true);
    });

    it('2巡目からダイスを振る。雨は灌漑された区画に竹を1つ、雲はチップを置く', () => {
        const game = newGame(2, 4);
        put(game, 1, 0, 'green', { bamboo: 1 });
        freshTurn(game, game.current, { pending: 'rain' });
        game.applyCommand(game.current, { type: 'rain', q: 1, r: 0 });
        expect(game.tiles[key(1, 0)].bamboo).toBe(2);
        freshTurn(game, game.current, { pending: 'clouds' });
        game.applyCommand(game.current, { type: 'improve', improvement: 'enclosure', q: 1, r: 0 });
        expect(game.tiles[key(1, 0)].improvement).toBe('enclosure');
        expect(game.tokens.enclosure).toBe(2);
        // 2巡目のダイス
        const g2 = newGame(2, 9);
        for (let i = 0; i < 2; i++) {
            freshTurn(g2, g2.current);
            g2.turnState.actions = ['a', 'b'];
            g2.applyCommand(g2.current, { type: 'endTurn' });
        }
        expect(g2.round).toBe(2);
        expect(g2.turnState.weather).not.toBe(null);
    });

    it('手札が5枚なら目標を引けない', () => {
        const game = newGame(2, 4);
        freshTurn(game);
        const p = game.players[game.current];
        p.hand.push(game.decks.plot.pop(), game.decks.plot.pop());
        expect(p.hand).toHaveLength(5);
        expect(game.applyCommand(game.current, { type: 'drawObjective', kind: 'panda' })).toBe(false);
    });
});

describe('目標', () => {
    it('区画の目標：形を回してもよく、すべて灌漑されていること', () => {
        const game = newGame(2, 5);
        const seat = game.current;
        const card = 'P2'; // 緑の三角
        game.players[seat].hand = [card];
        put(game, 1, 0, 'green');
        put(game, 1, -1, 'green');
        expect(game.canComplete(seat, card)).toBe(false);
        put(game, 2, -1, 'green');
        // (2,-1) は灌漑されていない
        expect(game.isIrrigated(2, -1)).toBe(false);
        expect(game.canComplete(seat, card)).toBe(false);
        game.channels[edgeKey([1, 0], [1, -1])] = true;
        game.channels[edgeKey([1, -1], [2, -1])] = true;
        expect(game.canComplete(seat, card)).toBe(true);
    });

    it('2色のひし形は、端と隣の真ん中が同じ色（回してよいが、鏡写しは別の形）', () => {
        const game = newGame(2, 5);
        const seat = game.current;
        game.players[seat].hand = ['P12']; // 緑緑黄黄
        // カードの形を180度回して (2,0) へ動かしたもの：(2,0)端 緑・(1,0)真ん中 緑・(1,1)真ん中 黄・(0,1)端 黄
        put(game, 2, 0, 'green');
        put(game, 1, 0, 'green');
        put(game, 1, 1, 'yellow');
        put(game, 0, 1, 'yellow');
        game.channels[edgeKey([1, 0], [2, 0])] = true;
        game.channels[edgeKey([0, 1], [1, 1])] = true;
        expect(game.canComplete(seat, 'P12')).toBe(true);
        // 鏡写し：(2,0)端 緑・(1,0)真ん中 緑・(2,-1)真ん中 黄・(1,-1)端 黄
        const mirror = newGame(2, 5);
        mirror.players[seat].hand = ['P12'];
        put(mirror, 2, 0, 'green');
        put(mirror, 1, 0, 'green');
        put(mirror, 2, -1, 'yellow');
        put(mirror, 1, -1, 'yellow');
        mirror.channels[edgeKey([1, 0], [2, 0])] = true;
        mirror.channels[edgeKey([1, -1], [2, -1])] = true;
        expect(mirror.canComplete(seat, 'P12')).toBe(false);
    });

    it('庭師の目標：高さちょうど、改良の条件、庭師がその区画にいること', () => {
        const game = newGame(2, 5);
        const seat = game.current;
        game.players[seat].hand = ['G3']; // 緑・高さ4・改良なし・5点
        put(game, 1, 0, 'green', { bamboo: 4 });
        expect(game.canComplete(seat, 'G3')).toBe(false); // 庭師が池にいる
        game.gardener = [1, 0];
        expect(game.canComplete(seat, 'G3')).toBe(true);
        game.tiles[key(1, 0)].improvement = 'enclosure';
        expect(game.canComplete(seat, 'G3')).toBe(false);
        game.players[seat].hand = ['G4']; // 緑・高さ3を4本・8点
        for (const [q, r] of [[1, 0], [1, -1], [0, -1], [-1, 0]]) put(game, q, r, 'green', { bamboo: 3 });
        game.gardener = [0, 0];
        expect(game.canComplete(seat, 'G4')).toBe(false);
        game.gardener = [0, -1];
        expect(game.canComplete(seat, 'G4')).toBe(true);
    });

    it('パンダの目標：食べた竹を使う', () => {
        const game = newGame(2, 5);
        const seat = game.current;
        freshTurn(game, seat);
        game.players[seat].hand = ['D0']; // 緑2本
        game.players[seat].eaten = { green: 3, yellow: 0, pink: 0 };
        expect(game.applyCommand(seat, { type: 'complete', card: 'D0' })).toBe(true);
        expect(game.players[seat].eaten.green).toBe(1);
        expect(game.scoreOf(seat).total).toBe(3);
        expect(game.scoreOf(seat).panda).toBe(3);
    });
});

describe('ゲームの終わり', () => {
    it.each([[2, 9], [3, 8], [4, 7]])('%i人：%i枚目の達成で皇帝（2点）、ほかの人があと1回ずつ', (n, count) => {
        expect(OBJECTIVES_TO_END[n]).toBe(count);
        const game = newGame(n, 6);
        const seat = game.current;
        freshTurn(game, seat);
        game.players[seat].done = cardIdsOf('panda').slice(0, count - 1);
        game.players[seat].hand = ['D14'];
        game.players[seat].eaten = { green: 1, yellow: 1, pink: 1 };
        game.applyCommand(seat, { type: 'complete', card: 'D14' });
        expect(game.players[seat].emperor).toBe(true);
        const turns = [];
        for (let i = 0; i < n + 2 && !game.isOver; i++) {
            game.turnState.actions = ['a', 'b'];
            game.turnState.pending = null;
            turns.push(game.current);
            game.applyCommand(game.current, { type: 'endTurn' });
        }
        expect(game.isOver).toBe(true);
        expect(turns).toHaveLength(n); // 自分の手番の終わり + ほかの人の1回ずつ
        expect(game.result.standings[0].seat).toBe(seat);
    });

    it('同点ならパンダの目標の点が多い方、それも同じなら勝ちを分け合う', () => {
        const game = newGame(2, 7);
        game.players[0].done = ['D0', 'P0']; // 3 + 2 = 5（パンダ3）
        game.players[1].done = ['G0', 'P0']; // 3 + 2 = 5（パンダ0）
        game.finish();
        expect(game.result.winners).toEqual([0]);
        const g2 = newGame(2, 7);
        g2.players[0].done = ['D0'];
        g2.players[1].done = ['D1'];
        g2.finish();
        expect(g2.result.winners).toEqual([0, 1]);
    });
});

describe('断る操作', () => {
    const cases = [
        ['手番でない', g => g.applyCommand((g.current + 1) % 2, { type: 'drawPlots' })],
        ['区画を引かずに置く', g => g.applyCommand(g.current, { type: 'placePlot', choice: 0, q: 1, r: 0 })],
        ['行けない先', g => g.applyCommand(g.current, { type: 'gardener', q: 5, r: 5 })],
        ['達成していない目標', g => g.applyCommand(g.current, { type: 'complete', card: g.players[g.current].hand[0] })],
        ['行動の前に終える', g => g.applyCommand(g.current, { type: 'endTurn' })],
        ['天気がないのに雨', g => g.applyCommand(g.current, { type: 'rain', q: 1, r: 0 })],
        ['種類が不正', g => g.applyCommand(g.current, { type: 'pass' })],
        ['形が不正', g => g.applyCommand(g.current, null)]
    ];
    it.each(cases)('%s：断り、状態を変えない', (_, act) => {
        const game = newGame(2, 5);
        let before = null;
        const original = game.applyCommand.bind(game);
        game.applyCommand = (seat, command) => {
            before = snapshot(game);
            return original(seat, command);
        };
        expect(act(game)).toBe(false);
        expect(game.lastError).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });
});

describe('試合を通して', () => {
    for (const n of [2, 3, 4]) {
        it(`${n}人：ランダムな手で進め、決まりが崩れず、記録から再現できる`, () => {
            for (let seed = 1; seed <= 15; seed++) {
                const game = newGame(n, seed * 41);
                playRandom(game, seed, 500, g => {
                    for (const t of Object.values(g.tiles)) {
                        expect(t.bamboo).toBeGreaterThanOrEqual(0);
                        expect(t.bamboo).toBeLessThanOrEqual(4);
                        if (t.bamboo > 0) expect(g.isIrrigated(t.q, t.r) || t.wet).toBe(true);
                    }
                    for (const p of g.players) expect(p.hand.length).toBeLessThanOrEqual(5);
                    expect(Object.keys(g.tiles).length - 1 + g.plotDeck.length + (g.turnState.drawn?.length ?? 0)).toBe(27);
                });
                const replayed = Game.replay(PLAYERS(n), { seed: game.seed }, game.commands);
                expect(snapshot(replayed)).toBe(snapshot(game));
            }
        });
    }
});

describe('ビュー', () => {
    it('ほかの人の手札は種類だけ、引いた区画は本人にだけ', () => {
        const game = newGame(3, 8);
        const seat = game.current;
        game.applyCommand(seat, { type: 'drawPlots' });
        const mine = createGameView(game, seat);
        const other = createGameView(game, (seat + 1) % 3);
        expect(mine.players[seat].hand).toHaveLength(3);
        expect(other.players[seat].hand).toBe(null);
        expect(other.players[seat].handTypes).toEqual(['plot', 'gardener', 'panda']);
        expect(mine.turn.drawn).toHaveLength(3);
        expect(other.turn.drawn).toBe(null);
        expect(JSON.stringify(other)).not.toContain('"plotDeck":[');
    });
});
