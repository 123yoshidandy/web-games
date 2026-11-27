import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { makeGame, land, L, clearBoard, put, count, snapshot, players } from './helpers.js';
import {
    explore, build, ravage, addBlight, fear, checkVictory, invaderPhase, resolveFear, terrorLevel, topology,
    availablePowers, isSacred, energyValue, cardPlays
} from '../public/js/rules.js';
import { INVADER_CARD, LEVELS } from '../public/js/data.js';
import { runCpuStep, suggest } from '../public/js/cpu-player.js';

// 精霊を力のフェイズに置き、使ったカードを決める（流れを通さずに力だけを確かめる）
function toPowers(game, phase, plays = {}) {
    game.s.phase = phase;
    game.s.spirits.forEach((sp, seat) => {
        sp.step = 'ready';
        sp.done = false;
        sp.played = plays[seat] ?? [];
        sp.used = [];
    });
}

describe('準備', () => {
    it('1人：ボード1枚・奔流の存在・最初の探検・荒廃と恐怖の量', () => {
        const game = makeGame(1, { level: 'normal' });
        const s = game.s;
        expect(s.lands).toHaveLength(8);
        expect(s.spirits[0].key).toBe('river');
        expect(L(game, 'A5').presence[0]).toBe(1); // いちばん番号の大きい湿地
        expect(s.spirits[0].hand).toHaveLength(4);
        expect(s.invader.ravage).toBe(null);
        expect(s.invader.build).toBe(s.invader.explored);
        expect(INVADER_CARD[s.invader.build].stage).toBe(1);
        expect(s.invader.deck).toHaveLength(11);
        expect(s.invader.deck.map(id => INVADER_CARD[id].stage)).toEqual([1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
        expect(s.fear.pool).toBe(LEVELS.normal.fearPerPlayer);
        expect(s.blight.pool).toBe(LEVELS.normal.blightPerPlayer + 1);
        expect(s.fear.deck).toHaveLength(LEVELS.normal.fearCards);
    });

    it('4人：4つの精霊の最初の存在と、ボードどうしのつながり', () => {
        const game = makeGame(4);
        expect(game.s.lands).toHaveLength(32);
        expect(game.s.spirits.map(sp => sp.key)).toEqual(['river', 'earth', 'lightning', 'shadows']);
        expect(L(game, 'B7').presence[1]).toBe(2); // 大地：いちばん大きい山岳に2つ
        expect(L(game, 'B8').presence[1]).toBe(1); // 大地：いちばん大きい密林に1つ
        expect(L(game, 'C8').presence[2]).toBe(2); // 稲妻：いちばん大きい砂漠に2つ
        expect(L(game, 'D5').presence[3]).toBe(2); // 影：いちばん大きい密林と土地5（どちらも D5）
        const { adj } = topology(4);
        adj.forEach((list, a) => list.forEach(b => expect(adj[b]).toContain(a)));
        expect(adj[land(game, 'A7')]).toContain(land(game, 'B7'));
        expect(adj[land(game, 'A3')]).toContain(land(game, 'C1'));
    });

    it('精霊は選んだ順に割り当て、重なりや知らない名前は決まった順で埋める', () => {
        expect(new Game(players(2), { spirits: ['shadows', 'lightning'] }).s.spirits.map(s => s.key)).toEqual(['shadows', 'lightning']);
        expect(new Game(players(2), { spirits: ['shadows', 'shadows'] }).s.spirits.map(s => s.key)).toEqual(['shadows', 'river']);
        expect(new Game(players(1), { spirits: ['x'] }).s.spirits.map(s => s.key)).toEqual(['river']);
    });
});

describe('侵略者の動き', () => {
    it('探検：海沿いか、町・都市のある土地かそのとなりにだけ来る', () => {
        const game = makeGame(1);
        clearBoard(game);
        explore(game.ctx(), '1W'); // A2（海沿い）・A5（内陸）
        expect(count(game, 'A2', 'E')).toBe(1);
        expect(count(game, 'A5', 'E')).toBe(0);
        clearBoard(game);
        put(game, 'A8', { T: 1 }); // A5 のとなり
        explore(game.ctx(), '1W');
        expect(count(game, 'A5', 'E')).toBe(1);
    });

    it('建設：町が都市より多ければ都市、そうでなければ町。侵略者のいない土地には建たない', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A2', { E: 1 });
        put(game, 'A5', { T: 1 });
        build(game.ctx(), '1W');
        expect(count(game, 'A2', 'T')).toBe(1);
        expect(count(game, 'A5', 'C')).toBe(1);
        build(game.ctx(), '1M'); // A1・A6 に侵略者はいない
        expect(L(game, 'A1').inv).toHaveLength(0);
    });

    it('荒らし：2以上のダメージで荒廃。ダハンが倒れ、残ったダハンが反撃する（町を倒すと恐怖1）', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A2', { T: 1, E: 1, D: 2 });
        const pool = game.s.blight.pool;
        ravage(game.ctx(), '1W');
        const a2 = L(game, 'A2');
        expect(a2.blight).toBe(1);
        expect(game.s.blight.pool).toBe(pool - 1);
        expect(a2.dahan).toHaveLength(1); // 3ダメージ：1体が倒れ、もう1体は傷を負って残る
        expect(a2.inv.map(p => p.k)).toEqual(['E']); // 反撃の2ダメージで町が倒れる
        expect(game.s.fear.gen).toBe(1);
    });

    it('防御と、大地の聖地の生命力は、荒らしのダメージを減らす', () => {
        const game = makeGame(2, { spirits: ['river', 'earth'] });
        clearBoard(game);
        put(game, 'A2', { T: 1, E: 1 });
        L(game, 'A2').defend = 2;
        put(game, 'B7', { T: 1, E: 1 }); // 大地の聖地（存在2）
        ravage(game.ctx(), '1W');
        ravage(game.ctx(), '1M');
        expect(L(game, 'A2').blight).toBe(0);
        expect(L(game, 'B7').blight).toBe(0);
    });

    it('荒廃のある土地に荒廃が足されると、となりの荒廃のない土地へ連鎖する。荒廃は存在を1つ壊す', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A5', { B: 1 });
        L(game, 'A1').presence[0] = 1; // 島に存在が残るように
        addBlight(game.ctx(), land(game, 'A5'));
        const a5 = L(game, 'A5');
        expect(a5.blight).toBe(2);
        expect(a5.presence[0]).toBe(0);
        expect(game.s.spirits[0].destroyed).toBe(1);
        expect(a5.adj.reduce((sum, id) => sum + game.s.lands[id].blight, 0)).toBe(1);
    });

    it('侵略者フェイズ：恐怖カード・荒らし・建設・探検のあと、カードが1つずつ進む', () => {
        const game = makeGame(1);
        const { build: b } = game.s.invader;
        const next = game.s.invader.deck[0];
        invaderPhase(game.ctx());
        expect(game.s.invader.ravage).toBe(b);
        expect(game.s.invader.build).toBe(next);
        expect(game.s.invader.deck).toHaveLength(10);
    });
});

