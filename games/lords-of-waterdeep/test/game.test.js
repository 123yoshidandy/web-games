import { describe, it, expect } from 'vitest';
import Game, { AGENTS } from '../public/js/game.js';
import { QUESTS, INTRIGUES, BUILDINGS, LORDS, QUEST_BY_ID, LORD_BY_ID } from '../public/js/cards.js';
import { newGame, players, setRes, run, place, skip, snapshot, playRandom } from './helpers.js';

// 手札を空にして、思わぬクエストの達成や陰謀カードが混ざらないようにする
function clean(game) {
    game.players.forEach(p => {
        p.quests = [];
        p.intrigue = [];
    });
    game.inn = ['w01', 'a01', 'p01', 's05'];
    return game;
}

describe('準備', () => {
    it.each([2, 3, 4, 5])('%i人：エージェント・金貨・クエスト2枚・陰謀カード2枚・ロードを配る', (n) => {
        const game = new Game(players(n), { seed: 7 });
        expect(game.round).toBe(1);
        game.players.forEach((p, i) => {
            expect(p.agents).toBe(AGENTS[n]);
            expect(p.agentsLeft).toBe(AGENTS[n]);
            expect(p.quests).toHaveLength(2);
            expect(p.intrigue).toHaveLength(2);
            expect(p.res.g).toBe(4 + ((i - game.firstPlayer + n) % n));
            expect(LORD_BY_ID[p.lord]).toBeTruthy();
        });
        expect(new Set(game.players.map(p => p.lord)).size).toBe(n);
        expect(game.inn).toHaveLength(4);
        expect(game.hall.map(h => h.vp)).toEqual([1, 1, 1]);
        expect(game.current).toBe(game.firstPlayer);
    });

    it('カードの数がそろっている', () => {
        expect(QUESTS.length).toBeGreaterThanOrEqual(50);
        expect(INTRIGUES.reduce((s, c) => s + c.count, 0)).toBeGreaterThanOrEqual(30);
        expect(BUILDINGS.length).toBeGreaterThanOrEqual(20);
        expect(LORDS).toHaveLength(11);
        // どの種類にもプロットがある
        ['arcana', 'piety', 'skull', 'war', 'commerce'].forEach(t => {
            expect(QUESTS.filter(q => q.type === t).length).toBeGreaterThanOrEqual(10);
            expect(QUESTS.some(q => q.type === t && q.plot)).toBe(true);
        });
    });

    it('同じシードなら同じ状態になる', () => {
        expect(snapshot(new Game(players(3), { seed: 42 }))).toBe(snapshot(new Game(players(3), { seed: 42 })));
        expect(snapshot(new Game(players(3), { seed: 42 }))).not.toBe(snapshot(new Game(players(3), { seed: 43 })));
    });
});

