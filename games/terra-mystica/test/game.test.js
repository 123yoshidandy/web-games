import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { HEXES, ADJ, LAND, RIVER_DIST, BRIDGE_PAIRS, wheelDistance, stepToward } from '../public/js/map.js';
import { TERRAINS, FACTIONS } from '../public/js/data.js';
import { makeGame, quickSetup, put, clearBoard, turnTo, snapshot, act, hexOf, players } from './helpers.js';

const landNeighbor = (hex) => ADJ[hex].find(n => HEXES[n].land);

describe('地図', () => {
    it('7つの地形が11マスずつと、川が36マスある', () => {
        const count = {};
        HEXES.forEach(h => { count[h.terrain] = (count[h.terrain] ?? 0) + 1; });
        TERRAINS.forEach(t => expect(count[t], t).toBe(11));
        expect(count.river).toBe(36);
    });

    it('隣どうしは対称で、端の A1 の隣は A2 と B1', () => {
        ADJ.forEach((list, a) => list.forEach(b => expect(ADJ[b]).toContain(a)));
        expect(ADJ[hexOf('A1')].map(id => HEXES[id].label).sort()).toEqual(['A2', 'B1']);
    });

    it('変換の輪の距離と、自分の地形へ近づける向き', () => {
        expect(wheelDistance('desert', 'wasteland', TERRAINS)).toBe(1);
        expect(wheelDistance('desert', 'lakes', TERRAINS)).toBe(3);
        expect(stepToward('desert', 'swamp', 1, TERRAINS)).toBe('plains');
        expect(stepToward('desert', 'mountains', 1, TERRAINS)).toBe('wasteland');
    });

    it('橋を架けられる組は、川1マスをはさむ土地どうし', () => {
        expect(BRIDGE_PAIRS.length).toBeGreaterThan(20);
        BRIDGE_PAIRS.forEach(([a, b]) => expect(RIVER_DIST[a].get(b)).toBe(1));
    });
});

describe('準備', () => {
    it('最初の住居は手番の順・逆の順で置き、遊牧民の3つ目と混沌の魔術師の1つは最後。カードは逆の順', () => {
        const game = makeGame(['nomads', 'chaosmagicians', 'witches'], 3);
        const seq = game.state.setup.map(x => `${x.kind}:${game.players[x.seat].faction}`);
        const places = seq.filter(x => x.startsWith('place'));
        expect(places.filter(x => x.includes('nomads'))).toHaveLength(3);
        expect(places.filter(x => x.includes('chaosmagicians'))).toHaveLength(1);
        expect(places.at(-1)).toBe('place:chaosmagicians');
        expect(places.at(-2)).toBe('place:nomads');
        const order = game.state.order;
        const bonus = game.state.setup.filter(x => x.kind === 'bonus').map(x => x.seat);
        expect(bonus).toEqual([...order].reverse());
    });

    it('同じシードなら同じ勢力・得点タイル・ボーナスカード。得点タイルの鋤は5・6ラウンドに来ない', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const a = new Game(players(4), { seed });
            const b = new Game(players(4), { seed });
            expect(a.options.factions).toEqual(b.options.factions);
            expect(a.state.scoreTiles).toEqual(b.state.scoreTiles);
            expect(a.state.scoreTiles.slice(4)).not.toContain('SCORE1');
            expect(Object.keys(a.state.bonusPool)).toHaveLength(7);
            expect(new Set(a.options.factions.map(f => FACTIONS[f].terrain)).size).toBe(4);
        }
    });

    it('同じ地形の勢力は選べず、乱数で別の勢力になる', () => {
        const game = makeGame(['witches', 'auren']);
        expect(game.options.factions[0]).toBe('witches');
        expect(FACTIONS[game.options.factions[1]].terrain).not.toBe('forest');
    });

    it('自分の地形にしか置けない。準備が終わると1ラウンド目の収入が入る', () => {
        const game = makeGame(['witches', 'giants']);
        const w = game.waiting();
        const wrong = LAND.find(h => game.state.hexes[h].terrain !== game.home(w.seat));
        expect(game.applyCommand(w.seat, { type: 'place', hex: wrong })).toBe(false);
        quickSetup(game);
        expect(game.state.round).toBe(1);
        expect(game.state.phase).toBe('actions');
        // 魔女：コイン15・職人3 ＋ 住居2つの収入（職人 1→3）＋ ボーナスカード
        const witches = game.players[0];
        expect(witches.res.W).toBeGreaterThanOrEqual(3 + 3);
    });
});