describe('恐怖と勝ち負け', () => {
    it('恐怖が溜まると恐怖カードを得て、山の3分の1ごとに段階が上がり、山が尽きると勝ち', () => {
        const game = makeGame(1, { level: 'hard' }); // 恐怖4・カード9枚
        const ctx = game.ctx();
        fear(ctx, 4);
        expect(game.s.fear.earnedCount).toBe(1);
        expect(game.s.fear.gen).toBe(0);
        fear(ctx, 8);
        expect(terrorLevel(game.s)).toBe(2);
        fear(ctx, 4 * 6);
        expect(game.s.result).toEqual({ won: true, reason: 'fear' });
    });

    it('恐怖の段階1では、島から侵略者がいなくなれば勝ち', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A1', { E: 1 });
        checkVictory(game.ctx());
        expect(game.s.result).toBe(null);
        L(game, 'A1').inv = [];
        checkVictory(game.ctx());
        expect(game.s.result).toEqual({ won: true, reason: 'terror' });
    });

    it('恐怖の段階3では、都市がなくなれば勝ち', () => {
        const game = makeGame(1, { level: 'hard' });
        game.s.fear.earnedCount = 6;
        clearBoard(game);
        put(game, 'A1', { E: 2, T: 1 });
        checkVictory(game.ctx());
        expect(game.s.result?.won).toBe(true);
    });

    it('荒廃カードが尽きると裏返って荒廃が足され、裏でも尽きると負け', () => {
        const game = makeGame(1, { level: 'hard' });
        clearBoard(game);
        game.s.blight.pool = 1;
        const ctx = game.ctx();
        addBlight(ctx, land(game, 'A1'));
        expect(game.s.blight.flipped).toBe(true);
        expect(game.s.blight.pool).toBe(LEVELS.hard.blightedPerPlayer);
        game.s.blight.pool = 1;
        addBlight(ctx, land(game, 'A3'));
        expect(game.s.result).toEqual({ won: false, reason: 'blight' });
    });

    it('精霊の存在が島からなくなると負け', () => {
        const game = makeGame(1);
        clearBoard(game);
        addBlight(game.ctx(), land(game, 'A5')); // 奔流の存在は A5 の1つだけ
        expect(game.s.result).toEqual({ won: false, reason: 'presence' });
    });

    it('侵略者の山が尽きて探検できないと負け', () => {
        const game = makeGame(1);
        game.s.invader.deck = [];
        invaderPhase(game.ctx());
        expect(game.s.result).toEqual({ won: false, reason: 'time' });
    });

    it('恐怖カードの効果は、得たときではなく侵略者フェイズの段階で決まる（孤立する集落の段階3は建設なし）', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A2', { E: 1 });
        resolveFear(game.ctx(), 'isolation', 3);
        build(game.ctx(), '1W');
        expect(count(game, 'A2', 'T')).toBe(0);
    });
});