describe('置く', () => {
    it('場所の効果を受け、同じ場所にはもう置けない。番は次の人へ', () => {
        const game = clean(newGame(2));
        setRes(game, 0, {});
        run(game, [[0, place('field')]]);
        expect(game.players[0].res.f).toBe(2);
        expect(game.players[0].agentsLeft).toBe(3);
        expect(game.current).toBe(1);
        expect(game.legalSpaces(1)).not.toContain('field');
        expect(game.applyCommand(1, place('field'))).toBe(false);
        expect(game.applyCommand(0, place('shop'))).toBe(false);
    });

    it('基本の場所：店は金貨4、塔は魔法使い1、獅子亭は盗賊2、神殿は僧侶1、城は陰謀カード1枚', () => {
        const game = clean(newGame(3));
        game.players.forEach((_, i) => setRes(game, i, {}));
        run(game, [[0, place('shop')], [1, place('tower')], [2, place('tavern')], [0, place('plinth')], [1, place('castle')]]);
        expect(game.players[0].res).toMatchObject({ g: 4, c: 1 });
        expect(game.players[1].res.w).toBe(1);
        expect(game.players[1].intrigue).toHaveLength(1);
        expect(game.players[2].res.r).toBe(2);
        expect(game.firstPlayer).toBe(1);
    });

    it('全員が置き終わるとラウンドが終わり、城を取った人が次の先手番になる。会館の建物に1点ずつ積まれる', () => {
        const game = clean(newGame(2));
        run(game, [[0, place('shop')], [1, place('castle')], [0, place('tower')], [1, place('field')], [0, place('tavern')], [1, place('plinth')],
            [0, place('inn0')], [0, { type: 'quest', index: 0 }], [1, place('inn1')], [1, { type: 'quest', index: 0 }]]);
        expect(game.round).toBe(2);
        expect(game.current).toBe(1);
        expect(game.occupied).toEqual({});
        expect(game.players.map(p => p.agentsLeft)).toEqual([4, 4]);
        expect(game.hall.map(h => h.vp)).toEqual([2, 2, 2]);
    });

    it('崖見の宿：クエストを取って金貨2。3つ目の場所は入れ替えてから取る', () => {
        const game = clean(newGame(2));
        setRes(game, 0, {});
        run(game, [[0, place('inn0')]]);
        expect(game.queue[0]).toMatchObject({ type: 'quest', seat: 0 });
        expect(game.actors()).toEqual([0]);
        run(game, [[0, { type: 'quest', index: 1 }]]);
        expect(game.players[0].quests).toEqual(['a01']);
        expect(game.players[0].res.g).toBe(2);
        expect(game.inn).toHaveLength(4);
        const before = [...game.inn];
        run(game, [[1, place('inn2')]]);
        expect(game.inn.some(id => before.includes(id))).toBe(false);
        run(game, [[1, { type: 'quest', index: 0 }]]);
        expect(game.players[1].quests).toHaveLength(1);
    });

    it('5ラウンド目にエージェントが1人増える', () => {
        const game = new Game(players(3, true), { seed: 3 });
        while (game.round < 5) playRandom(game, game.commands.length, 1);
        game.players.forEach(p => expect(p.agents).toBe(AGENTS[3] + 1 + p.plots.filter(id => QUEST_BY_ID[id].plot.kind === 'lieutenant').length));
    });
});

