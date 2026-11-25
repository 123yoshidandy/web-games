import { describe, it, expect } from 'vitest';
import Game, { canPay, paymentOptions, rankGoal, scoreOf } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { BIRDS, birdOf, BONUS_CARDS, bonusOf, bonusPoints, GOALS, FOODS } from '../public/js/birds.js';
import { makeGame, started, skipSetup, food, place, act, snapshot, players } from './helpers.js';

const cost = (id) => birdOf(id).cost;

describe('データ', () => {
    it('鳥は 80 羽以上で、id が重ならず、値がそろっている', () => {
        expect(BIRDS.length).toBeGreaterThanOrEqual(80);
        expect(new Set(BIRDS.map(b => b.id)).size).toBe(BIRDS.length);
        BIRDS.forEach(b => {
            expect(b.habitats.length, b.id).toBeGreaterThan(0);
            expect(b.cost.items.every(f => FOODS.includes(f) || f === 'any'), b.id).toBe(true);
            expect(b.eggs, b.id).toBeGreaterThanOrEqual(1);
            expect(b.wingspan, b.id).toBeGreaterThan(0);
        });
    });

    it('どの生息地にも、30 羽以上の鳥がいる', () => {
        ['forest', 'grassland', 'wetland'].forEach(h => expect(BIRDS.filter(b => b.habitats.includes(h)).length, h).toBeGreaterThanOrEqual(30));
    });

    it('ボーナスカードの点の数え方', () => {
        const p = { hand: [], board: { forest: [], grassland: [], wetland: [] } };
        p.board.wetland = ['osprey', 'great_blue_heron', 'belted_kingfisher', 'anhinga'].map(bird => ({ bird, eggs: 0, cache: {}, tucked: 0 }));
        expect(bonusPoints(bonusOf('fishery'), p)).toBe(8);
        p.board.wetland.pop();
        expect(bonusPoints(bonusOf('fishery'), p)).toBe(3);
        expect(bonusPoints(bonusOf('falconer'), p)).toBe(4); // オオアオサギ・ヤマセミ
        expect(BONUS_CARDS.length).toBeGreaterThanOrEqual(15);
        expect(GOALS.length).toBeGreaterThanOrEqual(8);
    });
});

describe('準備', () => {
    it('同じシードなら同じ配り方になる', () => {
        expect(snapshot(makeGame(3, 7))).toBe(snapshot(makeGame(3, 7)));
        expect(snapshot(makeGame(3, 7))).not.toBe(snapshot(makeGame(3, 8)));
    });

    it('鳥5枚・ボーナス2枚・餌5つ（各1）を配り、場に3枚、餌箱に5つのサイコロ、目標4つ', () => {
        const g = makeGame(4, 1);
        g.players.forEach(p => {
            expect(p.offer.birds).toHaveLength(5);
            expect(p.offer.bonus).toHaveLength(2);
        });
        expect(g.tray).toHaveLength(3);
        expect(g.feeder).toHaveLength(5);
        expect(g.goals).toHaveLength(4);
        expect(g.actors()).toEqual([0, 1, 2, 3]);
    });

    it('残した鳥の数だけ餌を捨てる（合わせて5つ）。合わない選び方は断り、状態を変えない', () => {
        const g = makeGame(2, 1);
        const offer = g.players[0].offer;
        const before = snapshot(g);
        expect(g.applyCommand(0, { type: 'setup', birds: offer.birds.slice(0, 2), food: ['inv', 'seed'], bonus: offer.bonus[0] })).toBe(false);
        expect(g.applyCommand(0, { type: 'setup', birds: ['nope'], food: ['inv', 'seed', 'fish', 'fruit'], bonus: offer.bonus[0] })).toBe(false);
        expect(g.applyCommand(0, { type: 'setup', birds: [], food: [...FOODS], bonus: 'x' })).toBe(false);
        expect(snapshot(g)).toBe(before);
        act(g, 0, { type: 'setup', birds: offer.birds.slice(0, 2), food: ['inv', 'seed', 'fish'], bonus: offer.bonus[1] });
        expect(g.players[0].hand).toEqual(offer.birds.slice(0, 2));
        expect(g.players[0].food).toEqual(food({ inv: 1, seed: 1, fish: 1 }));
        expect(g.players[0].bonus).toEqual([offer.bonus[1]]);
        expect(g.phase).toBe('setup');
        act(g, 1, { type: 'setup', birds: [], food: [...FOODS], bonus: g.players[1].offer.bonus[0] });
        expect(g.phase).toBe('play');
        expect(g.decision).toEqual({ seat: g.firstPlayer, kind: 'turn' });
    });
});

