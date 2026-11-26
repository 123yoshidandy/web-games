import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { HEXES, ADJ, LAND, RIVER_DIST, BRIDGE_PAIRS, hexDistance } from '../public/js/map.js';
import { makeGame, quickSetup, put, clearBoard, turnTo, act } from './helpers.js';

// 建物のない盤面で、手番を seat にしたゲーム
const ready = (factions, seat = 0) => {
    const game = quickSetup(makeGame(factions, 7));
    clearBoard(game);
    turnTo(game, seat);
    // 1ラウンド目の得点タイルは、ほかの検査に混ざらない町のタイルにする
    game.state.scoreTiles[0] = 'SCORE2';
    game.players.forEach(p => {
        p.res = { C: 30, W: 20, P: 5, VP: 20 };
        p.power = [0, 0, 12];
    });
    return game;
};
const label = (hex) => HEXES[hex].label;
const landNeighbors = (hex) => ADJ[hex].filter(n => HEXES[n].land);
// 隣でも川向こう1マスでもない、ちょうど d だけ離れた土地
const farLand = (from, d) => LAND.find(h => hexDistance(from, h) === d && !ADJ[from].includes(h) && !((RIVER_DIST[from].get(h) ?? 99) <= 1));

describe('勢力の能力', () => {
    it('ドワーフはトンネルで1マス先に建てられる（職人2を足し 4点）。要塞で職人1', () => {
        const game = ready(['dwarves', 'witches']);
        const home = put(game, 0, 'E5');
        const target = farLand(home, 2);
        game.state.hexes[target].terrain = 'mountains';
        const p = game.players[0];
        act(game, 0, { type: 'build', hex: target });
        expect(p.res).toMatchObject({ W: 20 - 2 - 1, C: 28, VP: 24 });
        // 3マス先には届かない
        const tooFar = LAND.find(h => game.ownHexes(0).every(o => hexDistance(o, h) >= 3) && !game.state.hexes[h].building);
        game.state.hexes[tooFar].terrain = 'mountains';
        turnTo(game, 0);
        expect(game.applyCommand(0, { type: 'build', hex: tooFar })).toBe(false);
        // 要塞があれば職人1
        p.buildings.SH = 1;
        const next = LAND.find(h => !game.state.hexes[h].building && game.ownHexes(0).some(o => hexDistance(o, h) === 2) && game.ownHexes(0).every(o => hexDistance(o, h) >= 2 && !((RIVER_DIST[o].get(h) ?? 99) <= 0)));
        game.state.hexes[next].terrain = 'mountains';
        expect(game.reach(0, next).extra.cost).toEqual({ W: 1 });
    });

    it('苦行僧はじゅうたんで司祭1を払って飛び、4点。要塞で距離が1つ伸びる', () => {
        const game = ready(['fakirs', 'witches']);
        const home = put(game, 0, 'E5');
        const target = farLand(home, 2);
        game.state.hexes[target].terrain = 'desert';
        const three = LAND.find(h => hexDistance(home, h) === 3 && game.state.hexes[h].terrain !== 'river');
        expect(game.reach(0, three).ok).toBe(false);
        act(game, 0, { type: 'build', hex: target });
        expect(game.players[0].res).toMatchObject({ P: 4, VP: 24 });
        game.players[0].buildings.SH = 1;
        expect(game.teleportRange(0)).toBe(2);
        const far3 = LAND.find(h => game.ownHexes(0).every(o => hexDistance(o, h) >= 3) && game.ownHexes(0).some(o => hexDistance(o, h) === 3));
        expect(game.reach(0, far3)).toMatchObject({ ok: true, extra: { type: 'carpet' } });
    });

    it('魔女の飛行：要塞があれば、ラウンドに1回、どこの森にでも無料で住居を建てられる', () => {
        const game = ready(['witches', 'giants']);
        put(game, 0, 'E5', 'SH');
        const far = LAND.find(h => game.state.hexes[h].terrain === 'forest' && hexDistance(h, game.ownHexes(0)[0]) > 4);
        const before = { ...game.players[0].res };
        act(game, 0, { type: 'special', id: 'ACTW', hex: far });
        expect(game.state.hexes[far]).toMatchObject({ owner: 0, building: 'D' });
        expect(game.players[0].res.W).toBe(before.W);
        expect(game.players[0].res.C).toBe(before.C);
        turnTo(game, 0);
        expect(game.availableSpecials(0)).not.toContain('ACTW');
    });

    it('遊牧民の砂嵐：隣の土地を無料で砂漠に変え、住居を建てられる。鋤の得点にはならない', () => {
        const game = ready(['nomads', 'witches']);
        const home = put(game, 0, 'E5', 'SH');
        const target = landNeighbors(home).find(n => game.state.hexes[n].terrain !== 'desert');
        game.state.scoreTiles[0] = 'SCORE1';
        const vp = game.players[0].res.VP;
        act(game, 0, { type: 'special', id: 'ACTN', hex: target });
        expect(game.state.hexes[target].terrain).toBe('desert');
        expect(game.waiting()).toMatchObject({ kind: 'spades', seat: 0, spades: 0 });
        act(game, 0, { type: 'build', hex: target });
        expect(game.state.hexes[target]).toMatchObject({ owner: 0, building: 'D' });
        expect(game.players[0].res.VP).toBe(vp);
    });

    it('混沌の魔術師：要塞の行動で続けて2回行動する。寺院で恩恵タイルを2枚', () => {
        const game = ready(['chaosmagicians', 'witches']);
        const tp = put(game, 0, 'E5', 'TP');
        put(game, 0, 'A1', 'SH');
        act(game, 0, { type: 'special', id: 'ACTC' });
        expect(game.state.current).toBe(0);
        act(game, 0, { type: 'upgrade', hex: tp, to: 'TE' });
        expect(game.waiting()).toMatchObject({ kind: 'favor', seat: 0 });
        act(game, 0, { type: 'favor', id: 'FAV9' });
        expect(game.waiting()).toMatchObject({ kind: 'favor', seat: 0 });
        act(game, 0, { type: 'favor', id: 'FAV10' });
        expect(game.state.current).toBe(0);
        act(game, 0, { type: 'power', id: 'ACT4' });
        expect(game.state.current).toBe(1);
    });

    it('群れの民：要塞の行動で住居を無料で交易所に。町で職人3', () => {
        const game = ready(['swarmlings', 'witches']);
        const d = put(game, 0, 'E5');
        put(game, 0, 'A1', 'SH');
        const before = { ...game.players[0].res };
        act(game, 0, { type: 'special', id: 'ACTS', hex: d });
        expect(game.state.hexes[d].building).toBe('TP');
        expect(game.players[0].res.W).toBe(before.W);
        expect(game.players[0].res.C).toBe(before.C);
        game.state.queue.push({ kind: 'town', seat: 0 });
        act(game, 0, { type: 'town', id: 'TW1' });
        expect(game.players[0].res.W).toBe(before.W + 3);
    });

    it('森の賢者：要塞ですぐに恩恵タイル。要塞の行動で宗教の段を2つ', () => {
        const game = ready(['auren', 'witches']);
        const tp = put(game, 0, 'E5', 'TP');
        act(game, 0, { type: 'upgrade', hex: tp, to: 'SH' });
        expect(game.waiting()).toMatchObject({ kind: 'favor', seat: 0 });
        act(game, 0, { type: 'favor', id: 'FAV11' });
        turnTo(game, 0);
        const before = game.players[0].cult.fire;
        act(game, 0, { type: 'special', id: 'ACTA', track: 'fire' });
        expect(game.players[0].cult.fire).toBe(before + 2);
    });

    it('巨人：要塞の行動で無料の鋤2つ。どの地形も荒地に変えて建てられる', () => {
        const game = ready(['giants', 'witches']);
        const home = put(game, 0, 'E5', 'SH');
        const target = landNeighbors(home)[0];
        game.state.hexes[target].terrain = 'lakes';
        const w = game.players[0].res.W;
        act(game, 0, { type: 'special', id: 'ACTG' });
        act(game, 0, { type: 'transform', hex: target, full: false });
        expect(game.state.hexes[target].terrain).toBe('wasteland');
        act(game, 0, { type: 'build', hex: target });
        expect(game.players[0].res.W).toBe(w - 1);
    });

    it('錬金術師：交換（1点→コイン1、コイン2→1点）。要塞で魔力12、以後は鋤1つで魔力2', () => {
        const game = ready(['alchemists', 'witches']);
        const p = game.players[0];
        act(game, 0, { type: 'convert', kind: 'VP>C', n: 2 });
        expect(p.res).toMatchObject({ VP: 18, C: 32 });
        act(game, 0, { type: 'convert', kind: 'C>VP', n: 1 });
        expect(p.res).toMatchObject({ VP: 19, C: 30 });
        expect(game.applyCommand(1, { type: 'convert', kind: 'C>VP', n: 1 })).toBe(false);
        const tp = put(game, 0, 'E5', 'TP');
        p.power = [12, 0, 0];
        act(game, 0, { type: 'upgrade', hex: tp, to: 'SH' });
        expect(p.power).toEqual([0, 12, 0]);
        turnTo(game, 0);
        const target = landNeighbors(tp)[0];
        game.state.hexes[target].terrain = 'lakes'; // 沼地の隣（鋤1つ）
        act(game, 0, { type: 'transform', hex: target });
        expect(p.power).toEqual([0, 10, 2]);
    });

    it('小人族：要塞で鋤3つ（1か所に建ててよい）。鋤1つごとに1点', () => {
        const game = ready(['halflings', 'witches']);
        const tp = put(game, 0, 'E5', 'TP');
        const targets = landNeighbors(tp).slice(0, 2);
        game.state.hexes[targets[0]].terrain = 'desert'; // 平原の隣（鋤1つ）
        game.state.hexes[targets[1]].terrain = 'lakes'; // 平原から2つ
        act(game, 0, { type: 'upgrade', hex: tp, to: 'SH' });
        expect(game.waiting()).toMatchObject({ kind: 'spades', spades: 3, canBuild: true });
        const vp = game.players[0].res.VP;
        act(game, 0, { type: 'transform', hex: targets[0], full: false });
        act(game, 0, { type: 'transform', hex: targets[1], full: false });
        expect(game.players[0].res.VP).toBe(vp + 3);
        act(game, 0, { type: 'build', hex: targets[1] });
        expect(game.state.hexes[targets[1]].building).toBe('D');
        expect(game.state.queue.length).toBe(0);
    });

    it('教団：だれかが魔力を受け取れば宗教の段を1つ、全員が断れば魔力1。要塞で7点', () => {
        const game = ready(['cultists', 'witches']);
        const d = put(game, 0, 'E5');
        put(game, 1, label(landNeighbors(d)[0]), 'D', 'forest');
        game.players[1].power = [5, 0, 0];
        act(game, 0, { type: 'upgrade', hex: d, to: 'TP' });
        act(game, 1, { type: 'leech', accept: true });
        expect(game.waiting()).toMatchObject({ kind: 'cultist', seat: 0 });
        const fire = game.players[0].cult.fire;
        act(game, 0, { type: 'cultist', track: 'fire' });
        expect(game.players[0].cult.fire).toBe(fire + 1);

        turnTo(game, 0);
        game.players[0].power = [1, 0, 0];
        act(game, 0, { type: 'upgrade', hex: d, to: 'TE' });
        act(game, 0, { type: 'favor', id: 'FAV10' });
        act(game, 1, { type: 'leech', accept: false });
        expect(game.players[0].power).toEqual([0, 1, 0]);

        turnTo(game, 0);
        const vp = game.players[0].res.VP;
        const tp = put(game, 0, 'A1', 'TP');
        act(game, 0, { type: 'upgrade', hex: tp, to: 'SH' });
        expect(game.players[0].res.VP).toBe(vp + 7);
    });

    it('闇の民：要塞で職人を3人まで司祭に替えられる', () => {
        const game = ready(['darklings', 'witches']);
        const tp = put(game, 0, 'E5', 'TP');
        game.players[0].res.P = 0;
        act(game, 0, { type: 'upgrade', hex: tp, to: 'SH' });
        expect(game.waiting()).toMatchObject({ kind: 'darklings' });
        expect(game.applyCommand(0, { type: 'darklings', n: 4 })).toBe(false);
        const w = game.players[0].res.W;
        act(game, 0, { type: 'darklings', n: 3 });
        expect(game.players[0].res).toMatchObject({ W: w - 3, P: 3 });
    });

    it('人魚：町は川1マスをはさんでもつながる。要塞で航海が1つ伸びて点', () => {
        const game = ready(['mermaids', 'witches']);
        // 川1マスをはさむ組を探し、片側に3つ、反対側に1つ置く
        let layout = null;
        for (const [x, y] of BRIDGE_PAIRS) {
            const near = landNeighbors(x).filter(n => !ADJ[n].includes(y) && n !== y);
            if (near.length < 2) continue;
            layout = { x, y, a: near[0], b: near[1] };
            break;
        }
        const { x, y, a, b } = layout;
        put(game, 0, label(x), 'TP');
        put(game, 0, label(y), 'TP');
        put(game, 0, label(a), 'TP');
        game.state.hexes[b].terrain = 'lakes';
        act(game, 0, { type: 'build', hex: b });
        expect(game.waiting()).toMatchObject({ kind: 'town', seat: 0 });
        act(game, 0, { type: 'town', id: 'TW1' });
        expect(game.state.hexes[y].town).toBe(game.state.hexes[x].town);

        turnTo(game, 0);
        game.players[0].ship = 2;
        const vp = game.players[0].res.VP;
        act(game, 0, { type: 'upgrade', hex: a, to: 'SH' });
        expect(game.players[0].ship).toBe(3);
        expect(game.players[0].res.VP).toBe(vp + 3);
    });

    it('技師：職人2で橋を架けられる。要塞があれば、自分の建物をつなぐ橋1本ごとにパスで3点', () => {
        const game = ready(['engineers', 'witches']);
        const [a, b] = BRIDGE_PAIRS[0];
        put(game, 0, label(a));
        const w = game.players[0].res.W;
        act(game, 0, { type: 'special', id: 'ACTE', bridge: [a, b] });
        expect(game.state.bridges).toEqual([{ a: Math.min(a, b), b: Math.max(a, b), owner: 0 }]);
        expect(game.players[0].res.W).toBe(w - 2);
        // 橋の向こうは隣とみなす
        expect(game.reach(0, b)).toMatchObject({ ok: true, extra: null });
        put(game, 0, label(b));
        put(game, 0, 'A1', 'SH');
        turnTo(game, 0);
        const vp = game.players[0].res.VP;
        act(game, 0, { type: 'pass', bonus: Object.keys(game.state.bonusPool)[0] });
        expect(game.players[0].res.VP - vp).toBeGreaterThanOrEqual(3);
    });

    it('魔力アクションの鋤2つは、2か所に分けて使え、変えた土地の1つに建てられる', () => {
        const game = ready(['witches', 'giants']);
        const home = put(game, 0, 'E5');
        const [t1, t2] = landNeighbors(home);
        game.state.hexes[t1].terrain = 'lakes';  // 森の隣
        game.state.hexes[t2].terrain = 'mountains'; // 森の隣
        act(game, 0, { type: 'power', id: 'ACT6' });
        act(game, 0, { type: 'transform', hex: t1, full: false });
        expect(game.waiting()).toMatchObject({ kind: 'spades', spades: 1 });
        act(game, 0, { type: 'transform', hex: t2, full: false });
        act(game, 0, { type: 'build', hex: t2 });
        expect(game.state.hexes[t1]).toMatchObject({ terrain: 'forest', building: null });
        expect(game.state.hexes[t2]).toMatchObject({ terrain: 'forest', building: 'D' });
        expect(game.applyCommand(0, { type: 'build', hex: t1 })).toBe(false);
    });
});

