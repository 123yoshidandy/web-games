import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CIV_CARDS, BUILDINGS, RESOURCE_VALUE, CULTURES, buildingPoints } from '../public/js/cards.js';
import { newGame, players, fixDice, setRes, run, place, resolve, snapshot } from './helpers.js';

const ids = (pred) => CIV_CARDS.filter(pred).map(c => c.id);
const cardId = (kind, extra = {}) => CIV_CARDS.find(c => c.top.kind === kind && Object.entries(extra).every(([k, v]) => c.top[k] === v)).id;

// だれも置いていないことにして、行動する段階を飛ばし、食べさせる段階に入る
function skipToFeeding(game) {
    game.placed = game.players.map(() => ({}));
    game.players.forEach(p => { p.available = 0; });
    game.nextPlacer();
}

describe('カードと建物のデータ', () => {
    it('文明カードは36枚で、上半分の種類ごとの枚数がルールブックどおり', () => {
        expect(CIV_CARDS.length).toBe(36);
        const count = (kind) => ids(c => c.top.kind === kind).length;
        expect([count('diceAll'), count('food'), count('res'), count('resDice'), count('points'), count('tool'), count('agri'), count('extra'), count('oneUse'), count('choice2')])
            .toEqual([10, 7, 5, 3, 3, 1, 2, 1, 3, 1]);
        expect(CIV_CARDS.filter(c => c.top.kind === 'food').map(c => c.top.n).sort((a, b) => a - b)).toEqual([1, 2, 3, 3, 4, 5, 7]);
        expect(CIV_CARDS.filter(c => c.top.kind === 'oneUse').map(c => c.top.n).sort()).toEqual([2, 3, 4]);
    });

    it('緑の文化は8種×2枚、砂色は20枚（農民7人・道具職人8人・小屋の建築家9人・シャーマン7人を、各5枚に）', () => {
        CULTURES.forEach(k => expect(ids(c => c.bottom.culture === k).length, k).toBe(2));
        const sand = CIV_CARDS.filter(c => c.bottom.mult);
        expect(sand.length).toBe(20);
        const figures = (kind) => sand.filter(c => c.bottom.mult === kind).reduce((s, c) => s + c.bottom.n, 0);
        const cards = (kind) => sand.filter(c => c.bottom.mult === kind).length;
        expect(['farmer', 'toolmaker', 'builder', 'shaman'].map(figures)).toEqual([7, 8, 9, 7]);
        expect(['farmer', 'toolmaker', 'builder', 'shaman'].map(cards)).toEqual([5, 5, 5, 5]);
    });

    it('建物は28枚：決まった資源17枚（点は資源の値の合計）・4〜5個を1〜4種で8枚・1〜7個で3枚', () => {
        expect(BUILDINGS.length).toBe(28);
        const fixed = BUILDINGS.filter(b => b.kind === 'fixed');
        expect(fixed.length).toBe(17);
        fixed.forEach(b => expect(Object.entries(b.cost).reduce((s, [r, k]) => s + RESOURCE_VALUE[r] * k, 0)).toBe(b.points));
        expect(BUILDINGS.filter(b => b.kind === 'count').map(b => `${b.n}-${b.kinds}`)).toEqual(['4-1', '4-2', '4-3', '4-4', '5-1', '5-2', '5-3', '5-4']);
        expect(BUILDINGS.filter(b => b.kind === 'any').length).toBe(3);
    });

    it('建物の払い方と点', () => {
        const count42 = BUILDINGS.find(b => b.kind === 'count' && b.n === 4 && b.kinds === 2);
        expect(buildingPoints(count42, { wood: 2, gold: 2 })).toBe(18);
        expect(buildingPoints(count42, { wood: 3, gold: 1 })).toBe(15);
        expect(buildingPoints(count42, { wood: 4 })).toBe(null);
        expect(buildingPoints(count42, { wood: 1, clay: 1, stone: 2 })).toBe(null);
        expect(buildingPoints(count42, { wood: 2, gold: 3 })).toBe(null);
        const any = BUILDINGS.find(b => b.kind === 'any');
        expect(buildingPoints(any, { gold: 7 })).toBe(42);
        expect(buildingPoints(any, { wood: 1 })).toBe(3);
        expect(buildingPoints(any, {})).toBe(null);
        expect(buildingPoints(any, { wood: 4, gold: 4 })).toBe(null);
        expect(buildingPoints(BUILDINGS[0], { wood: 2, clay: 1 })).toBe(10);
        expect(buildingPoints(BUILDINGS[0], { wood: 2, clay: 1, gold: 1 })).toBe(null);
    });
});