describe('餌の支払い', () => {
    it('全部・どれか1つ・どれでも', () => {
        expect(canPay(cost('american_robin'), ['inv', 'fruit'])).toBe(true);
        expect(canPay(cost('american_robin'), ['inv', 'seed'])).toBe(false);
        expect(canPay(cost('american_robin'), ['inv', 'fruit', 'seed', 'seed', 'fish'])).toBe(false); // 余分に払わない
        expect(canPay(cost('northern_mockingbird'), ['fruit'])).toBe(true);
        expect(canPay(cost('northern_mockingbird'), ['seed'])).toBe(false);
        expect(canPay(cost('american_crow'), ['fish'])).toBe(true);
    });

    it('どれでも2つで、好きな1つの代わりにできる', () => {
        expect(canPay(cost('american_robin'), ['inv', 'seed', 'seed'])).toBe(true);
        expect(canPay(cost('american_robin'), ['seed', 'fish', 'rodent', 'rodent'])).toBe(true);
        expect(canPay(cost('northern_mockingbird'), ['seed', 'fish'])).toBe(true);
    });

    it('払い方の候補：そのまま払えるならその組み合わせだけ、払えなければ2つで1つの代わり', () => {
        expect(paymentOptions(cost('american_robin'), food({ inv: 1, fruit: 1, seed: 2 }))).toEqual([['fruit', 'inv']]);
        const sub = paymentOptions(cost('american_robin'), food({ inv: 1, seed: 2 }));
        expect(sub).toContainEqual(['inv', 'seed', 'seed']);
        expect(paymentOptions(cost('american_robin'), food({ inv: 1, seed: 1 }))).toEqual([]);
        expect(paymentOptions(cost('northern_mockingbird'), food({ inv: 1, fruit: 1 }))).toHaveLength(2);
    });
});

describe('鳥を出す', () => {
    it('餌と、列の位置で決まる卵を払う。出したら手番が終わる', () => {
        const g = started(2, 3);
        const seat = g.turn;
        const p = g.players[seat];
        p.hand = ['american_robin', 'mourning_dove'];
        p.food = food({ inv: 1, fruit: 1, seed: 1 });
        act(g, seat, { type: 'play', bird: 'american_robin', habitat: 'forest', food: ['inv', 'fruit'], eggs: [] });
        expect(p.board.forest.map(s => s.bird)).toEqual(['american_robin']);
        expect(p.food).toEqual(food({ seed: 1 }));
        expect(g.turn).toBe((seat + 1) % 2);
        // 2羽目は卵1個
        g.turn = seat;
        g.decision = { seat, kind: 'turn' };
        const before = snapshot(g);
        expect(g.applyCommand(seat, { type: 'play', bird: 'mourning_dove', habitat: 'forest', food: ['seed'], eggs: [] })).toBe(false);
        expect(g.lastError).toContain('卵を1個');
        expect(g.applyCommand(seat, { type: 'play', bird: 'mourning_dove', habitat: 'forest', food: ['seed'], eggs: [{ h: 'forest', i: 0 }] })).toBe(false);
        expect(snapshot(g)).toBe(before);
        p.board.forest[0].eggs = 1;
        act(g, seat, { type: 'play', bird: 'mourning_dove', habitat: 'forest', food: ['seed'], eggs: [{ h: 'forest', i: 0 }] });
        expect(p.board.forest[0].eggs).toBe(0);
        expect(p.board.forest).toHaveLength(2);
    });

    it('住めない生息地・いっぱいの列・足りない餌は断り、状態を変えない', () => {
        const g = started(2, 3);
        const seat = g.turn;
        const p = g.players[seat];
        p.hand = ['mallard', 'american_robin'];
        p.food = food({ seed: 1 });
        const before = snapshot(g);
        expect(g.applyCommand(seat, { type: 'play', bird: 'mallard', habitat: 'forest', food: ['seed'], eggs: [] })).toBe(false);
        expect(g.applyCommand(seat, { type: 'play', bird: 'american_robin', habitat: 'forest', food: ['seed'], eggs: [] })).toBe(false);
        expect(g.applyCommand(seat, { type: 'play', bird: 'wild_turkey', habitat: 'forest', food: ['seed'], eggs: [] })).toBe(false);
        expect(g.applyCommand(1 - seat, { type: 'play', bird: 'mallard', habitat: 'wetland', food: ['seed'], eggs: [] })).toBe(false);
        expect(snapshot(g)).toBe(before);
    });

    it('白い能力は出したときに働く', () => {
        const g = started(2, 3);
        const seat = g.turn;
        const p = g.players[seat];
        p.hand = ['american_goldfinch'];
        p.food = food({ seed: 2 });
        act(g, seat, { type: 'play', bird: 'american_goldfinch', habitat: 'grassland', food: ['seed', 'seed'], eggs: [] });
        expect(p.food.seed).toBe(3);
    });

    it('もう1羽出せる能力は、選択待ちを出し、出さないこともできる', () => {
        const g = started(2, 3);
        const seat = g.turn;
        const p = g.players[seat];
        p.hand = ['downy_woodpecker', 'blue_gray_gnatcatcher', 'mallard'];
        p.food = food({ inv: 2, seed: 1 });
        place(g, seat, 'grassland', [{ bird: 'mourning_dove', eggs: 2 }]);
        act(g, seat, { type: 'play', bird: 'downy_woodpecker', habitat: 'forest', food: ['inv', 'seed'], eggs: [] });
        expect(g.decision).toMatchObject({ seat, kind: 'playExtra', habitat: 'forest' });
        expect(g.applyCommand(seat, { type: 'play', bird: 'mallard', habitat: 'wetland', food: [], eggs: [] })).toBe(false);
        act(g, seat, { type: 'play', bird: 'blue_gray_gnatcatcher', habitat: 'forest', food: ['inv'], eggs: [{ h: 'grassland', i: 0 }] });
        expect(p.board.forest.map(s => s.bird)).toEqual(['downy_woodpecker', 'blue_gray_gnatcatcher']);
        expect(g.turn).toBe(1 - seat);
    });
});

