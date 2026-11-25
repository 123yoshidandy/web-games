import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { MAJORS, STAGES, BOARD_SPACES, PLAYER_CARDS } from '../public/js/cards.js';
import { addPastures, arrangeAnimals, fits, fenceCount, createFarm, canPlow, canRoom } from '../public/js/farm.js';
import { bakeFood, cookRates } from '../public/js/cooking.js';
import { newGame, players, withSpace, setRes, run, act, finishRound, snapshot } from './helpers.js';

describe('データ', () => {
    it('大きな進歩は10枚、ラウンドカードは6段階で14枚（4・3・2・2・2・1）', () => {
        expect(MAJORS.length).toBe(10);
        expect(STAGES.map(s => s.length)).toEqual([4, 3, 2, 2, 2, 1]);
    });

    it('人数ごとの行動スペース（ボード10、3人は+3、4人は+5）', () => {
        expect([1, 2, 3, 4].map(n => new Game(players(n), { seed: 1 }).spaces.length - 1)).toEqual([10, 10, 13, 15]);
        expect(BOARD_SPACES.length).toBe(10);
        expect(PLAYER_CARDS[4].length).toBe(5);
    });

    it('ラウンドカードは段階の順に出て、段階の中はシャッフル', () => {
        const game = new Game(players(2), { seed: 4 });
        expect(game.roundCards.slice(0, 4).sort()).toEqual([...STAGES[0]].sort());
        expect(game.roundCards.slice(4, 7).sort()).toEqual([...STAGES[1]].sort());
        expect(game.roundCards[13]).toBe('renoFences');
        const orders = new Set([1, 2, 3, 4, 5, 6].map(seed => new Game(players(2), { seed }).roundCards.slice(0, 4).join()));
        expect(orders.size).toBeGreaterThan(1);
    });
});

describe('準備とラウンド', () => {
    it('家族2人・木の家2部屋、食料はスタートプレイヤー2・ほかは3（1人なら0）', () => {
        const game = new Game(players(3), { seed: 2 });
        game.players.forEach(p => {
            expect(p.members).toBe(2);
            expect(p.farm.rooms).toEqual([5, 10]);
            expect(p.farm.house).toBe('wood');
            expect(p.food).toBe(p.id === game.startPlayer ? 2 : 3);
        });
        expect(new Game(players(1), { seed: 2 }).players[0].food).toBe(0);
    });

    it('ためる場所は毎ラウンド足される（森は3、1人なら2）', () => {
        const game = newGame(2);
        expect(game.goods.forest).toEqual({ wood: 3 });
        expect(game.goods.fishing).toEqual({ food: 1 });
        expect(game.goods.storehouse).toEqual({ food: 1 });
        run(game, [[0, act('grain')], [1, act('fishing')], [0, act('clayPit')], [1, act('reedBank')]]);
        expect(game.round).toBe(2);
        expect(game.goods.forest).toEqual({ wood: 6 });
        expect(game.goods.fishing).toEqual({ food: 1 });
        expect(new Game(players(1), { seed: 1 }).goods.forest).toEqual({ wood: 2 });
    });

    it('1人ずつ交互に置き、使われた場所には置けない。スタートは次のラウンドから', () => {
        const game = newGame(2);
        run(game, [[0, act('forest')]]);
        expect(game.players[0].res.wood).toBe(3);
        expect(game.applyCommand(0, act('grain'))).toBe(false);
        expect(game.applyCommand(1, act('forest'))).toBe(false);
        run(game, [[1, act('start')], [0, act('grain')], [1, act('fishing')]]);
        expect(game.round).toBe(2);
        expect(game.startPlayer).toBe(1);
        expect(game.current).toBe(1);
    });

    it('日雇い：食料1と、選んだ建築資材1', () => {
        const game = newGame(2);
        expect(game.applyCommand(0, act('laborer'))).toBe(false);
        expect(game.applyCommand(0, act('laborer', { res: 'grain' }))).toBe(false);
        run(game, [[0, act('laborer', { res: 'stone' })]]);
        expect(game.players[0].res.stone).toBe(1);
        expect(game.players[0].food).toBe(3);
    });
});

