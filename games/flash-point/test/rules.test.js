import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { edgeKey, FAMILY_FIRES, FAMILY_POI, AMBULANCE_SPOTS, ENGINE_SPOTS, DAMAGE_LIMIT, initialEdges } from '../public/js/board.js';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, players, setup, clearBoard, snapshot, C } from './helpers.js';

// 次の延焼のダイスの目を決める（[行, 列] の並び。使い切ったら元の乱数に戻る）
function forceRolls(game, rolls) {
    const queue = rolls.flatMap(([r, c]) => [(r - 1) / 6 + 0.01, (c - 1) / 8 + 0.01]);
    const original = game.random;
    game.random = () => (queue.length ? queue.shift() : original());
}

describe('準備', () => {
    it('家族向けは決まった火と3つの印で始まり、外のマスを選んで入る', () => {
        const game = makeGame(3);
        expect(game.phase).toBe('place');
        FAMILY_FIRES.forEach(cell => expect(game.fire[cell]).toBe(2));
        expect(game.pois.map(x => x.cell)).toEqual(FAMILY_POI);
        expect(game.poiPool.length).toBe(15);
        expect(game.applyCommand(0, { type: 'place', cell: C(3, 3) })).toBe(false); // 建物の中は選べない
        setup(game);
        expect(game.phase).toBe('turn');
        expect(game.current).toBe(0);
        expect(game.players[0].ap).toBe(4);
    });

    it('上級は専門職を選び、はじめの爆発・危険物・ホットスポットを置く', () => {
        const game = makeGame(2, { mode: 'experienced', level: 'heroic' });
        expect(game.phase).toBe('role');
        expect(game.hazmats.length).toBe(5);
        expect(game.hotspots.length).toBeGreaterThanOrEqual(4);
        expect(game.pois.length).toBe(3);
        expect(game.applyCommand(0, { type: 'place', cell: C(0, 1) })).toBe(false);
        expect(game.applyCommand(0, { type: 'role', role: 'generalist' })).toBe(true);
        expect(game.applyCommand(1, { type: 'role', role: 'generalist' })).toBe(false); // 同じ専門職は選べない
        expect(game.applyCommand(1, { type: 'role', role: 'cafs' })).toBe(true);
        setup(game);
        expect(game.players[0].ap).toBe(5);
        expect(game.vehicles).toEqual({ ambulance: 2, engine: 0 });
    });
});