describe('生息地の行動', () => {
    it('森林：鳥の数で取る数が決まる。餌箱から1つずつ取り、虫か種の面はどちらかを選ぶ', () => {
        const g = started(2, 5);
        const seat = g.turn;
        place(g, seat, 'forest', ['pileated_woodpecker', 'scarlet_tanager']);
        g.feeder = ['invseed', 'fish', 'fish', 'rodent', 'fruit'];
        act(g, seat, { type: 'action', habitat: 'forest' });
        expect(g.decision).toMatchObject({ kind: 'food', left: 2 });
        expect(g.applyCommand(seat, { type: 'take', die: 0 })).toBe(false);
        act(g, seat, { type: 'take', die: 0, as: 'seed' });
        act(g, seat, { type: 'take', die: 0 });
        expect(g.players[seat].food).toMatchObject({ seed: 2, fish: 2 }); // 準備で各1つ
        expect(g.feeder).toEqual(['fish', 'rodent', 'fruit']);
        expect(g.turn).toBe(1 - seat);
    });

    it('餌箱のサイコロがすべて同じ面のときだけ振り直せる。空なら自動で振る', () => {
        const g = started(2, 5);
        const seat = g.turn;
        g.feeder = ['fish', 'rodent'];
        act(g, seat, { type: 'action', habitat: 'forest' });
        expect(g.applyCommand(seat, { type: 'reroll' })).toBe(false);
        g.feeder = ['fish', 'fish'];
        act(g, seat, { type: 'reroll' });
        expect(g.feeder).toHaveLength(5);
        g.feeder = [];
        g.decision = null;
        g.tasks = [{ k: 'gainFood', seat, n: 1 }];
        g.run();
        expect(g.feeder).toHaveLength(5);
        expect(g.decision.kind).toBe('food');
    });

    it('草原：卵を産む。鳥ごとの上限を超えられない', () => {
        const g = started(2, 5);
        const seat = g.turn;
        place(g, seat, 'grassland', [{ bird: 'american_kestrel', eggs: 2 }]);
        act(g, seat, { type: 'action', habitat: 'grassland' });
        expect(g.decision).toMatchObject({ kind: 'lay', n: 1 }); // 3羽まで。上限 3 で 2 個あるので 1 個だけ
        expect(g.applyCommand(seat, { type: 'lay', targets: [{ h: 'grassland', i: 0 }, { h: 'grassland', i: 0 }] })).toBe(false);
        act(g, seat, { type: 'lay', targets: [{ h: 'grassland', i: 0 }] });
        expect(g.players[seat].board.grassland[0].eggs).toBe(3);
    });

    it('湿地：場の3枚か山札から引く。場は手番の終わりに補充する', () => {
        const g = started(2, 5);
        const seat = g.turn;
        place(g, seat, 'wetland', ['trumpeter_swan', 'common_loon']);
        const tray = [...g.tray];
        act(g, seat, { type: 'action', habitat: 'wetland' });
        expect(g.decision).toMatchObject({ kind: 'draw', n: 2 });
        expect(g.applyCommand(seat, { type: 'draw', tray: [0, 0], deck: 0 })).toBe(false);
        act(g, seat, { type: 'draw', tray: [1], deck: 1 });
        expect(g.players[seat].hand).toContain(tray[1]);
        expect(g.players[seat].hand).toHaveLength(2);
        expect(g.tray).toHaveLength(3);
        expect(g.tray).toContain(tray[0]);
    });

    it('ボーナスの交換：森林はカード1枚で餌+1（2・4・6番目の位置だけ）', () => {
        const g = started(2, 5);
        const seat = g.turn;
        const p = g.players[seat];
        p.hand = ['mallard'];
        const before = snapshot(g);
        expect(g.applyCommand(seat, { type: 'action', habitat: 'forest', bonus: { card: 'mallard' } })).toBe(false);
        expect(snapshot(g)).toBe(before);
        place(g, seat, 'forest', ['pileated_woodpecker']);
        act(g, seat, { type: 'action', habitat: 'forest', bonus: { card: 'mallard' } });
        expect(g.decision).toMatchObject({ kind: 'food', left: 2 });
        expect(p.hand).toEqual([]);
        expect(g.discard).toContain('mallard');
    });

    it('ボーナスの交換：草原は餌1つで卵+1、湿地は卵1個でカード+1', () => {
        const g = started(2, 5);
        const seat = g.turn;
        const p = g.players[seat];
        place(g, seat, 'grassland', [{ bird: 'northern_bobwhite', eggs: 0 }]);
        act(g, seat, { type: 'action', habitat: 'grassland', bonus: { food: 'fish' } });
        expect(g.decision).toMatchObject({ kind: 'lay', n: 3 });
        expect(p.food.fish).toBe(0);
        act(g, seat, { type: 'lay', targets: [{ h: 'grassland', i: 0 }, { h: 'grassland', i: 0 }, { h: 'grassland', i: 0 }] });
        // 茶色の能力（この鳥に卵）も働く
        expect(p.board.grassland[0].eggs).toBe(4);
        const other = 1 - seat;
        place(g, other, 'wetland', [{ bird: 'mallard', eggs: 2 }]);
        act(g, other, { type: 'action', habitat: 'wetland', bonus: { egg: { h: 'wetland', i: 0 } } });
        expect(g.decision).toMatchObject({ kind: 'draw', n: 2 });
        expect(g.players[other].board.wetland[0].eggs).toBe(1);
    });
});