describe('タイルと得点', () => {
    it('恩恵タイル（火＋2）があれば、町は魔力6でよい', () => {
        const game = ready(['witches', 'giants']);
        const chain = [hexOfLabel('E5')];
        while (chain.length < 4) chain.push(landNeighbors(chain.at(-1)).find(n => !chain.includes(n)));
        put(game, 0, label(chain[0]), 'TP');
        put(game, 0, label(chain[1]), 'TP');
        put(game, 0, label(chain[2]), 'D');
        game.state.hexes[chain[3]].terrain = 'forest';
        game.players[0].favors.push('FAV5');
        act(game, 0, { type: 'build', hex: chain[3] });
        expect(game.waiting()).toMatchObject({ kind: 'town', seat: 0 });
    });

    it('パスの得点：ボーナスカード（要塞・聖域4点）と恩恵タイル（交易所の数）', () => {
        const game = ready(['witches', 'giants']);
        put(game, 0, 'E5', 'SH');
        put(game, 0, 'A1', 'TP');
        put(game, 0, 'A3', 'TP');
        game.players[0].bonus = 'BON6';
        game.players[0].favors.push('FAV12');
        const vp = game.players[0].res.VP;
        const next = Object.keys(game.state.bonusPool)[0];
        act(game, 0, { type: 'pass', bonus: next });
        expect(game.players[0].res.VP).toBe(vp + 4 + 3);
        expect(game.state.bonusPool.BON6).toBe(0);
    });

    it('ラウンドの終わりに、得点タイルの宗教の段に応じたボーナス。最後のラウンドにはない', () => {
        const game = ready(['witches', 'giants']);
        game.state.scoreTiles[0] = 'SCORE5'; // 火4ごとに魔力4
        game.players[0].cult.fire = 8;
        game.players[0].power = [8, 0, 0];
        act(game, 0, { type: 'pass', bonus: Object.keys(game.state.bonusPool)[0] });
        act(game, 1, { type: 'pass', bonus: Object.keys(game.state.bonusPool)[0] });
        expect(game.state.round).toBe(2);
        // 魔力8を受け取り、さらに2ラウンド目の収入
        expect(game.players[0].power[0]).toBe(0);
    });

    it('最後の得点：つながりと宗教の段の順位（同点は分ける・0 は点なし）と資源', () => {
        const game = ready(['witches', 'giants', 'nomads']);
        game.players[0].cult = { fire: 5, water: 3, earth: 0, air: 0 };
        game.players[1].cult = { fire: 5, water: 2, earth: 0, air: 0 };
        game.players[2].cult = { fire: 1, water: 0, earth: 0, air: 0 };
        game.players.forEach(p => {
            p.res = { C: 0, W: 0, P: 0, VP: 0 };
            p.power = [0, 0, 0];
        });
        game.players[0].res.C = 7;
        game.state.round = 6;
        game.finish();
        const f = game.state.final;
        expect(f[0].cultVp).toEqual([6, 8, 0, 0]);
        expect(f[1].cultVp).toEqual([6, 4, 0, 0]);
        expect(f[2].cultVp).toEqual([2, 0, 0, 0]);
        expect(f[0].resourceVp).toBe(2);
    });

    it('2〜5人で、ボーナスカードは人数＋3枚', () => {
        [2, 3, 4, 5].forEach(n => {
            const game = new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), { seed: 3 });
            expect(Object.keys(game.state.bonusPool).length).toBe(n + 3);
        });
    });
});

function hexOfLabel(text) {
    return HEXES.find(h => h.label === text).id;
}