describe('家と畑', () => {
    it('部屋は木5・葦2で、今の部屋のとなりに。厩は木2で4つまで', () => {
        const game = newGame(2);
        setRes(game, 0, { wood: 20, reed: 4 });
        expect(game.applyCommand(0, act('build', { rooms: [3] }))).toBe(false);
        expect(game.applyCommand(0, act('build'))).toBe(false);
        run(game, [[0, act('build', { rooms: [0, 1], stables: [4, 9] })]]);
        const p = game.players[0];
        expect(p.farm.rooms).toEqual([5, 10, 0, 1]);
        expect(p.farm.stables).toEqual([4, 9]);
        expect(p.res).toMatchObject({ wood: 6, reed: 0 });
        expect(canRoom(createFarm(), 6)).toBe(true);
        expect(canRoom(createFarm(), 7)).toBe(false);
    });

    it('畑は空いたマスに。2つ目からは今の畑のとなり', () => {
        const game = newGame(2);
        expect(game.applyCommand(0, act('plow', { cell: 5 }))).toBe(false);
        run(game, [[0, act('plow', { cell: 2 })]]);
        const farm = game.players[0].farm;
        expect(canPlow(farm, 3)).toBe(true);
        expect(canPlow(farm, 4)).toBe(false);
        expect(canPlow(farm, 7)).toBe(true);
    });

    it('種まき：穀物の畑は3、野菜の畑は2。パンは焼く進歩がないと焼けない', () => {
        const game = newGame(2);
        withSpace(game, 'sowBake');
        const p = game.players[0];
        p.farm.fields.push({ cell: 2, crop: null, n: 0 }, { cell: 3, crop: null, n: 0 });
        setRes(game, 0, { grain: 3, veg: 1 });
        expect(game.applyCommand(0, act('sowBake', { sow: [], bake: 1 }))).toBe(false);
        expect(game.applyCommand(0, act('sowBake', { sow: [{ cell: 4, crop: 'grain' }] }))).toBe(false);
        run(game, [[0, act('sowBake', { sow: [{ cell: 2, crop: 'grain' }, { cell: 3, crop: 'veg' }] })]]);
        expect(p.farm.fields).toEqual([{ cell: 2, crop: 'grain', n: 3 }, { cell: 3, crop: 'veg', n: 2 }]);
        expect(p.res).toMatchObject({ grain: 2, veg: 0 });
    });

    it('パンの率：かまど2・調理場3、レンガ暖炉は1つで5、石の暖炉は2つまで4', () => {
        expect(bakeFood(['fireplace2'], 3)).toBe(6);
        expect(bakeFood(['hearth4'], 2)).toBe(6);
        expect(bakeFood(['clayOven'], 2)).toBe(null);
        expect(bakeFood(['clayOven', 'fireplace2'], 2)).toBe(7);
        expect(bakeFood(['stoneOven', 'clayOven'], 3)).toBe(13);
        expect(bakeFood([], 1)).toBe(null);
        expect(cookRates(['fireplace3'])).toMatchObject({ veg: 2, sheep: 2, boar: 2, cattle: 3 });
        expect(cookRates(['hearth5'])).toMatchObject({ veg: 3, sheep: 2, boar: 3, cattle: 4 });
    });

    it('改築：木→レンガは部屋の数のレンガと葦1。そのあと大きな進歩も買える', () => {
        const game = newGame(2);
        withSpace(game, 'renoMajor');
        setRes(game, 0, { clay: 4, reed: 1 });
        run(game, [[0, act('renoMajor', { major: 'fireplace2' })]]);
        const p = game.players[0];
        expect(p.farm.house).toBe('clay');
        expect(p.majors).toEqual(['fireplace2']);
        expect(p.res).toMatchObject({ clay: 0, reed: 0 });
        expect(game.majorsLeft).not.toContain('fireplace2');
    });

    it('調理場は、かまどを返しても買える（返したかまどはまた買える）', () => {
        const game = newGame(2);
        withSpace(game, 'major');
        game.players[0].majors = ['fireplace2'];
        game.majorsLeft = game.majorsLeft.filter(m => m !== 'fireplace2');
        expect(game.applyCommand(0, act('major', { major: 'hearth4' }))).toBe(false);
        run(game, [[0, act('major', { major: 'hearth4', payWith: 'fireplace2' })]]);
        expect(game.players[0].majors).toEqual(['hearth4']);
        expect(game.majorsLeft).toContain('fireplace2');
    });

    it('暖炉を建てたら、すぐにパンを焼ける', () => {
        const game = newGame(2);
        withSpace(game, 'major');
        setRes(game, 0, { clay: 3, stone: 1, grain: 2 });
        expect(game.applyCommand(0, act('major', { major: 'clayOven', bake: 2 }))).toBe(false);
        run(game, [[0, act('major', { major: 'clayOven', bake: 1 })]]);
        expect(game.players[0].food).toBe(2 + 5);
    });

    it('井戸：次の5ラウンドの初めに食料1ずつ', () => {
        const game = newGame(2);
        withSpace(game, 'major');
        setRes(game, 0, { wood: 1, stone: 3 });
        run(game, [[0, act('major', { major: 'well' })]]);
        expect(game.players[0].wellRounds).toEqual([2, 3, 4, 5, 6]);
        run(game, [[1, act('fishing')], [0, act('grain')], [1, act('clayPit')]]);
        expect(game.round).toBe(2);
        expect(game.players[0].food).toBe(3);
    });
});