describe('準備', () => {
    it('人5人・食料12、文明カードを4枚並べ、建物は人数分の山（7枚ずつ）', () => {
        for (const n of [2, 3, 4]) {
            const game = new Game(players(n), { seed: 3 });
            expect(game.players.every(p => p.people === 5 && p.available === 5 && p.food === 12 && p.score === 0)).toBe(true);
            expect(game.civSlots.length).toBe(4);
            expect(game.civDeck.length).toBe(32);
            expect(game.stacks.length).toBe(n);
            expect(game.stacks.every(s => s.length === 7)).toBe(true);
            expect(new Set(game.stacks.flat()).size).toBe(7 * n);
            expect(game.phase).toBe('place');
            expect(game.current).toBe(game.startPlayer);
        }
    });

    it('同じシードなら同じ並び', () => {
        expect(snapshot(new Game(players(3), { seed: 9 }))).toBe(snapshot(new Game(players(3), { seed: 9 })));
        expect(new Game(players(3), { seed: 9 }).civDeck).not.toEqual(new Game(players(3), { seed: 10 }).civDeck);
    });
});

describe('人を置く', () => {
    it('順に1か所ずつ置き、同じ場所には2回置けない。小屋はちょうど2人、畑・道具作りは1人', () => {
        const game = newGame(4);
        expect(game.applyCommand(1, place('hunt', 2))).toBe(false);
        run(game, [[0, place('hunt', 2)]]);
        expect(game.current).toBe(1);
        expect(game.applyCommand(1, place('hut', 1))).toBe(false);
        expect(game.applyCommand(1, place('field', 2))).toBe(false);
        run(game, [[1, place('hut', 2)], [2, place('field')], [3, place('toolmaker')]]);
        expect(game.applyCommand(0, place('hunt', 1))).toBe(false);
        expect(game.applyCommand(0, place('hut', 2))).toBe(false);
        run(game, [[0, place('civ0')]]);
        expect(game.applyCommand(1, place('civ0'))).toBe(false);
        expect(game.applyCommand(1, place('civ1', 2))).toBe(false);
        run(game, [[1, place('civ1')]]);
        expect(game.applyCommand(2, place('hunt', 0))).toBe(false);
        expect(game.applyCommand(2, place('hunt', 6))).toBe(false);
        expect(game.applyCommand(2, place('hunt', 1.5))).toBe(false);
    });

    it('森・粘土・石切り場・川は合わせて7人まで。4人なら何人でも、狩り場は何人でも', () => {
        const game = newGame(4);
        run(game, [[0, place('forest', 5)]]);
        expect(game.applyCommand(1, place('forest', 3))).toBe(false);
        run(game, [[1, place('forest', 2)]]);
        expect(game.applyCommand(2, place('forest', 1))).toBe(false);
        run(game, [[2, place('hunt', 5)], [3, place('hunt', 5)]]);
    });

    it('2人のとき：資源の場所は1人だけ。村の3か所は2か所まで', () => {
        const game = newGame(2);
        run(game, [[0, place('forest', 1)]]);
        expect(game.applyCommand(1, place('forest', 1))).toBe(false);
        run(game, [[1, place('hut', 2)], [0, place('field')]]);
        expect(game.applyCommand(1, place('toolmaker'))).toBe(false);
        run(game, [[1, place('clay', 3)]]);
        expect(game.applyCommand(0, place('clay', 1))).toBe(false);
    });

    it('3人のとき：資源の場所は2人まで。村は2か所まで', () => {
        const game = newGame(3);
        run(game, [[0, place('river', 1)], [1, place('river', 1)]]);
        expect(game.applyCommand(2, place('river', 1))).toBe(false);
        run(game, [[2, place('toolmaker')], [0, place('field')]]);
        expect(game.applyCommand(1, place('hut', 2))).toBe(false);
    });

    it('4人のとき：村の3か所をすべて使える', () => {
        const game = newGame(4);
        run(game, [[0, place('field')], [1, place('toolmaker')], [2, place('hut', 2)]]);
    });

    it('置き終えた人は飛ばし、全員が置き終えたら行動する段階へ', () => {
        const game = newGame(2);
        run(game, [[0, place('hunt', 5)], [1, place('hunt', 1)]]);
        expect(game.current).toBe(1);
        run(game, [[1, place('forest', 4)]]);
        expect(game.phase).toBe('action');
        expect(game.current).toBe(0);
    });

    it('人が残っていても、置ける場所がなければ飛ばす', () => {
        const game = newGame(2);
        run(game, [[0, place('hunt', 1)]]);
        // 残りの場所をふさぐ
        ['forest', 'clay', 'quarry', 'river'].forEach(s => { game.placed[1][s] = 1; });
        game.placed[1].field = 1;
        game.placed[1].toolmaker = 1;
        ['civ0', 'civ1', 'civ2', 'civ3', 'bld0', 'bld1'].forEach(s => { game.placed[1][s] = 1; });
        game.players[1].available = 5;
        expect(game.canPlaceAny(0)).toBe(false);
        run(game, [[1, place('hunt', 5)]]);
        expect(game.phase).toBe('action');
        expect(game.players[0].available).toBe(4);
    });
});