describe('変換と建設', () => {
    const ready = (factions) => {
        const game = quickSetup(makeGame(factions, 5));
        clearBoard(game);
        return game;
    };

    it('鋤2つ分の地形を変えて住居を建てると、職人6・住居の費用を払う', () => {
        const game = ready(['witches', 'giants']);
        const home = put(game, 0, 'E5');
        const target = landNeighbor(home);
        game.state.hexes[target].terrain = 'swamp'; // 森から2つ
        turnTo(game, 0);
        game.players[0].res = { C: 10, W: 10, P: 0, VP: 20 };
        act(game, 0, { type: 'build', hex: target });
        expect(game.players[0].res.W).toBe(10 - 6 - 1);
        expect(game.players[0].res.C).toBe(10 - 2);
        expect(game.state.hexes[target]).toMatchObject({ terrain: 'forest', owner: 0, building: 'D' });
    });

    it('巨人はどの地形も鋤2つ。闇の民は司祭で払い、1つ2点', () => {
        const game = ready(['giants', 'darklings']);
        const g = put(game, 0, 'E5');
        const t = landNeighbor(g);
        game.state.hexes[t].terrain = 'desert'; // 荒地の隣でも2つ
        turnTo(game, 0);
        game.players[0].res = { C: 10, W: 10, P: 0, VP: 20 };
        act(game, 0, { type: 'transform', hex: t });
        expect(game.players[0].res.W).toBe(4);

        const d = put(game, 1, 'H3');
        const t2 = landNeighbor(d);
        game.state.hexes[t2].terrain = 'forest'; // 沼地から2つ
        turnTo(game, 1);
        game.players[1].res = { C: 10, W: 5, P: 2, VP: 20 };
        game.state.scoreTiles[0] = 'SCORE3';
        act(game, 1, { type: 'transform', hex: t2 });
        expect(game.players[1].res).toMatchObject({ P: 0, W: 5, VP: 24 });
    });

    it('届かない土地には建てられない。航海で川の向こうに届く', () => {
        const game = ready(['mermaids', 'giants']);
        const home = put(game, 0, 'C3');
        const far = LAND.find(h => (RIVER_DIST[home].get(h) ?? 99) === 2 && !ADJ[home].includes(h));
        game.state.hexes[far].terrain = 'lakes';
        turnTo(game, 0);
        game.players[0].res = { C: 10, W: 10, P: 0, VP: 20 };
        game.players[0].ship = 1;
        expect(game.applyCommand(0, { type: 'build', hex: far })).toBe(false);
        game.players[0].ship = 2;
        act(game, 0, { type: 'build', hex: far });
    });

    it('交易所は、隣にほかの人の建物があるとコインが半分', () => {
        const game = ready(['witches', 'giants']);
        const a = put(game, 0, 'E5');
        const b = put(game, 0, 'A1');
        put(game, 1, HEXES[landNeighbor(a)].label, 'D', 'wasteland');
        expect(game.checkUpgrade(0, a, 'TP').cost).toEqual({ W: 2, C: 3 });
        expect(game.checkUpgrade(0, b, 'TP').cost).toEqual({ W: 2, C: 6 });
    });

    it('隣の人は魔力を受け取れる（受け取った魔力−1点を払う）。断っても状態は進む', () => {
        const game = ready(['witches', 'giants']);
        const a = put(game, 0, 'E5');
        const n = landNeighbor(a);
        put(game, 1, HEXES[n].label, 'TP', 'wasteland');
        turnTo(game, 0);
        game.players[0].res = { C: 10, W: 10, P: 0, VP: 20 };
        game.players[1].power = [0, 5, 0];
        act(game, 0, { type: 'upgrade', hex: a, to: 'TP' });
        expect(game.waiting()).toMatchObject({ kind: 'leech', seat: 1, amount: 2 });
        act(game, 1, { type: 'leech', accept: true });
        expect(game.players[1].power).toEqual([0, 3, 2]);
        expect(game.players[1].res.VP).toBe(19);
        expect(game.state.current).toBe(1);
    });

    it('建物の魔力が7以上・4つ以上つながると町になり、町タイルで点と鍵をもらう', () => {
        const game = ready(['witches', 'giants']);
        const a = put(game, 0, 'E5', 'TP');
        const chain = [a];
        while (chain.length < 3) {
            const next = ADJ[chain.at(-1)].find(n => HEXES[n].land && !chain.includes(n));
            chain.push(next);
            put(game, 0, HEXES[next].label, chain.length === 2 ? 'TP' : 'D');
        }
        const last = ADJ[chain.at(-1)].find(n => HEXES[n].land && !chain.includes(n) && !ADJ[n].some(m => game.state.hexes[m].owner === 1));
        game.state.hexes[last].terrain = 'forest';
        turnTo(game, 0);
        game.players[0].res = { C: 10, W: 10, P: 0, VP: 20 };
        // 魔力 2+2+1+1 = 6 では町にならない
        act(game, 0, { type: 'build', hex: last });
        expect(game.state.hexes[a].town).toBe(0);
        turnTo(game, 0);
        act(game, 0, { type: 'upgrade', hex: chain[2], to: 'TP' });
        expect(game.waiting()).toMatchObject({ kind: 'town', seat: 0 });
        const vp = game.players[0].res.VP;
        act(game, 0, { type: 'town', id: 'TW3' });
        expect(game.players[0].keys).toBe(1);
        // 9点＋魔女の5点
        expect(game.players[0].res.VP - vp).toBeGreaterThanOrEqual(14);
        expect(game.state.hexes[a].town).toBeGreaterThan(0);
    });
});