describe('柵と動物', () => {
    it('1マスの牧場は柵4本。となりの牧場は柵を分け合う。2つ目からは今の牧場のとなり', () => {
        const farm = createFarm();
        let r = addPastures(farm, [[4]]);
        expect(r.newFences).toBe(4);
        r = addPastures(r.farm, [[9]]);
        expect(r.newFences).toBe(3);
        expect(fenceCount(r.farm)).toBe(7);
        expect(addPastures(r.farm, [[2]]).error).toBeTruthy();
        expect(addPastures(farm, [[5]]).error).toBeTruthy();
        expect(addPastures(farm, [[3, 9]]).error).toBeTruthy();
    });

    it('牧場の中のマスだけを選ぶと分けられる。柵は15本まで', () => {
        const big = addPastures(createFarm(), [[3, 4, 8, 9]]);
        expect(big.newFences).toBe(8);
        const split = addPastures(big.farm, [[4, 9]]);
        expect(split.newFences).toBe(2);
        expect(split.farm.pastures.length).toBe(2);
        const many = addPastures(createFarm(), [[1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14]]);
        expect(many.newFences).toBe(14);
        expect(addPastures(many.farm, [[1], [2]]).error).toContain('15');
    });

    it('牧場1マスに2頭、厩で倍。柵のない厩に1頭、家に1頭。牧場は1種類だけ', () => {
        const farm = { ...addPastures(createFarm(), [[3, 4]]).farm, stables: [4, 0] };
        expect(arrangeAnimals(farm, { sheep: 8, boar: 0, cattle: 0 }).overflow).toBe(0);
        expect(fits(farm, { sheep: 10, boar: 0, cattle: 0 })).toBe(true);
        expect(fits(farm, { sheep: 11, boar: 0, cattle: 0 })).toBe(false);
        expect(fits(farm, { sheep: 8, boar: 1, cattle: 1 })).toBe(true);
        expect(fits(farm, { sheep: 7, boar: 2, cattle: 1 })).toBe(false);
        expect(fits(createFarm(), { sheep: 1, boar: 0, cattle: 0 })).toBe(true);
        expect(fits(createFarm(), { sheep: 0, boar: 1, cattle: 1 })).toBe(false);
    });

    it('柵の行動：木1本ずつ', () => {
        const game = newGame(2);
        withSpace(game, 'fences');
        setRes(game, 0, { wood: 7 });
        expect(game.applyCommand(0, act('fences', { pastures: [[3, 9]] }))).toBe(false);
        run(game, [[0, act('fences', { pastures: [[4], [9]] })]]);
        expect(game.players[0].res.wood).toBe(0);
        expect(game.players[0].farm.pastures).toEqual([[4], [9]]);
    });

    it('入りきらない動物は、残す数を選ぶ。調理の進歩があれば残りは食料に', () => {
        const game = newGame(2);
        withSpace(game, 'sheep', { sheep: 3 });
        game.players[0].majors = ['fireplace2'];
        run(game, [[0, act('sheep')]]);
        expect(game.pending).toEqual({ kind: 'keep', seat: 0, animals: { sheep: 3, boar: 0, cattle: 0 } });
        expect(game.applyCommand(0, { type: 'keep', animals: { sheep: 2 } })).toBe(false);
        run(game, [[0, { type: 'keep', animals: { sheep: 1 } }]]);
        expect(game.players[0].animals.sheep).toBe(1);
        expect(game.players[0].food).toBe(2 + 4);
        expect(game.current).toBe(1);
    });
});

describe('家族', () => {
    it('部屋が家族より多いときだけ増やせる。生まれた家族は次のラウンドから動き、最初の収穫では食料1', () => {
        const game = newGame(2);
        withSpace(game, 'family');
        expect(game.legalSpaces(0)).not.toContain('family');
        game.players[0].farm.rooms.push(0);
        run(game, [[0, act('family')]]);
        const p = game.players[0];
        expect(p.members).toBe(3);
        expect(p.newborns).toBe(1);
        expect(p.available).toBe(1);
        expect(game.foodNeed(p)).toBe(5);
    });

    it('急な家族は部屋がなくても増やせる。5人まで', () => {
        const game = newGame(2);
        withSpace(game, 'urgent');
        run(game, [[0, act('urgent')]]);
        expect(game.players[0].members).toBe(3);
        const full = newGame(2);
        withSpace(full, 'urgent');
        full.players[0].members = 5;
        expect(full.applyCommand(0, act('urgent'))).toBe(false);
    });
});