describe('成長とカード', () => {
    it('成長で存在を置くと列の次の値が見え、終わるとエネルギーを得てカードを使う段になる', () => {
        const game = makeGame(1);
        expect(game.applyCommand(0, { type: 'growth', option: 1 })).toBe(true); // 存在を2つ（範囲1）
        const sp = game.s.spirits[0];
        expect(sp.prompt).toEqual({ kind: 'presence', range: 1 });
        expect(game.applyCommand(0, { type: 'presence', track: 'energy', land: land(game, 'A8') })).toBe(true);
        expect(game.applyCommand(0, { type: 'presence', track: 'cards', land: land(game, 'A5') })).toBe(true);
        expect(energyValue(game.s, 0)).toBe(2);
        expect(cardPlays(game.s, 0)).toBe(2);
        expect(sp.energy).toBe(2);
        expect(sp.step).toBe('play');
    });

    it('範囲の外の土地には存在を置けない。断った操作は状態を変えない', () => {
        const game = makeGame(1);
        game.applyCommand(0, { type: 'growth', option: 1 });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'presence', track: 'energy', land: land(game, 'A1') })).toBe(false); // A5 から2つ離れている
        expect(snapshot(game)).toBe(before);
    });

    it('使えるカードの枚数とエネルギーを超えては使えない', () => {
        const game = makeGame(1);
        game.applyCommand(0, { type: 'growth', option: 0 }); // 捨て札を戻す・カードを得る・エネルギー1
        game.applyCommand(0, { type: 'deck', deck: 'minor' });
        game.applyCommand(0, { type: 'pick', card: game.s.spirits[0].prompt.cards[0] });
        const sp = game.s.spirits[0];
        expect(sp.step).toBe('play');
        expect(sp.energy).toBe(2); // 成長の1 と 列の1
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'play', cards: ['vigor', 'bounty'] })).toBe(false); // 1枚まで
        expect(game.applyCommand(0, { type: 'play', cards: ['flash', 'wash'] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { type: 'play', cards: ['flash'] })).toBe(true);
        expect(sp.energy).toBe(0);
        expect(game.s.phase).toBe('fast');
    });

    it('大いなる力を得るときは、カードを1枚忘れる', () => {
        const game = makeGame(1);
        game.applyCommand(0, { type: 'growth', option: 0 });
        game.applyCommand(0, { type: 'deck', deck: 'major' });
        const card = game.s.spirits[0].prompt.cards[0];
        game.applyCommand(0, { type: 'pick', card });
        expect(game.s.spirits[0].prompt).toEqual({ kind: 'forget', gained: card });
        expect(game.applyCommand(0, { type: 'forget', card })).toBe(false);
        expect(game.applyCommand(0, { type: 'forget', card: 'vigor' })).toBe(true);
        expect(game.s.spirits[0].hand).not.toContain('vigor');
        expect(game.s.spirits[0].hand).toContain(card);
    });
});