describe('行動する', () => {
    it('サイコロの合計を割って資源を得る（狩り2・森3・粘土4・石切り場5・川6、端数は切り捨て）', () => {
        const game = newGame(4);
        run(game, [[0, place('forest', 3)], [1, place('clay', 2)], [2, place('quarry', 2)], [3, place('river', 2)],
            [0, place('hunt', 2)], [1, place('hunt', 3)], [2, place('hunt', 3)], [3, place('hunt', 3)]]);
        expect(game.phase).toBe('action');
        fixDice(game, [6, 5, 3, 1, 1]);
        run(game, [[0, resolve('forest')], [0, resolve('hunt')]]);
        expect(game.players[0].res.wood).toBe(4);   // 14/3
        expect(game.players[0].food).toBe(13);      // 12 + 2/2
        fixDice(game, [4, 3, 1, 1, 1]);
        run(game, [[1, resolve('clay')], [1, resolve('hunt')]]);
        expect(game.players[1].res.clay).toBe(1);   // 7/4
        fixDice(game, [5, 4]);
        run(game, [[2, resolve('quarry')]]);
        expect(game.players[2].res.stone).toBe(1);  // 9/5
    });

    it('置いた場所は好きな順で使い、全部使ったら次の人', () => {
        const game = newGame(2);
        run(game, [[0, place('hunt', 4)], [1, place('hunt', 5)], [0, place('field')]]);
        expect(game.applyCommand(1, resolve('hunt'))).toBe(false);
        expect(game.applyCommand(0, resolve('forest'))).toBe(false);
        run(game, [[0, resolve('field')]]);
        expect(game.players[0].agri).toBe(1);
        expect(game.current).toBe(0);
        run(game, [[0, resolve('hunt')]]);
        expect(game.current).toBe(1);
    });

    it('道具：足すと得る数が増えるときだけ聞く。1ラウンドに1回ずつ使え、次のラウンドで戻る', () => {
        const game = newGame(2);
        game.players[0].tools = [2];
        game.players[0].toolsUsed = [false];
        run(game, [[0, place('forest', 2)], [1, place('hunt', 5)], [0, place('hunt', 3)]]);
        fixDice(game, [4, 4]);
        run(game, [[0, resolve('forest')]]);
        expect(game.pending).toMatchObject({ kind: 'tools', seat: 0, sum: 8, divisor: 3 });
        expect(game.actors()).toEqual([0]);
        expect(game.applyCommand(0, { type: 'tools', tools: [1] })).toBe(false);
        expect(game.applyCommand(0, { type: 'tools', tools: [0, 0] })).toBe(false);
        run(game, [[0, { type: 'tools', tools: [0], oneUse: [] }]]);
        expect(game.players[0].res.wood).toBe(3);
        expect(game.players[0].toolsUsed).toEqual([true]);
        // 使った道具はもう足せないので、聞かない
        fixDice(game, [1, 1, 1]);
        run(game, [[0, resolve('hunt')]]);
        expect(game.pending).toBe(null);
        expect(game.players[0].food).toBe(13);
        run(game, [[1, resolve('hunt')]]);
        expect(game.round).toBe(2);
        expect(game.players[0].toolsUsed).toEqual([false]);
    });

    it('道具を足しても変わらないときは聞かない', () => {
        const game = newGame(2);
        game.players[0].tools = [1];
        game.players[0].toolsUsed = [false];
        run(game, [[0, place('forest', 2)], [1, place('hunt', 5)], [0, place('hunt', 3)]]);
        fixDice(game, [3, 3]);
        run(game, [[0, resolve('forest')]]);
        expect(game.pending).toBe(null);
        expect(game.players[0].res.wood).toBe(2);
    });

    it('道具は3枚まで。4枚目からは低いものを1つずつ上げ、4・4・4 が上限', () => {
        const game = newGame(2);
        const p = game.players[0];
        const seen = [];
        for (let i = 0; i < 13; i++) {
            game.addTool(p);
            seen.push(p.tools.join(''));
        }
        expect(seen).toEqual(['1', '11', '111', '211', '221', '222', '322', '332', '333', '433', '443', '444', '444']);
    });

    it('畑は10段、人は10人まで', () => {
        const game = newGame(4);
        game.players[0].agri = 10;
        game.players[0].people = 10;
        game.players[0].available = 10;
        run(game, [[0, place('field')], [1, place('hut', 2)], [2, place('hunt', 5)], [3, place('hunt', 5)], [0, place('hunt', 9)], [1, place('hunt', 3)]]);
        run(game, [[0, resolve('field')]]);
        expect(game.players[0].agri).toBe(10);
    });

    it('小屋で人が1人増え、次のラウンドから置ける', () => {
        const game = newGame(2);
        run(game, [[0, place('hut', 2)], [1, place('hunt', 5)], [0, place('hunt', 3)]]);
        run(game, [[0, resolve('hut')], [0, resolve('hunt')], [1, resolve('hunt')]]);
        expect(game.players[0].people).toBe(6);
        expect(game.round).toBe(2);
        expect(game.players[0].available).toBe(6);
    });
});