describe('動く・扉・消火・壁', () => {
    const ready = () => {
        const game = setup(makeGame(2), [C(3, 0), C(0, 5)]);
        clearBoard(game);
        return game;
    };

    it('壁は通れず、開いた入口から入る。火の中へは2AP', () => {
        const game = ready();
        expect(game.applyCommand(0, { type: 'move', to: C(2, 0) })).toBe(true);
        expect(game.applyCommand(0, { type: 'move', to: C(2, 1) })).toBe(false); // 外の壁
        expect(game.applyCommand(0, { type: 'move', to: C(3, 0) })).toBe(true);
        game.fire[C(3, 1)] = 2;
        expect(game.applyCommand(0, { type: 'move', to: C(3, 1) })).toBe(true);
        expect(game.players[0].ap).toBe(0);
        expect(game.applyCommand(0, { type: 'move', to: C(3, 2) })).toBe(false);
        expect(game.lastError).toBe('AP が足りません');
    });

    it('扉は1APで開け閉めし、閉じた扉は通れない', () => {
        const game = ready();
        game.current = 1;
        game.players[1].ap = 4;
        expect(game.applyCommand(1, { type: 'move', to: C(1, 5) })).toBe(false);
        expect(game.applyCommand(1, { type: 'door', to: C(1, 5) })).toBe(true);
        expect(game.edges[edgeKey(C(0, 5), C(1, 5))].s).toBe('open');
        expect(game.applyCommand(1, { type: 'move', to: C(1, 5) })).toBe(true);
        expect(game.players[1].ap).toBe(2);
    });

    it('消火は自分とつながったとなりのマスだけ。火→煙→なしで1APずつ', () => {
        const game = ready();
        game.players[0].cell = C(3, 1);
        game.fire[C(3, 2)] = 2;
        game.fire[C(2, 1)] = 2;   // 壁の向こう
        expect(game.applyCommand(0, { type: 'extinguish', cell: C(2, 1) })).toBe(false);
        expect(game.applyCommand(0, { type: 'extinguish', cell: C(3, 2) })).toBe(true);
        expect(game.fire[C(3, 2)]).toBe(1);
        expect(game.applyCommand(0, { type: 'extinguish', cell: C(3, 2) })).toBe(true);
        expect(game.fire[C(3, 2)]).toBe(0);
        expect(game.players[0].ap).toBe(2);
    });

    it('壁を2APで傷め、2つ目のダメージで壊れて通れる', () => {
        const game = ready();
        game.players[0].cell = C(3, 1);
        game.players[0].ap = 8;
        const key = edgeKey(C(3, 1), C(2, 1));
        expect(game.applyCommand(0, { type: 'chop', to: C(2, 1) })).toBe(true);
        expect(game.edges[key]).toEqual({ t: 'wall', d: 1 });
        expect(game.applyCommand(0, { type: 'chop', to: C(2, 1) })).toBe(true);
        expect(game.edges[key].t).toBe('broken');
        expect(game.damage).toBe(2);
        expect(game.applyCommand(0, { type: 'move', to: C(2, 1) })).toBe(true);
    });

    it('使わなかった AP は4まで持ち越す', () => {
        const game = ready();
        game.players[0].ap = 7;
        forceRolls(game, [[6, 8]]);
        game.applyCommand(0, { type: 'end' });
        expect(game.players[0].ap).toBe(4);
        game.applyCommand(1, { type: 'end' });
        expect(game.players[0].ap).toBe(8);
    });
});

describe('運び出す・勝ち負け', () => {
    it('印のマスに入ると正体が分かり、要救助者を運び出すと助けた人数が増える。7人で勝ち', () => {
        const game = setup(makeGame(2), [C(3, 0), C(3, 0)]);
        clearBoard(game);
        game.pois.push({ id: 90, cell: C(3, 1), revealed: false, victim: true, treated: false });
        expect(createGameView(game, 0).pois[0].victim).toBe(null); // 正体はビューに出さない
        game.applyCommand(0, { type: 'move', to: C(3, 1) });
        expect(game.pois[0].revealed).toBe(true);
        expect(game.applyCommand(0, { type: 'carry', item: 'p90' })).toBe(true);
        game.fire[C(3, 2)] = 2;
        expect(game.applyCommand(0, { type: 'move', to: C(3, 2) })).toBe(false); // 運びながら火には入れない
        game.rescued = 6;
        expect(game.applyCommand(0, { type: 'move', to: C(3, 0) })).toBe(true);
        expect(game.players[0].ap).toBe(1);
        expect(game.rescued).toBe(7);
        expect(game.result).toEqual({ won: true, reason: 'won' });
    });

    it('誤報は取り除かれ、手番の終わりに印を3つまで補う', () => {
        const game = setup(makeGame(2), [C(3, 0), C(3, 0)]);
        clearBoard(game);
        game.pois.push({ id: 91, cell: C(3, 1), revealed: false, victim: false, treated: false });
        game.applyCommand(0, { type: 'move', to: C(3, 1) });
        expect(game.pois.length).toBe(0);
        forceRolls(game, [[6, 8], [1, 1], [1, 2], [1, 3]]);
        game.applyCommand(0, { type: 'end' });
        expect(game.pois.map(x => x.cell).sort((a, b) => a - b)).toEqual([C(1, 1), C(1, 2), C(1, 3)]);
    });

    it('4人を失うと負け', () => {
        const game = setup(makeGame(2), [C(3, 0), C(3, 0)]);
        clearBoard(game);
        game.lost = 3;
        game.pois.push({ id: 92, cell: C(2, 1), revealed: true, victim: true, treated: false });
        game.fire[C(2, 2)] = 2;
        game.fire[C(2, 1)] = 1;   // 火のとなりの煙は火に移る
        forceRolls(game, [[6, 8]]);
        game.applyCommand(0, { type: 'end' });
        expect(game.result).toEqual({ won: false, reason: 'lost' });
    });

    it('ダメージが上限に達すると建物が崩れて負け', () => {
        const game = setup(makeGame(2), [C(3, 0), C(3, 0)]);
        clearBoard(game);
        game.players[0].cell = C(3, 1);
        game.damage = DAMAGE_LIMIT - 1;
        game.applyCommand(0, { type: 'chop', to: C(2, 1) });
        expect(game.result).toEqual({ won: false, reason: 'collapse' });
    });
});