describe('魔力・宗教・司祭', () => {
    it('魔力は1つ目の器から2つ目、2つ目から3つ目へ。燃やすと2つ目が2つ減り3つ目に1つ', () => {
        const game = quickSetup(makeGame(['witches', 'giants']));
        const p = game.players[0];
        p.power = [3, 4, 0];
        expect(game.gainPower(0, 5)).toBe(5);
        expect(p.power).toEqual([0, 5, 2]);
        turnTo(game, 0);
        act(game, 0, { type: 'convert', kind: 'burn', n: 2 });
        expect(p.power).toEqual([0, 1, 4]);
        act(game, 0, { type: 'convert', kind: 'PW>W', n: 1 });
        expect(p.power).toEqual([3, 1, 1]);
    });

    it('宗教の段の3・5・7で魔力。10 は鍵が要り、1つの段に1人だけ', () => {
        const game = quickSetup(makeGame(['witches', 'giants']));
        const p = game.players[0];
        p.cult.fire = 2;
        p.power = [5, 0, 0];
        game.advanceCult(0, 'fire', 6);
        expect(p.cult.fire).toBe(8);
        expect(p.power).toEqual([0, 5, 0]);
        game.advanceCult(0, 'fire', 5);
        expect(p.cult.fire).toBe(9);
        p.keys = 1;
        game.advanceCult(0, 'fire', 1);
        expect(p.cult.fire).toBe(10);
        game.players[1].keys = 1;
        game.players[1].cult.fire = 9;
        expect(game.canAdvanceCult(1, 'fire')).toBe(false);
    });

    it('司祭を送ると、最初の置き場は3つ、ほかは2つ進む。置き場の司祭は戻らない', () => {
        const game = quickSetup(makeGame(['witches', 'giants']));
        turnTo(game, 0);
        const p = game.players[0];
        p.res.P = 2;
        const fire = p.cult.fire;
        act(game, 0, { type: 'priest', track: 'fire', steps: 3 });
        expect(p.cult.fire).toBe(fire + 3);
        expect(game.maxPriests(0)).toBe(6);
        turnTo(game, 1);
        game.players[1].res.P = 1;
        expect(game.applyCommand(1, { type: 'priest', track: 'fire', steps: 3 })).toBe(false);
        act(game, 1, { type: 'priest', track: 'fire', steps: 2 });
    });

    it('魔力アクションはラウンドに1回だけ', () => {
        const game = quickSetup(makeGame(['witches', 'giants']));
        turnTo(game, 0);
        game.players[0].power = [0, 0, 8];
        game.players[1].power = [0, 0, 8];
        act(game, 0, { type: 'power', id: 'ACT4' });
        expect(game.players[0].power).toEqual([4, 0, 4]);
        turnTo(game, 1);
        expect(game.applyCommand(1, { type: 'power', id: 'ACT4' })).toBe(false);
    });
});