describe('茶色の能力', () => {
    it('行動のあと、その列の鳥の能力を右から順に使う', () => {
        const g = started(2, 9);
        const seat = g.turn;
        place(g, seat, 'forest', ['black_capped_chickadee', 'red_breasted_nuthatch']);
        g.feeder = ['fish', 'fish', 'fish', 'fish', 'fish'];
        act(g, seat, { type: 'action', habitat: 'forest' });
        act(g, seat, { type: 'take', die: 0 });
        act(g, seat, { type: 'take', die: 0 });
        const powers = g.events.filter(e => e.type === 'power').map(e => e.ref.i);
        expect(powers).toEqual([1, 0]);
        expect(g.players[seat].board.forest.every(s => s.cache.seed === 1)).toBe(true);
        expect(scoreOf(g.players[seat]).cache).toBe(2);
    });

    it('差し込む能力は選べる。使えば1点（差し込み）と1枚', () => {
        const g = started(2, 9);
        const seat = g.turn;
        const p = g.players[seat];
        place(g, seat, 'wetland', ['american_coot']);
        p.hand = ['mallard'];
        act(g, seat, { type: 'action', habitat: 'wetland' });
        act(g, seat, { type: 'draw', tray: [], deck: 1 });
        expect(g.decision).toMatchObject({ kind: 'power', power: 'tuckDraw' });
        expect(g.applyCommand(seat, { type: 'power', card: 'nope' })).toBe(false);
        act(g, seat, { type: 'power', card: 'mallard' });
        expect(p.board.wetland[0].tucked).toBe(1);
        expect(p.hand).toHaveLength(2);
        expect(p.hand).not.toContain('mallard');
    });

    it('捕食者：めくった鳥の翼開長が小さければ差し込み、そうでなければ捨てる', () => {
        const g = started(2, 9);
        const seat = g.turn;
        place(g, seat, 'grassland', ['golden_eagle']);
        g.deck.push('trumpeter_swan', 'mallard'); // mallard（89cm）を先にめくる
        act(g, seat, { type: 'action', habitat: 'grassland' });
        act(g, seat, { type: 'lay', targets: [{ h: 'grassland', i: 0 }] });
        expect(g.players[seat].board.grassland[0].tucked).toBe(1);
        // 次の手番（相手）を済ませて、もう一度
        act(g, 1 - seat, { type: 'action', habitat: 'grassland' });
        act(g, seat, { type: 'action', habitat: 'grassland' });
        expect(g.players[seat].board.grassland[0].tucked).toBe(1);
        expect(g.discard).toContain('trumpeter_swan');
    });

    it('卵を捨てて餌を得る（カラス）。自分の卵は捨てられない', () => {
        const g = started(2, 9);
        const seat = g.turn;
        const p = g.players[seat];
        place(g, seat, 'forest', [{ bird: 'american_crow', eggs: 1 }]);
        place(g, seat, 'grassland', [{ bird: 'mourning_dove', eggs: 2 }]);
        g.feeder = ['fish', 'fish', 'fish', 'fish', 'fish'];
        act(g, seat, { type: 'action', habitat: 'forest' });
        act(g, seat, { type: 'take', die: 0 });
        expect(g.decision).toMatchObject({ kind: 'power', power: 'discardEggFood' });
        expect(g.applyCommand(seat, { type: 'power', target: { h: 'forest', i: 0 }, get: ['fruit'] })).toBe(false);
        expect(g.applyCommand(seat, { type: 'power', target: { h: 'grassland', i: 0 }, get: ['fruit', 'fruit'] })).toBe(false);
        act(g, seat, { type: 'power', target: { h: 'grassland', i: 0 }, get: ['fruit'] });
        expect(p.board.grassland[0].eggs).toBe(1);
        expect(p.food.fruit).toBe(2);
    });
});