describe('火が広がる', () => {
    const ready = () => {
        const game = setup(makeGame(2), [C(0, 1), C(0, 1)]);
        clearBoard(game);
        game.poiPool = [];
        return game;
    };

    it('何もないマスに煙、煙のマスは火になる', () => {
        const game = ready();
        forceRolls(game, [[2, 2]]);
        game.applyCommand(0, { type: 'end' });
        expect(game.fire[C(2, 2)]).toBe(1);
        forceRolls(game, [[2, 2]]);
        game.applyCommand(1, { type: 'end' });
        expect(game.fire[C(2, 2)]).toBe(2);
    });

    it('火のとなりの煙はつながって火になる（フラッシュオーバー）。壁の向こうには移らない', () => {
        const game = ready();
        game.fire[C(3, 2)] = 2;
        game.fire[C(3, 3)] = 1;
        game.fire[C(3, 4)] = 1;
        game.fire[C(2, 2)] = 1;   // 扉が閉じている
        forceRolls(game, [[6, 8]]);
        game.applyCommand(0, { type: 'end' });
        expect([C(3, 3), C(3, 4)].map(c => game.fire[c])).toEqual([2, 2]);
        expect(game.fire[C(2, 2)]).toBe(1);
        expect(game.fire[C(6, 8)]).toBe(1);
    });

    it('火のマスに当たると爆発：となりは火に、壁にはダメージ、閉じた扉は吹き飛ぶ。火の列は衝撃波が突き抜ける', () => {
        const game = ready();
        game.fire[C(3, 2)] = 2;
        game.fire[C(3, 3)] = 2;
        forceRolls(game, [[3, 2]]);
        game.applyCommand(0, { type: 'end' });
        expect(game.edges[edgeKey(C(2, 2), C(3, 2))]).toEqual({ t: 'broken', was: 'door' }); // 上：閉じた扉
        expect(game.fire[C(4, 2)]).toBe(2);   // 下：廊下
        expect(game.fire[C(3, 1)]).toBe(2);   // 左
        expect(game.fire[C(3, 4)]).toBe(2);   // 右：火のマス（3-3）を突き抜けた衝撃波
        expect(game.damage).toBe(0);
        const g2 = ready();
        g2.fire[C(1, 1)] = 2;
        forceRolls(g2, [[1, 1]]);
        g2.applyCommand(0, { type: 'end' });
        expect(g2.damage).toBe(2);           // 上と左の外の壁
        expect(g2.edges[edgeKey(C(0, 1), C(1, 1))]).toEqual({ t: 'wall', d: 1 });
    });

    it('火の中の消防士は倒れて救急車の駐車場へ。運んでいた要救助者は失われる', () => {
        const game = ready();
        game.players[1].cell = C(5, 7);
        game.pois.push({ id: 93, cell: C(5, 7), revealed: true, victim: true, treated: false });
        game.players[1].carry = 'p93';
        game.fire[C(5, 7)] = 1;
        game.fire[C(5, 8)] = 2;
        forceRolls(game, [[1, 1]]);
        game.applyCommand(0, { type: 'end' });
        expect(AMBULANCE_SPOTS.flat()).toContain(game.players[1].cell);
        expect(game.players[1].carry).toBe(null);
        expect(game.lost).toBe(1);
    });

    it('上級：危険物は火で爆発し、ホットスポットに当たるともう一度広がる', () => {
        const game = setup(makeGame(2, { mode: 'experienced' }), [C(0, 1), C(0, 1)]);
        clearBoard(game);
        game.poiPool = [];
        game.hazmats = [{ id: 94, cell: C(3, 3) }];
        game.hotspots = [C(3, 2)];
        game.fire[C(3, 2)] = 1;
        game.fire[C(3, 3)] = 1;   // 危険物の下の煙は、となりの火で火になる
        forceRolls(game, [[3, 2], [6, 8]]);
        game.applyCommand(0, { type: 'end' });
        expect(game.fire[C(6, 8)]).toBe(1);   // 2回目の延焼
        expect(game.hazmats.length).toBe(0);
        expect(game.hotspots).toContain(C(3, 3));
        expect(game.fire[C(3, 4)]).toBe(2);   // 危険物の爆発
    });
});