describe('パスとラウンド', () => {
    it('パスでボーナスカードを取り替え、最初にパスした人が次のラウンドの先手。残ったカードにはコインが乗る', () => {
        const game = quickSetup(makeGame(['witches', 'giants', 'nomads']));
        const order = [...game.state.order];
        const last = order.at(-1);
        // 最後の人から順にパスさせる
        const pool = () => Object.keys(game.state.bonusPool);
        const passer = (seat) => {
            turnTo(game, seat);
            act(game, seat, { type: 'pass', bonus: pool()[0] });
        };
        passer(last);
        expect(game.players[last].passed).toBe(true);
        order.slice(0, -1).forEach(seat => passer(seat));
        expect(game.state.round).toBe(2);
        expect(game.state.order[0]).toBe(last);
        expect(Object.values(game.state.bonusPool).every(c => c >= 1)).toBe(true);
    });

    it('順位の点は、同点ならその順位の点を合わせて分ける', () => {
        expect(Game.rankPoints([5, 5, 3, 0], [18, 12, 6])).toEqual([15, 15, 6, 0]);
        expect(Game.rankPoints([2, 7, 7, 7], [8, 4, 2])).toEqual([0, 4, 4, 4]);
    });
});

describe('断る操作と記録の再現', () => {
    it('手番でない人・できない操作は断り、状態を変えない', () => {
        const game = quickSetup(makeGame(['witches', 'giants', 'nomads']));
        const before = snapshot(game);
        const seat = game.actors()[0];
        const other = (seat + 1) % 3;
        const bad = [
            [other, { type: 'pass', bonus: Object.keys(game.state.bonusPool)[0] }],
            [seat, { type: 'pass' }],
            [seat, { type: 'build', hex: 0 }],
            [seat, { type: 'build', hex: 9999 }],
            [seat, { type: 'upgrade', hex: 5, to: 'SA' }],
            [seat, { type: 'power', id: 'ACT9' }],
            [seat, { type: 'power', id: 'ACT1', bridge: [0, 1] }],
            [seat, { type: 'special', id: 'ACTW', hex: 3 }],
            [seat, { type: 'favor', id: 'FAV1' }],
            [seat, { type: 'convert', kind: 'PW>P', n: 9 }],
            [seat, { type: 'priest', track: 'fire', steps: 4 }],
            [seat, { type: 'nothing' }],
            [seat, null]
        ];
        bad.forEach(([s, c]) => expect(game.applyCommand(s, c), JSON.stringify(c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を作り直せる', () => {
        const game = quickSetup(makeGame(['witches', 'giants', 'nomads'], 9));
        const seat = game.actors()[0];
        act(game, seat, { type: 'convert', kind: 'W>C', n: 1 });
        act(game, seat, { type: 'pass', bonus: Object.keys(game.state.bonusPool)[0] });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
    });
});