describe('文明カード', () => {
    // P0 が slot のカードに置き、P0 の行動の番で止める
    function buyAt(slot, card, res = { wood: 4 }, n = 2) {
        const game = newGame(n);
        game.civSlots[slot] = card;
        setRes(game, 0, res);
        const steps = [[0, place(`civ${slot}`)]];
        for (let s = 1; s < n; s++) steps.push([s, place('hunt', 5)]);
        steps.push([0, place('hunt', 4)]);
        run(game, steps);
        run(game, [[0, resolve(`civ${slot}`)]]);
        return game;
    }

    it('置き場の費用（右から1〜4）ちょうどの資源で取る。食料では払えない。取らずに戻せる', () => {
        const food7 = cardId('food', { n: 7 });
        const game = buyAt(1, food7);
        expect(game.pending).toMatchObject({ kind: 'civ', cost: 2 });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'pay', pay: { wood: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'pay', pay: { wood: 3 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'pay', pay: { gold: 2 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'pay', pay: { food: 2 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'pay', pay: { wood: -1, clay: 3 } })).toBe(false);
        expect(snapshot(game)).toBe(before);
        run(game, [[0, { type: 'pay', pay: { wood: 2 } }]]);
        expect(game.players[0].food).toBe(19);
        expect(game.players[0].res.wood).toBe(2);
        expect(game.players[0].cards).toEqual([food7]);
        expect(game.civSlots[1]).toBe(null);

        const declined = buyAt(1, food7);
        run(declined, [[0, { type: 'decline' }]]);
        expect(declined.civSlots[1]).toBe(food7);
        expect(declined.players[0].cards).toEqual([]);
    });

    it('払えないカードは、自動で取らない', () => {
        const game = buyAt(3, cardId('food', { n: 7 }), { wood: 3 });
        expect(game.pending).toBe(null);
        expect(game.players[0].cards).toEqual([]);
    });

    it('ラウンドの終わりに、残ったカードを安い側へ寄せ、山から補充する', () => {
        const game = buyAt(1, cardId('food', { n: 7 }));
        const [a, , c, d] = game.civSlots;
        const top = game.civDeck[0];
        run(game, [[0, { type: 'pay', pay: { wood: 2 } }], [0, resolve('hunt')], [1, resolve('hunt')]]);
        expect(game.round).toBe(2);
        expect(game.civSlots).toEqual([a, c, d, top]);
        expect(game.startPlayer).toBe(1);
    });

    it('上半分：資源・3点・道具・畑・使い切りの道具・好きな資源2つ', () => {
        let game = buyAt(0, cardId('res', { res: 'gold' }));
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.players[0].res.gold).toBe(1);

        game = buyAt(0, cardId('points'));
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.players[0].score).toBe(3);

        game = buyAt(0, cardId('tool'));
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.players[0].tools).toEqual([1]);

        game = buyAt(0, cardId('agri'));
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.players[0].agri).toBe(1);

        const four = cardId('oneUse', { n: 4 });
        game = buyAt(0, four);
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.players[0].oneUse).toEqual([four]);
        fixDice(game, [1, 1, 1, 1]);
        run(game, [[0, resolve('hunt')]]);
        expect(game.pending).toMatchObject({ kind: 'tools', sum: 4 });
        run(game, [[0, { type: 'tools', tools: [], oneUse: [four] }]]);
        expect(game.players[0].food).toBe(16);
        expect(game.players[0].oneUse).toEqual([]);
        expect(game.players[0].cards).toEqual([four]);

        const choice = cardId('choice2');
        game = buyAt(0, choice);
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.players[0].choice2).toEqual([choice]);
        expect(game.applyCommand(0, { type: 'choice2', take: { gold: 3 } })).toBe(false);
        expect(game.applyCommand(1, { type: 'choice2', take: { gold: 2 } })).toBe(false);
        run(game, [[0, { type: 'choice2', take: { gold: 1, stone: 1 } }]]);
        expect(game.players[0].res).toMatchObject({ wood: 3, stone: 1, gold: 1 });
        expect(game.players[0].choice2).toEqual([]);
        expect(game.applyCommand(0, { type: 'choice2', take: { gold: 2 } })).toBe(false);
    });

    it('サイコロで資源：2個振り、道具を足せる', () => {
        const game = buyAt(0, cardId('resDice', { res: 'gold' }));
        game.players[0].tools = [3];
        game.players[0].toolsUsed = [false];
        fixDice(game, [5, 5]);
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.pending).toMatchObject({ kind: 'tools', sum: 10, divisor: 6 });
        run(game, [[0, { type: 'tools', tools: [0], oneUse: [] }]]);
        expect(game.players[0].res.gold).toBe(2);
    });

    it('ダイス：人数分を振り、買った人から順に1つずつ選ぶ。最後の人は残りを受け取る', () => {
        const game = buyAt(0, cardId('diceAll'), { wood: 4 }, 3);
        fixDice(game, [5, 6, 1]);
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.pending).toMatchObject({ kind: 'dice', seat: 0, dice: [5, 6, 1] });
        expect(game.applyCommand(1, { type: 'pickDie', die: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'pickDie', die: 3 })).toBe(false);
        run(game, [[0, { type: 'pickDie', die: 0 }]]);
        expect(game.players[0].tools).toEqual([1]);
        expect(game.actors()).toEqual([1]);
        run(game, [[1, { type: 'pickDie', die: 0 }]]);
        expect(game.players[1].agri).toBe(1);
        expect(game.players[2].res.wood).toBe(1);
        expect(game.pending).toBe(null);
        expect(game.actors()).toEqual([0]);
    });

    it('追加のカード：山の上を伏せて取る（下半分だけ数える）', () => {
        const game = buyAt(0, cardId('extra'));
        const top = game.civDeck[0];
        run(game, [[0, { type: 'pay', pay: { wood: 1 } }]]);
        expect(game.players[0].cards).toEqual([cardId('extra'), top]);
        expect(game.players[0].hidden).toEqual([top]);
        expect(game.civDeck.length).toBe(31);
    });
});