describe('上級の専門職と車', () => {
    const ready = (roles) => {
        const game = setup(makeGame(2, { mode: 'experienced' }), [C(3, 0), C(0, 2)], roles);
        clearBoard(game);
        return game;
    };

    it('泡消火隊員は消火だけの AP を先に使い、救急隊員の消火は2AP', () => {
        const game = ready(['cafs', 'paramedic']);
        game.players[0].cell = C(3, 1);
        game.fire[C(3, 2)] = 2;
        expect(game.players[0]).toMatchObject({ ap: 3, ext: 3 });
        game.applyCommand(0, { type: 'extinguish', cell: C(3, 2) });
        game.applyCommand(0, { type: 'extinguish', cell: C(3, 2) });
        expect(game.players[0]).toMatchObject({ ap: 3, ext: 1 });
        game.applyCommand(0, { type: 'end' });
        game.fire = game.fire.map(() => 0);
        game.players[1].cell = C(3, 1);
        game.fire[C(3, 2)] = 2;
        game.applyCommand(1, { type: 'extinguish', cell: C(3, 2) });
        expect(game.players[1].ap).toBe(2);
    });

    it('救急隊員が手当てした要救助者は1APで連れて歩ける', () => {
        const game = ready(['paramedic', 'generalist']);
        game.players[0].cell = C(3, 2);
        game.pois.push({ id: 95, cell: C(3, 2), revealed: true, victim: true, treated: false });
        game.applyCommand(0, { type: 'treat' });
        game.applyCommand(0, { type: 'carry', item: 'p95' });
        game.applyCommand(0, { type: 'move', to: C(3, 1) });
        expect(game.players[0].ap).toBe(2);
        game.applyCommand(0, { type: 'move', to: C(3, 0) });
        expect(game.rescued).toBe(1);
    });

    it('探査隊員はどこの印でも調べられ、危険物処理員は危険物を処理する', () => {
        const game = ready(['imaging', 'hazmat']);
        game.pois.push({ id: 96, cell: C(6, 8), revealed: false, victim: false, treated: false });
        expect(game.applyCommand(0, { type: 'identify', cell: C(6, 8) })).toBe(true);
        expect(game.pois.length).toBe(0);
        game.applyCommand(0, { type: 'end' });
        game.players[1].cell = C(2, 2);
        game.hazmats = [{ id: 97, cell: C(2, 2) }];
        expect(game.applyCommand(1, { type: 'dispose' })).toBe(true);
        expect(game.hazmats.length).toBe(0);
    });

    it('消防車に乗って放水すると、区画の中の火と煙が消える。区画に隊員がいると放水できない', () => {
        const game = ready(['driver', 'generalist']);
        game.players[0].cell = ENGINE_SPOTS[0][0];
        game.players[1].cell = C(2, 2);
        game.fire[C(1, 1)] = 2;
        expect(game.applyCommand(0, { type: 'gun' })).toBe(false);
        game.players[1].cell = C(6, 6);
        [C(1, 1), C(1, 2), C(1, 3), C(1, 4), C(2, 1), C(2, 2), C(2, 3), C(2, 4), C(3, 1), C(3, 2), C(3, 3), C(3, 4)].forEach(c => { game.fire[c] = 2; });
        expect(game.applyCommand(0, { type: 'gun' })).toBe(true);
        expect(game.players[0].ap).toBe(2);
        expect(game.fire.filter(f => f === 2).length).toBeLessThan(12);
    });

    it('車は2APで隣の駐車場へ、乗っている隊員も一緒に動く。隊長は指揮でほかの隊員を動かす', () => {
        const game = ready(['captain', 'generalist']);
        game.players[0].cell = ENGINE_SPOTS[0][1];
        expect(game.applyCommand(0, { type: 'drive', vehicle: 'engine', side: 1 })).toBe(true);
        expect(game.players[0].cell).toBe(ENGINE_SPOTS[1][1]);
        expect(game.applyCommand(0, { type: 'drive', vehicle: 'ambulance', side: 0 })).toBe(false); // 向かいは4AP
        expect(game.applyCommand(0, { type: 'drive', vehicle: 'ambulance', side: 1 })).toBe(true);
        expect(game.vehicles).toEqual({ ambulance: 1, engine: 1 });
        game.players[1].cell = C(3, 0);
        expect(game.applyCommand(0, { type: 'command', seat: 1, to: C(3, 1) })).toBe(true);
        expect(game.players[1].cell).toBe(C(3, 1));
        expect(game.players[0].cp).toBe(1);
    });
});