describe('ラウンドと得点', () => {
    it('目標の順位点：同じ数なら点を足して分け、0 の人は点なし', () => {
        expect(rankGoal([3, 1, 2], 1)).toEqual([4, 0, 1]);
        expect(rankGoal([2, 2, 1], 1)).toEqual([2, 2, 0]);
        expect(rankGoal([2, 2, 2], 4)).toEqual([4, 4, 4]);
        expect(rankGoal([0, 0, 5], 2)).toEqual([0, 0, 5]);
        expect(rankGoal([1, 3, 3, 3, 2], 3)).toEqual([0, 3, 3, 3, 0]);
    });

    it('手番は 8・7・6・5 回。ラウンドの終わりに目標を採点し、場を入れ替え、先手を回す', () => {
        const g = started(2, 11);
        const first = g.firstPlayer;
        const counts = [];
        let round = 1;
        let turns = 0;
        while (!g.isOver()) {
            const seat = g.turn;
            act(g, seat, { type: 'action', habitat: 'wetland' });
            if (g.decision?.kind === 'draw') act(g, seat, { type: 'draw', tray: [], deck: g.decision.n });
            turns++;
            if (g.round !== round || g.isOver()) {
                counts.push(turns);
                turns = 0;
                if (!g.isOver()) {
                    expect(g.firstPlayer).toBe((first + round) % 2);
                    expect(g.goalResults[round - 1]).toHaveLength(2);
                }
                round = g.round;
            }
        }
        expect(counts).toEqual([16, 14, 12, 10]);
        expect(g.goalResults).toHaveLength(4);
    });

    it('得点：鳥・ボーナス・目標・卵・貯えた餌・差し込み。同点なら残った餌の多い人の勝ち', () => {
        const g = started(2, 11);
        place(g, 0, 'forest', [{ bird: 'wild_turkey', eggs: 2, cache: { seed: 1 }, tucked: 3 }]);
        place(g, 1, 'forest', [{ bird: 'wild_turkey', eggs: 2, cache: { seed: 1 }, tucked: 3 }]);
        g.players.forEach(p => { p.bonus = []; p.goalPoints = [1, 0, 0, 0]; });
        expect(scoreOf(g.players[0])).toMatchObject({ birds: 8, eggs: 2, cache: 1, tucked: 3, goals: 1, total: 15 });
        g.players[0].food = food({ fish: 1 });
        g.players[1].food = food({ fish: 2 });
        g.endGame();
        expect(g.winners).toEqual([1]);
    });
});