describe('力', () => {
    it('鉄砲水：海沿いでは2ダメージ（町を倒して恐怖1）', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A2', { T: 1 });
        toPowers(game, 'fast', { 0: ['flash'] });
        expect(game.applyCommand(0, { type: 'power', power: 'c:flash', land: land(game, 'A2') }), game.lastError).toBe(true);
        expect(L(game, 'A2').inv).toHaveLength(0);
        expect(game.s.fear.gen).toBe(1);
    });

    it('押し流す：選んだとなりの土地へ探検者と町を押し出す', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A8', { T: 1, E: 2 });
        toPowers(game, 'slow', { 0: ['wash'] });
        expect(game.applyCommand(0, { type: 'power', power: 'c:wash', land: land(game, 'A8'), dest: land(game, 'A7') }), game.lastError).toBe(true);
        expect(L(game, 'A8').inv).toHaveLength(0);
        expect(L(game, 'A7').inv).toHaveLength(3);
        expect(game.applyCommand(0, { type: 'power', power: 'c:wash', land: land(game, 'A8') })).toBe(false); // 1回だけ
    });

    it('となりでない土地へは押し出せない', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A8', { E: 1 });
        toPowers(game, 'slow', { 0: ['wash'] });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'power', power: 'c:wash', land: land(game, 'A8'), dest: land(game, 'A1') })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('奔流：湿地の存在は1つでも聖地', () => {
        const game = makeGame(1);
        expect(isSacred(game.s, 0, L(game, 'A5'))).toBe(true);
    });

    it('稲妻：風の元素の数だけ、遅い力を速い力のフェイズに使える', () => {
        const game = makeGame(1, { spirits: ['lightning'] });
        clearBoard(game);
        toPowers(game, 'fast', { 0: ['storm'] }); // 風1
        expect(availablePowers(game.s, 0).map(p => p.power)).toContain('c:storm');
        toPowers(game, 'fast', { 0: [] });
        game.s.spirits[0].played = ['storm'];
        game.s.spirits[0].swiftUsed = 1;
        expect(availablePowers(game.s, 0)).toHaveLength(0);
    });

    it('影：エネルギー1を払えば、範囲の外でもダハンのいる土地を対象にできる', () => {
        const game = makeGame(1, { spirits: ['shadows'] });
        clearBoard(game);
        put(game, 'A1', { D: 1, E: 1 }); // 存在（A5・A8）から2つ離れている
        toPowers(game, 'slow', { 0: ['crops'] });
        game.s.spirits[0].energy = 1;
        expect(game.applyCommand(0, { type: 'power', power: 'c:crops', land: land(game, 'A1') }), game.lastError).toBe(true);
        expect(game.s.spirits[0].energy).toBe(0);
        expect(game.s.fear.gen).toBe(2);
    });

    it('生まれ持つ力は、元素がそろったときだけ使え、段の高いほど強い', () => {
        const game = makeGame(1);
        clearBoard(game);
        put(game, 'A5', { T: 1, E: 1 });
        toPowers(game, 'slow', { 0: ['wash'] }); // 太陽0：足りない
        expect(availablePowers(game.s, 0).map(p => p.power)).not.toContain('i:flooding');
        toPowers(game, 'slow', { 0: ['flash', 'vigor', 'bounty'] }); // 太陽3・水3
        game.s.spirits[0].used = ['c:flash', 'c:vigor', 'c:bounty'];
        expect(game.applyCommand(0, { type: 'power', power: 'i:flooding', land: land(game, 'A5'), dest: land(game, 'A8') }), game.lastError).toBe(true);
        expect(L(game, 'A5').inv).toHaveLength(0); // 2ダメージで町を倒し、探検者を押し出す
        expect(count(game, 'A8', 'E')).toBe(1);
    });

    it('力をすべて使うか「終える」を押すと、そのフェイズを終える。全員が終えると侵略者フェイズへ進む', () => {
        const game = makeGame(1);
        toPowers(game, 'fast', { 0: ['flash'] });
        const turn = game.s.turn;
        expect(game.applyCommand(0, { type: 'done' })).toBe(true);
        expect(game.s.phase === 'slow' || game.s.turn === turn + 1 || game.isOver()).toBe(true);
    });
});

describe('記録からの再現', () => {
    it.each([[1, 1, 'easy'], [2, 2, 'normal'], [3, 3, 'hard'], [4, 4, 'normal']])('CPU だけの対局を記録から作り直すと、同じ局面になる（%i人・シード%i）', (n, seed, level) => {
        const game = new Game(players(n, true), { seed, level });
        let steps = 0;
        while (!game.isOver() && steps++ < 4000) expect(runCpuStep(game)).toBe(true);
        expect(game.isOver()).toBe(true);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
    });

    it('途中までの記録からも同じ局面になり、続きを打てる', () => {
        const game = new Game(players(2, true), { seed: 9 });
        for (let i = 0; i < 40; i++) runCpuStep(game);
        const again = Game.replay(game.players, game.options, game.commands);
        expect(snapshot(again)).toBe(snapshot(game));
        const seat = again.actors()[0];
        expect(again.applyCommand(seat, suggest(again, seat))).toBe(true);
    });

    it('断られた操作は記録に残らず、状態も変えない', () => {
        const game = makeGame(2);
        const before = snapshot(game);
        [
            [0, { type: 'play', cards: ['flash'] }], [0, { type: 'power', power: 'c:flash', land: 0 }], [0, { type: 'growth', option: 7 }],
            [5, { type: 'growth', option: 0 }], [0, { type: 'nope' }], [0, null], [1, { type: 'presence', track: 'energy', land: 0 }]
        ].forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});