describe('建物', () => {
    function buildAt(building, res) {
        const game = newGame(2);
        game.stacks[0][0] = building;
        setRes(game, 0, res);
        run(game, [[0, place('bld0')], [1, place('hunt', 5)], [0, place('hunt', 4)], [0, resolve('bld0')]]);
        return game;
    }

    it('決まった資源で建て、点がすぐ入り、山の次が表になる', () => {
        const game = buildAt(0, { wood: 3, clay: 1 });
        const next = game.stacks[0][1];
        expect(game.applyCommand(0, { type: 'pay', pay: { wood: 3, clay: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'pay', pay: { wood: 1, clay: 1 } })).toBe(false);
        run(game, [[0, { type: 'pay', pay: { wood: 2, clay: 1 } }]]);
        expect(game.players[0].score).toBe(10);
        expect(game.players[0].buildings).toEqual([0]);
        expect(game.stacks[0][0]).toBe(next);
        expect(game.stacks[0].length).toBe(6);
    });

    it('資源を選ぶ建物は、資源の値の合計が点', () => {
        const id = BUILDINGS.find(b => b.kind === 'count' && b.n === 5 && b.kinds === 3).id;
        const game = buildAt(id, { wood: 2, stone: 2, gold: 3 });
        expect(game.applyCommand(0, { type: 'pay', pay: { wood: 1, stone: 1, gold: 3 } })).toBe(true);
        expect(game.players[0].score).toBe(3 + 5 + 18);
    });

    it('資源が足りなければ自動で建てない。取らずに戻すこともできる', () => {
        expect(buildAt(0, { wood: 2 }).pending).toBe(null);
        expect(buildAt(0, { wood: 1, stone: 3 }).pending).toBe(null);
        const count43 = BUILDINGS.find(b => b.kind === 'count' && b.n === 4 && b.kinds === 3).id;
        expect(buildAt(count43, { wood: 5, gold: 5 }).pending).toBe(null);
        expect(buildAt(count43, { wood: 2, clay: 1, gold: 1 }).pending).toMatchObject({ kind: 'building' });
        const game = buildAt(0, { wood: 2, clay: 1 });
        run(game, [[0, { type: 'decline' }]]);
        expect(game.players[0].score).toBe(0);
        expect(game.stacks[0][0]).toBe(0);
    });
});

describe('食べさせる', () => {
    it('畑の段だけ食料を得て、人1人に食料1つ', () => {
        const game = newGame(2);
        game.players[0].agri = 3;
        skipToFeeding(game);
        expect(game.round).toBe(2);
        expect(game.players[0].food).toBe(12 + 3 - 5);
        expect(game.players[1].food).toBe(7);
    });

    it('足りなければ食料を全部出し、残りを資源で払うか −10点', () => {
        let game = newGame(2);
        game.players[0].food = 2;
        game.players[0].agri = 1;
        setRes(game, 0, { wood: 1, gold: 2 });
        skipToFeeding(game);
        expect(game.pending).toEqual({ kind: 'feed', seat: 0, short: 2 });
        expect(game.players[0].food).toBe(0);
        expect(game.applyCommand(0, { type: 'feed', pay: { wood: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'feed', pay: { wood: 2 } })).toBe(false);
        expect(game.applyCommand(1, { type: 'feed', pay: null })).toBe(false);
        run(game, [[0, { type: 'feed', pay: { wood: 1, gold: 1 } }]]);
        expect(game.players[0].res).toMatchObject({ wood: 0, gold: 1 });
        expect(game.players[0].score).toBe(0);
        expect(game.round).toBe(2);

        game = newGame(2);
        game.players[0].food = 4;
        setRes(game, 0, { stone: 3 });
        skipToFeeding(game);
        run(game, [[0, { type: 'feed', pay: null }]]);
        expect(game.players[0].score).toBe(-10);
        expect(game.players[0].food).toBe(0);
        expect(game.players[0].res.stone).toBe(3);
    });

    it('資源も足りなければ、自動で −10点', () => {
        const game = newGame(2);
        game.players[1].food = 0;
        setRes(game, 1, { wood: 2 });
        skipToFeeding(game);
        expect(game.pending).toBe(null);
        expect(game.players[1].score).toBe(-10);
        expect(game.players[1].res.wood).toBe(2);
        expect(game.players[1].starved).toBe(1);
    });

    it('好きな資源2つのカードを使って払える', () => {
        const game = newGame(2);
        game.players[0].food = 3;
        game.players[0].choice2 = [cardId('choice2')];
        skipToFeeding(game);
        expect(game.pending).toMatchObject({ kind: 'feed', short: 2 });
        run(game, [[0, { type: 'choice2', take: { wood: 2 } }], [0, { type: 'feed', pay: { wood: 2 } }]]);
        expect(game.players[0].score).toBe(0);
    });
});

describe('終わり', () => {
    it('建物の山が1つ空になったら、そのラウンドの食べさせる段階のあとで終わる', () => {
        const game = newGame(2);
        game.stacks[0] = [0];
        setRes(game, 0, { wood: 2, clay: 1 });
        run(game, [[0, place('bld0')], [1, place('hunt', 5)], [0, place('hunt', 4)],
            [0, resolve('bld0')], [0, { type: 'pay', pay: { wood: 2, clay: 1 } }]]);
        expect(game.isOver()).toBe(false);
        run(game, [[0, resolve('hunt')], [1, resolve('hunt')]]);
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toContain('建物');
        expect(game.round).toBe(1);
        // 食べさせたあと
        expect(game.players[1].food).toBeLessThan(12 + 15);
    });

    it('文明カードを補充できなければ、次のラウンドを始めずに終わる', () => {
        const game = newGame(2);
        game.civDeck = [];
        setRes(game, 0, { wood: 1 });
        run(game, [[0, place('civ0')], [1, place('hunt', 5)], [0, place('hunt', 4)],
            [0, resolve('civ0')], [0, { type: 'pay', pay: { wood: 1 } }], [0, resolve('hunt')], [1, resolve('hunt')]]);
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toContain('文明カード');
        expect(game.applyCommand(0, place('hunt', 1))).toBe(false);
    });

    it('取られたカードがなければ、山が空でも続く', () => {
        const game = newGame(2);
        game.civDeck = [];
        skipToFeeding(game);
        expect(game.isOver()).toBe(false);
        expect(game.round).toBe(2);
    });

    it('終わりの得点を足し、同点なら畑・道具・人の合計が多い人。それも同じなら両方の勝ち', () => {
        const game = newGame(3);
        const [a, b, c] = game.players;
        a.score = 20; b.score = 20; c.score = 19;
        a.agri = 2; b.agri = 1;
        c.res.wood = 1;
        game.endGame('テスト');
        expect(game.players.map(p => p.score)).toEqual([20, 20, 20]);
        expect(game.winners).toEqual([0]);
        expect(a.final).toMatchObject({ track: 20, total: 0 });

        const tie = newGame(2);
        tie.endGame('テスト');
        expect(tie.winners).toEqual([0, 1]);
    });
});