describe('収穫', () => {
    // ラウンド4の終わりまで進める
    function toHarvest(game) {
        for (let r = game.round; r <= 4 && game.phase === 'work'; r++) finishRound(game);
    }

    it('畑から1つずつ取り、1人2食料。足りなければ物乞いカード', () => {
        const game = newGame(2);
        const [a, b] = game.players;
        a.farm.fields.push({ cell: 2, crop: 'grain', n: 3 });
        game.round = 4;
        a.food = 100;
        b.food = 0;
        finishRound(game);
        expect(a.farm.fields[0].n).toBe(2);
        // 換算できるものがあれば選ぶ（何も換算しなければ、足りない分が物乞い）
        if (game.feeding.includes(1)) run(game, [[1, { type: 'feed', convert: {} }]]);
        expect(game.round).toBe(5);
        expect(b.begging).toBeGreaterThan(0);
    });

    it('換算できるものがあれば選ぶ。穀物は1、調理の進歩で動物を食料に', () => {
        const game = newGame(2);
        game.round = 4;
        const [a, b] = game.players;
        a.food = 0;
        a.res.grain = 2;
        a.majors = ['hearth4'];
        a.farm = addPastures(createFarm(), [[4]]).farm;
        a.animals = { sheep: 0, boar: 2, cattle: 0 };
        b.food = 100;
        finishRound(game);
        expect(game.phase).toBe('feed');
        expect(game.feeding).toEqual([0]);
        expect(game.applyCommand(0, { type: 'feed', convert: { grain: 3 } })).toBe(false);
        run(game, [[0, { type: 'feed', convert: { grain: 1, boar: 1 } }]]);
        // 漁の食料1＋穀物1＋猪3 で、2人分の4を払って1残る
        expect(a.begging).toBe(0);
        expect(a.food).toBe(1);
        // 猪は1頭になったので繁殖しない
        expect(a.animals.boar).toBe(1);
        expect(game.round).toBe(5);
    });

    it('繁殖：2頭以上の種類に1頭、入る場所があれば', () => {
        const game = newGame(2);
        game.round = 4;
        const [a, b] = game.players;
        a.food = 100;
        b.food = 100;
        a.farm = addPastures(createFarm(), [[4]]).farm;
        a.animals = { sheep: 2, boar: 0, cattle: 0 };
        b.animals = { sheep: 0, boar: 0, cattle: 1 };
        finishRound(game);
        expect(a.animals.sheep).toBe(3);
        expect(b.animals.cattle).toBe(1);
    });

    it('作業場は収穫で1回、資源1を食料に', () => {
        const game = newGame(2);
        game.round = 4;
        const [a, b] = game.players;
        a.food = 4;
        a.res.reed = 3;
        a.majors = ['basket'];
        b.food = 100;
        finishRound(game);
        expect(game.feeding).toEqual([0]);
        expect(game.applyCommand(0, { type: 'feed', crafts: ['basket', 'basket'] })).toBe(false);
        run(game, [[0, { type: 'feed', crafts: ['basket'] }]]);
        expect(a.food).toBe(4 + 1 + 3 - 4);
        expect(a.res.reed).toBe(2);
    });

    it('1人用は、大人1人3食料', () => {
        const game = new Game(players(1), { seed: 1 });
        expect(game.foodNeed(game.players[0])).toBe(6);
    });
});

describe('終わり', () => {
    it('14ラウンドの収穫のあとで終わり、得点が高い人の勝ち', () => {
        const game = newGame(2);
        game.round = 14;
        game.players.forEach(p => { p.food = 100; });
        game.players[1].res.veg = 1;
        finishRound(game);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
        expect(game.applyCommand(0, act('grain'))).toBe(false);
    });

    it('断った操作は状態を変えない', () => {
        const game = newGame(3);
        const before = snapshot(game);
        [act('nothing'), act('laborer'), act('plow', { cell: 99 }), act('build', { rooms: [12] }), { type: 'keep', animals: {} }, { type: 'feed' }, null, { type: 'x' }]
            .forEach(c => expect(game.applyCommand(0, c)).toBe(false));
        expect(game.applyCommand(1, act('grain'))).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});