describe('記録と再現・ビュー', () => {
    it('でたらめな操作を送っても、断った操作は状態を変えず、記録から同じ状態を再現できる', () => {
        const g = makeGame(3, 21);
        let random = 99;
        const rand = () => { random = (random * 1103515245 + 12345) % 2147483648; return random / 2147483648; };
        const pick = (list) => list[Math.floor(rand() * list.length)];
        let steps = 0;
        while (!g.isOver() && steps++ < 4000) {
            const seat = pick(g.actors());
            const p = g.players[seat];
            const refs = ['forest', 'grassland', 'wetland'].flatMap(h => p.board[h].map((_, i) => ({ h, i })));
            const candidates = [
                { type: 'setup', birds: p.offer?.birds.slice(0, 2) ?? [], food: ['inv', 'seed', 'fish'], bonus: p.offer?.bonus[0] },
                { type: 'action', habitat: pick(['forest', 'grassland', 'wetland']) },
                { type: 'play', bird: pick(p.hand.length ? p.hand : ['x']), habitat: pick(['forest', 'grassland', 'wetland']), food: [pick(FOODS), pick(FOODS)].slice(0, 1 + Math.floor(rand() * 2)), eggs: [] },
                { type: 'take', die: Math.floor(rand() * 5), as: pick(['inv', 'seed']) },
                { type: 'reroll' },
                { type: 'lay', targets: Array.from({ length: g.decision?.n ?? 1 }, () => pick(refs.length ? refs : [{ h: 'forest', i: 0 }])) },
                { type: 'draw', tray: [], deck: g.decision?.n ?? 1 },
                { type: 'power', card: pick(p.hand.length ? p.hand : ['x']), target: pick(refs.length ? refs : [{ h: 'forest', i: 0 }]), get: [pick(FOODS)], give: pick(FOODS) },
                { type: 'skip' },
                { type: 'bonus', id: g.decision?.options?.[0] ?? 'x' }
            ];
            const command = pick(candidates);
            const before = snapshot(g);
            if (!g.applyCommand(seat, command)) expect(snapshot(g)).toBe(before);
        }
        expect(g.isOver()).toBe(true);
        const replayed = Game.replay(players(3), g.options, g.commands);
        expect(snapshot(replayed)).toBe(snapshot(g));
    });

    it('ビューには、ほかの人の手札・ボーナスカード・配り札と、山札の並びを入れない', () => {
        const g = makeGame(3, 4);
        const view = createGameView(g, 0);
        expect(view.players[0].offer.birds).toHaveLength(5);
        expect(view.players[1].offer).toBe(null);
        skipSetup(g);
        g.players[1].hand = ['mallard'];
        const v = createGameView(g, 0);
        expect(v.players[1].hand).toBe(null);
        expect(v.players[1].handCount).toBe(1);
        expect(v.players[1].bonus).toBe(null);
        expect(v.players[0].bonus).toHaveLength(1);
        expect(JSON.stringify(v)).not.toContain(g.deck.at(-1));
        expect(v.deckCount).toBe(g.deck.length + g.discard.length);
    });

    it('ほかの人の選択待ちは、中身を送らない', () => {
        const g = started(2, 4);
        const seat = g.turn;
        place(g, seat, 'wetland', ['american_coot']);
        g.players[seat].hand = ['mallard'];
        act(g, seat, { type: 'action', habitat: 'wetland' });
        act(g, seat, { type: 'draw', tray: [], deck: 1 });
        const other = createGameView(g, 1 - seat).decision;
        expect(other).toEqual({ seat, kind: 'power', power: 'tuckDraw', bird: 'american_coot' });
    });
});