describe('建物', () => {
    it('建築家の会館で建て、積まれた点を得る。ほかの人が使うと持ち主が得る', () => {
        const game = clean(newGame(2));
        setRes(game, 0, { g: 10 });
        setRes(game, 1, {});
        game.hall = [{ id: 'caravan', vp: 2 }, { id: 'olamn', vp: 1 }, { id: 'horn', vp: 1 }];
        run(game, [[0, place('builders')], [0, { type: 'buy', building: 'caravan' }]]);
        expect(game.players[0].res.g).toBe(6);
        expect(game.players[0].vp).toBe(2);
        expect(game.buildings).toEqual([{ id: 'caravan', owner: 0 }]);
        expect(game.hall[0].id).not.toBe('caravan');
        expect(game.hall[0].vp).toBe(0);
        run(game, [[1, place('b:caravan')]]);
        expect(game.players[1].res.f).toBe(2);
        expect(game.players[0].res.f).toBe(1);
    });

    it('金貨が足りない建物は建てられない。建てられる建物がなければ会館に置けない', () => {
        const game = clean(newGame(2));
        setRes(game, 0, { g: 3 });
        game.hall = [{ id: 'caravan', vp: 1 }, { id: 'olamn', vp: 1 }, { id: 'horn', vp: 1 }];
        expect(game.legalSpaces(0)).not.toContain('builders');
        setRes(game, 0, { g: 4 });
        run(game, [[0, place('builders')]]);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'buy', building: 'olamn' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('自分の建物を使っても、持ち主の分は得ない', () => {
        const game = clean(newGame(2));
        game.buildings = [{ id: 'horn', owner: 0 }];
        setRes(game, 0, {});
        run(game, [[0, place('b:horn')]]);
        expect(game.players[0].res.g).toBe(4);
    });

    it('好きな冒険者を選ぶ建物では、選ぶ数と種類を確かめる', () => {
        const game = clean(newGame(2));
        game.buildings = [{ id: 'smuggler', owner: 1 }];
        setRes(game, 0, { g: 2 });
        setRes(game, 1, {});
        run(game, [[0, place('b:smuggler')]]);
        expect(game.players[0].res.g).toBe(0);
        const before = snapshot(game);
        [{ f: 2, r: 1 }, { f: 2, w: 2 }, { f: -1, r: 5 }, { f: 4.5 }].forEach(cubes => expect(game.applyCommand(0, { type: 'pick', cubes })).toBe(false));
        expect(snapshot(game)).toBe(before);
        run(game, [[0, { type: 'pick', cubes: { f: 1, r: 3 } }]]);
        expect(game.players[0].res).toMatchObject({ f: 1, r: 3 });
        expect(game.players[1].res.g).toBe(2);
    });

    it('宮殿で大使を取ると、次のラウンドの初めにだれよりも先に置ける', () => {
        const game = clean(newGame(2));
        game.buildings = [{ id: 'palace', owner: 1 }];
        run(game, [[0, place('b:palace')]]);
        expect(game.ambassador.holder).toBe(0);
        expect(game.players[1].vp).toBe(2);
        run(game, [[1, place('castle')], [0, place('shop')], [1, place('field')], [0, place('tower')], [1, place('tavern')], [0, place('plinth')],
            [1, place('inn0')], [1, { type: 'quest', index: 0 }]]);
        expect(game.round).toBe(2);
        expect(game.phase).toBe('ambassador');
        expect(game.current).toBe(0);
        expect(game.legalSpaces(0)).not.toContain('b:palace');
        run(game, [[0, place('field')]]);
        expect(game.players[0].agentsLeft).toBe(4);
        expect(game.phase).toBe('place');
        expect(game.current).toBe(1);
        expect(game.legalSpaces(1)).not.toContain('b:palace');
    });

    it('ゾアスターで、相手が置いた場所を使う', () => {
        const game = clean(newGame(2));
        game.buildings = [{ id: 'zoar', owner: 1 }];
        setRes(game, 0, {});
        run(game, [[0, place('shop')], [1, place('field')]]);
        expect(game.zoarTargets(0)).toEqual(['field']);
        run(game, [[0, place('b:zoar')], [0, { type: 'target', space: 'field' }]]);
        expect(game.players[0].res.f).toBe(2);
        expect(game.players[1].vp).toBe(2);
    });
});

describe('陰謀カードと港', () => {
    it('港で陰謀カードを使い、ラウンドの終わりに空いている場所へ置き直す', () => {
        const game = clean(newGame(2));
        game.players[0].intrigue = ['favor'];
        setRes(game, 0, {});
        expect(game.legalSpaces(1 - 1)).toContain('harbor0');
        run(game, [[0, place('harbor0')], [0, { type: 'intrigue', index: 0 }], [0, { type: 'option', index: 3 }]]);
        expect(game.players[0].res.w).toBe(1);
        expect(game.intrigueDiscard).toContain('favor');
        expect(game.legalSpaces(1)).not.toContain('harbor1'); // 陰謀カードがない
        run(game, [[1, place('castle')], [0, place('shop')], [1, place('field')], [0, place('tower')], [1, place('tavern')], [0, place('plinth')],
            [1, place('inn0')], [1, { type: 'quest', index: 0 }]]);
        expect(game.phase).toBe('reassign');
        expect(game.current).toBe(0);
        expect(game.legalSpaces(0)).not.toContain('harbor1');
        expect(game.legalSpaces(0)).not.toContain('shop');
        run(game, [[0, place('inn1')], [0, { type: 'quest', index: 0 }]]);
        expect(game.round).toBe(2);
        expect(game.players[0].quests).toHaveLength(1);
    });

    it('相手を選んで渡すカード（3人）', () => {
        const game = clean(newGame(3));
        game.players[0].intrigue = ['wealth'];
        game.players.forEach((_, i) => setRes(game, i, {}));
        run(game, [[0, place('harbor0')], [0, { type: 'intrigue', index: 0 }]]);
        expect(game.queue[0]).toMatchObject({ type: 'opponent', seat: 0 });
        expect(game.applyCommand(0, { type: 'opponent', seat: 0 })).toBe(false);
        run(game, [[0, { type: 'opponent', seat: 2 }]]);
        expect(game.players.map(p => p.res.g)).toEqual([4, 0, 2]);
    });

    it('冒険者の募集では、ほかの人も相手の番に1体選ぶ', () => {
        const game = clean(newGame(3));
        game.players[0].intrigue = ['call'];
        game.players.forEach((_, i) => setRes(game, i, {}));
        run(game, [[0, place('harbor0')], [0, { type: 'intrigue', index: 0 }], [0, { type: 'pick', cubes: { w: 2 } }]]);
        expect(game.actors()).toEqual([1]);
        run(game, [[1, { type: 'pick', cubes: { c: 1 } }]]);
        expect(game.actors()).toEqual([2]);
        run(game, [[2, { type: 'pick', cubes: { f: 1 } }]]);
        expect(game.players.map(p => p.res)).toMatchObject([{ w: 2 }, { c: 1 }, { f: 1 }]);
        expect(game.current).toBe(1);
    });

    it('攻撃のカード：返せなかった人の分だけ得る', () => {
        const game = clean(newGame(3));
        game.players[0].intrigue = ['ambush'];
        setRes(game, 0, {});
        setRes(game, 1, { f: 2 });
        setRes(game, 2, {});
        run(game, [[0, place('harbor0')], [0, { type: 'intrigue', index: 0 }]]);
        expect(game.players[1].res.f).toBe(1);
        expect(game.players[0].res.f).toBe(1);
    });

    it('義務クエストを渡されると、それを達成するまでほかのクエストは達成できない', () => {
        const game = clean(newGame(2));
        game.players[0].intrigue = ['mq-m1'];
        setRes(game, 1, { f: 5, w: 2 });
        game.players[1].quests = ['w03'];
        run(game, [[0, place('harbor0')], [0, { type: 'intrigue', index: 0 }]]);
        expect(game.players[1].quests).toEqual(['w03', 'm1']);
        expect(game.completable(1)).toEqual(['m1']);
        run(game, [[1, place('shop')]]);
        expect(game.applyCommand(1, { type: 'complete', quest: 'w03' })).toBe(false);
        run(game, [[1, { type: 'complete', quest: 'm1' }]]);
        expect(game.players[1].vp).toBe(2);
        expect(game.completable(1)).toEqual(['w03']);
    });
});

describe('クエスト', () => {
    it('番の終わりに1枚達成でき、資源を払って報酬を得る', () => {
        const game = clean(newGame(2));
        game.players[0].quests = ['w03'];
        setRes(game, 0, { f: 1, w: 1 });
        run(game, [[0, place('field')]]);
        expect(game.queue[0]).toMatchObject({ type: 'complete', seat: 0 });
        expect(game.current).toBe(0);
        run(game, [[0, { type: 'complete', quest: 'w03' }]]);
        expect(game.players[0].vp).toBe(4);
        expect(game.players[0].res).toMatchObject({ f: 1, w: 1 });
        expect(game.players[0].completed).toEqual(['w03']);
        expect(game.current).toBe(1);
    });

    it('達成しないこともできる', () => {
        const game = clean(newGame(2));
        game.players[0].quests = ['w03'];
        setRes(game, 0, { f: 1, w: 1 });
        run(game, [[0, place('field')], [0, skip]]);
        expect(game.players[0].quests).toEqual(['w03']);
        expect(game.current).toBe(1);
    });

    it('プロット：場所で戦士を得るともう1体。種類のクエストで2点。副官でエージェントが増える', () => {
        const game = clean(newGame(2));
        game.players[0].plots = ['w10', 'w11'];
        game.players[0].completed = ['w10', 'w11'];
        game.players[0].quests = ['w09'];
        setRes(game, 0, { f: 2, c: 1, r: 1, w: 1 });
        run(game, [[0, place('field')]]);
        expect(game.players[0].res.f).toBe(5);
        run(game, [[0, { type: 'complete', quest: 'w09' }]]);
        expect(game.players[0].vp).toBe(2);
        expect(game.players[0].agents).toBe(5);
        expect(game.players[0].agentsLeft).toBe(4);
    });

    it('プロット：建物を建てるたびに4点', () => {
        const game = clean(newGame(2));
        game.players[0].plots = ['s09'];
        setRes(game, 0, { g: 4 });
        game.hall = [{ id: 'caravan', vp: 1 }, { id: 'olamn', vp: 1 }, { id: 'horn', vp: 1 }];
        run(game, [[0, place('builders')], [0, { type: 'buy', building: 'caravan' }]]);
        expect(game.players[0].vp).toBe(5);
    });
});

describe('終わり', () => {
    it.each([2, 3, 4, 5])('%i人：8ラウンドで終わり、冒険者・金貨・ロードの点を足す', (n) => {
        const game = playRandom(new Game(players(n, true), { seed: 100 + n }), n);
        expect(game.isOver()).toBe(true);
        expect(game.round).toBe(8);
        game.players.forEach(p => {
            const lord = LORD_BY_ID[p.lord];
            const cubes = p.res.f + p.res.r + p.res.w + p.res.c;
            const lordVp = lord.buildings
                ? game.buildings.filter(b => b.owner === p.id).length * 6
                : p.completed.filter(id => lord.types.includes(QUEST_BY_ID[id].type)).length * 4;
            expect(p.final).toEqual({ base: p.final.base, cubes, gold: Math.floor(p.res.g / 2), lord: lordVp, total: p.final.base + cubes + Math.floor(p.res.g / 2) + lordVp });
            expect(p.vp).toBe(p.final.total);
        });
        const best = Math.max(...game.players.map(p => p.vp));
        game.winners.forEach(s => expect(game.players[s].vp).toBe(best));
        expect(game.actors()).toEqual([]);
        expect(game.applyCommand(0, place('shop'))).toBe(false);
    });
});

describe('記録と再現', () => {
    it('ランダムな試合を、記録から同じ状態に再現できる', () => {
        for (let seed = 1; seed <= 12; seed++) {
            const n = 2 + (seed % 4);
            const game = playRandom(new Game(players(n, true), { seed }), seed * 31);
            expect(game.isOver()).toBe(true);
            const { players: ps, options, commands } = JSON.parse(JSON.stringify(game.persist()));
            const again = Game.replay(ps, options, commands);
            expect(snapshot(again)).toBe(snapshot(game));
        }
    });

    it('断る操作は状態を変えない（ランダムな試合の途中で、いろいろな操作を送る）', () => {
        const bad = [null, 'place', { type: 'nope' }, { type: 'place', space: 'moon' }, { type: 'place', space: 'b:nope' },
            { type: 'pick', cubes: { f: 99 } }, { type: 'quest', index: 9 }, { type: 'buy', building: 'nope' }, { type: 'intrigue', index: 7 },
            { type: 'opponent', seat: 9 }, { type: 'option', index: 5 }, { type: 'target', space: 'harbor0' }, { type: 'complete', quest: 'w01' }];
        const game = new Game(players(4, true), { seed: 5 });
        for (let step = 0; step < 120 && !game.isOver(); step++) {
            game.players.forEach((_, seat) => {
                bad.forEach(command => {
                    const before = snapshot(game);
                    if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                    else throw new Error(`通ってしまった: ${JSON.stringify(command)}`);
                });
            });
            playRandom(game, step, 1);
        }
    });
});