describe('断る操作', () => {
    it('通らない操作は状態を変えない', () => {
        const game = setup(makeGame(3), [C(3, 0), C(0, 5), C(4, 9)]);
        const before = snapshot(game);
        [
            [1, { type: 'end' }],
            [0, { type: 'move', to: C(5, 5) }],
            [0, { type: 'door', to: C(3, 1) }],
            [0, { type: 'extinguish', cell: C(5, 5) }],
            [0, { type: 'chop', to: C(3, 1) }],
            [0, { type: 'identify', cell: C(1, 1) }],
            [0, { type: 'drive', vehicle: 'engine', side: 1 }],
            [0, { type: 'carry', item: 'p1' }],
            [0, { type: 'drop' }],
            [0, { type: 'place', cell: C(0, 0) }],
            [0, { type: 'nope' }],
            [0, null]
        ].forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = makeGame(2);
        game.applyCommand(0, { type: 'place', cell: C(3, 0), extra: 'x' });
        expect(game.commands[0].command).toEqual({ type: 'place', cell: C(3, 0) });
    });
});

describe('記録からの再現', () => {
    it.each([['family', 1], ['family', 2], ['experienced', 3]])('%s・シード %i：記録から同じ局面になる', async (mode, seed) => {
        const { runCpuStep } = await import('../public/js/cpu-player.js');
        const game = new Game(players(4, true), { seed, mode, level: 'veteran' });
        for (let i = 0; i < 300 && !game.isOver(); i++) runCpuStep(game);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
    });

    it('同じシードなら同じ盤面で始まる', () => {
        expect(snapshot(makeGame(3, { seed: 9, mode: 'experienced' }))).toBe(snapshot(makeGame(3, { seed: 9, mode: 'experienced' })));
        expect(initialEdges()).toEqual(makeGame(2).edges);
    });
});
