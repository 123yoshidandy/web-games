import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CELLS, REGIONS, TILES, START_CELL, depotSlots, BLACK_SLOTS } from '../public/js/data.js';
import { players, newGame, giveStorage, fill, putInDepot, setDice, cellAt, giveKnowledge, totalTiles, snapshot } from './helpers.js';

// 最初の城のまわり（0から数えた行・列）
const CITY1 = cellAt(2, 2);   // 建物・目3・大きさ1の都市
const KNOW = cellAt(2, 3);    // 知識・目1
const RIVER = cellAt(3, 2);   // 船・目2
const MINE = cellAt(4, 2);    // 鉱山・目4
const CITY5 = cellAt(4, 3);   // 建物・目3・大きさ5の都市

describe('盤とタイル', () => {
    it('公国の盤1番：37マス、色ごとのマス数と地域の大きさ', () => {
        expect(CELLS).toHaveLength(37);
        const count = (kind) => CELLS.filter(c => c.kind === kind).length;
        expect([count('castle'), count('mine'), count('knowledge'), count('building'), count('animal'), count('ship')]).toEqual([4, 3, 6, 12, 6, 6]);
        expect(CELLS[START_CELL]).toMatchObject({ kind: 'castle', die: 6 });
        const sizes = (kind) => REGIONS.filter(r => r.kind === kind).map(r => r.cells.length).sort();
        expect(sizes('building')).toEqual([1, 3, 3, 5]);
        expect(sizes('ship')).toEqual([3, 3]);
        expect(sizes('animal')).toEqual([1, 5]);
        expect(CELLS.map(c => c.die).filter(d => d === 1)).toHaveLength(7);
    });

    it('タイルは164枚（建物56・家畜28・知識26・城16・鉱山12・船26、黒い裏40）', () => {
        expect(TILES).toHaveLength(164);
        const by = (kind) => TILES.filter(t => t.kind === kind);
        expect([by('building'), by('animal'), by('knowledge'), by('castle'), by('mine'), by('ship')].map(l => l.length)).toEqual([56, 28, 26, 16, 12, 26]);
        expect(TILES.filter(t => t.black)).toHaveLength(40);
        expect(TILES.filter(t => t.knowledge && t.black).map(t => t.knowledge)).toEqual([7, 12, 14, 15, 24, 25]);
    });

    it('区域のマス：2人12・3人18・4人24。3人のフェーズ B・D は6番の城が鉱山', () => {
        expect(depotSlots(2, 0).flat()).toHaveLength(12);
        expect(depotSlots(3, 0).flat()).toHaveLength(18);
        expect(depotSlots(4, 0).flat()).toHaveLength(24);
        expect(depotSlots(3, 1)[5][2]).toBe('mine');
        expect(depotSlots(3, 2)[5][2]).toBe('castle');
        expect(depotSlots(4, 1)[5][2]).toBe('castle');
        expect(BLACK_SLOTS).toEqual({ 2: 4, 3: 6, 4: 8 });
    });
});

describe('準備', () => {
    it('城は中央、銀貨1、労働者は手番の順に1〜4、商品3枚、区域と黒の区域にタイル', () => {
        for (const n of [2, 3, 4]) {
            const game = new Game(players(n), { seed: n, start: 1 });
            game.players.forEach(p => {
                expect(TILES[p.estate[START_CELL]].kind).toBe('castle');
                expect(p.estate.filter(t => t !== null)).toHaveLength(1);
                expect(p.silver).toBe(1);
                expect(Object.values(p.goods).reduce((s, v) => s + v, 0)).toBe(3);
            });
            const order = game.turnOrder();
            expect(order[0]).toBe(1);
            expect(order.map(s => game.players[s].workers)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
            expect(game.depots.flat().filter(s => s.tile !== null)).toHaveLength(6 * n);
            expect(game.black).toHaveLength(2 * n);
            expect(game.roundGoods).toHaveLength(4); // 1枚目は白のダイスの区域へ
            expect(game.depotGoods.flat()).toHaveLength(1);
            expect(totalTiles(game)).toBe(164);
            expect(game.actors()).toEqual([1]);
        }
    });
});

describe('行動', () => {
    it('取る：目と同じ区域から保管場所へ。労働者で目を変えられ、6と1はつながる', () => {
        const game = newGame();
        setDice(game, 0, [6, 6]);
        game.players[0].workers = 1;
        const tile = game.depots[0][0].tile;
        expect(game.applyCommand(0, { type: 'take', die: 0, depot: 0, slot: 0 })).toBe(true); // 6 → 1（労働者1）
        expect(game.players[0].storage).toEqual([tile]);
        expect(game.players[0].workers).toBe(0);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'take', die: 1, depot: 1, slot: 0 })).toBe(false); // 6 → 2 は労働者2
        expect(game.applyCommand(0, { type: 'take', die: 0, depot: 5, slot: 0 })).toBe(false); // 使ったダイス
        expect(snapshot(game)).toBe(before);
    });

    it('保管場所がいっぱいなら、捨てるタイルを選んでから取る', () => {
        const game = newGame();
        setDice(game, 0, [1, 1]);
        [0, 1, 2].forEach(() => giveStorage(game, 0, t => t.kind === 'mine'));
        const [a, b, c] = game.players[0].storage;
        expect(game.applyCommand(0, { type: 'take', die: 0, depot: 0, slot: 0 })).toBe(false);
        const tile = game.depots[0][0].tile;
        expect(game.applyCommand(0, { type: 'take', die: 0, depot: 0, slot: 0, discard: 1 })).toBe(true);
        expect(game.players[0].storage).toEqual([a, c, tile]);
        void b;
    });

    it('置く：色と目が合い、置いたタイルのとなり。地域を埋めると大きさの点とフェーズの点', () => {
        const game = newGame();
        setDice(game, 0, [3, 5]);
        const tower = giveStorage(game, 0, t => t.building === 'watchtower');
        expect(game.applyCommand(0, { type: 'place', die: 1, tile: tower, cell: CITY1 })).toBe(false); // 目が違う
        expect(game.applyCommand(0, { type: 'place', die: 0, tile: tower, cell: RIVER })).toBe(false); // 色が違う
        expect(game.applyCommand(0, { type: 'place', die: 0, tile: tower, cell: cellAt(6, 3) })).toBe(false); // となりでない
        expect(game.applyCommand(0, { type: 'place', die: 0, tile: tower, cell: CITY1 })).toBe(true);
        // 大きさ1の地域：1点＋フェーズA 10点、見張り塔 4点
        expect(game.players[0].vp).toBe(1 + 10 + 4);
    });

    it('同じ都市に同じ建物は置けない（知識1があれば置ける）', () => {
        const game = newGame();
        const second = cellAt(4, 4); // 大きさ5の都市・目1
        fill(game, 0, CITY5, t => t.building === 'bank');
        setDice(game, 0, [1, 1]);
        const bank = giveStorage(game, 0, t => t.building === 'bank');
        expect(game.applyCommand(0, { type: 'place', die: 0, tile: bank, cell: second })).toBe(false);
        expect(game.lastError).toContain('同じ都市');
        giveKnowledge(game, 0, 1);
        expect(game.applyCommand(0, { type: 'place', die: 0, tile: bank, cell: second })).toBe(true);
        expect(game.players[0].silver).toBe(1 + 2);
    });

    it('色をすべて埋めると、1番目と2番目にボーナス（2人5点・2点）', () => {
        const game = newGame(2);
        const mines = CELLS.filter(c => c.kind === 'mine').map(c => c.id);
        for (const seat of [0, 1]) {
            fill(game, seat, mines[1]);
            fill(game, seat, mines[2]);
        }
        setDice(game, 0, [4, 4]);
        const m0 = giveStorage(game, 0, t => t.kind === 'mine');
        game.applyCommand(0, { type: 'place', die: 0, tile: m0, cell: MINE });
        // 鉱山の地域（3マス）6点＋フェーズA 10点＋最初のボーナス5点
        expect(game.players[0].vp).toBe(6 + 10 + 5);
        game.players[0].used = [true, true];
        game.applyCommand(0, { type: 'end' });
        setDice(game, 1, [4, 4]);
        const m1 = giveStorage(game, 1, t => t.kind === 'mine');
        game.applyCommand(1, { type: 'place', die: 0, tile: m1, cell: MINE });
        expect(game.players[1].vp).toBe(6 + 10 + 2);
        expect(game.bonusClaims.mine).toEqual([0, 1]);
    });

    it('売る：その目の商品をすべて。1枚につき人数の点（2人2点）と銀貨1枚', () => {
        const game = newGame(2);
        game.players[0].goods = { 3: 2, 5: 1 };
        setDice(game, 0, [3, 3]);
        expect(game.applyCommand(0, { type: 'sell', die: 0, goods: 5 })).toBe(false); // 目が違う（労働者が要る）
        game.players[0].workers = 0;
        expect(game.applyCommand(0, { type: 'sell', die: 0, goods: 3 })).toBe(true);
        expect(game.players[0].vp).toBe(4);
        expect(game.players[0].silver).toBe(2);
        expect(game.players[0].goods).toEqual({ 5: 1 });
        expect(game.players[0].sold).toEqual({ 3: 2 });
    });

    it('売る点は人数で変わる（3人3点・4人4点）。知識3なら銀貨2、知識4なら労働者も', () => {
        for (const [n, per] of [[3, 3], [4, 4]]) {
            const game = newGame(n);
            game.players[0].goods = { 2: 1 };
            setDice(game, 0, [2, 2]);
            giveKnowledge(game, 0, 3);
            giveKnowledge(game, 0, 4);
            const workers = game.players[0].workers;
            game.applyCommand(0, { type: 'sell', die: 0, goods: 2 });
            expect(game.players[0].vp).toBe(per);
            expect(game.players[0].silver).toBe(3);
            expect(game.players[0].workers).toBe(workers + 1);
        }
    });

    it('労働者：目に関係なく2つ（知識14なら4つ、知識13なら銀貨も）', () => {
        const game = newGame();
        setDice(game, 0, [5, 2]);
        const w = game.players[0].workers;
        game.applyCommand(0, { type: 'workers', die: 0 });
        expect(game.players[0].workers).toBe(w + 2);
        giveKnowledge(game, 0, 14);
        giveKnowledge(game, 0, 13);
        game.applyCommand(0, { type: 'workers', die: 1 });
        expect(game.players[0].workers).toBe(w + 6);
        expect(game.players[0].silver).toBe(2);
    });

    it('知識8は労働者1つで±2、知識9〜12はその行動で±1がただ', () => {
        const game = newGame();
        setDice(game, 0, [6, 6]);
        game.players[0].workers = 1;
        giveKnowledge(game, 0, 12);
        expect(game.applyCommand(0, { type: 'take', die: 0, depot: 1, slot: 0 })).toBe(true); // 6 → 2：1はただ、1は労働者
        expect(game.players[0].workers).toBe(0);
        giveKnowledge(game, 0, 8);
        game.players[0].workers = 1;
        expect(game.applyCommand(0, { type: 'take', die: 1, depot: 2, slot: 0 })).toBe(true); // 6 → 3：1はただ、2は労働者1つ
        expect(game.players[0].workers).toBe(0);
    });

    it('買う：手番に1回、銀貨2枚で黒の区域から（知識6なら1〜6の区域からも）', () => {
        const game = newGame();
        game.players[0].silver = 5;
        expect(game.applyCommand(0, { type: 'buy', depot: 0, slot: 0 })).toBe(false);
        const tile = game.black[0];
        expect(game.applyCommand(0, { type: 'buy', depot: -1, slot: 0 })).toBe(true);
        expect(game.players[0].storage).toEqual([tile]);
        expect(game.players[0].silver).toBe(3);
        expect(game.applyCommand(0, { type: 'buy', depot: -1, slot: 1 })).toBe(false);
        const other = newGame(2, 2);
        other.players[0].silver = 2;
        giveKnowledge(other, 0, 6);
        expect(other.applyCommand(0, { type: 'buy', depot: 3, slot: 0 })).toBe(true);
    });

    it('手番はダイスを2つとも使ってから終える。次の人へ、全員のあとで次のラウンド', () => {
        const game = newGame(2);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        game.applyCommand(0, { type: 'workers', die: 0 });
        game.applyCommand(0, { type: 'workers', die: 1 });
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.actors()).toEqual([1]);
        game.applyCommand(1, { type: 'workers', die: 0 });
        game.applyCommand(1, { type: 'workers', die: 1 });
        game.applyCommand(1, { type: 'end' });
        expect(game.round).toBe(1);
        expect(game.depotGoods.flat()).toHaveLength(2);
    });
});

describe('タイルの効果', () => {
    it('城：好きな目で追加の行動（ダイスも労働者も使わない）', () => {
        const game = newGame();
        const castle = cellAt(1, 2); // 城・目6。大きさ1の都市のとなり
        fill(game, 0, CITY1, t => t.building === 'bank');
        setDice(game, 0, [6, 2]);
        const c = giveStorage(game, 0, t => t.kind === 'castle');
        game.applyCommand(0, { type: 'place', die: 0, tile: c, cell: castle });
        expect(game.pending.at(-1)).toEqual({ kind: 'castle' });
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', die: 'bonus', depot: 4, slot: 0 })).toBe(true);
        expect(game.pending).toEqual([]);
        expect(game.players[0].used).toEqual([true, false]);
    });

    it('家畜：頭数の点。同じ牧草地の同じ家畜も数え直す（知識7なら1枚ごとに+1）', () => {
        const game = newGame();
        const pasture = REGIONS.find(r => r.kind === 'animal' && r.cells.length === 5);
        const [a, b] = pasture.cells;
        game.players[0].estate[b] = null;
        // 牧草地のとなりに道をつくる：b のとなりを埋めておく
        const near = CELLS[a].neighbors.find(n => CELLS[n].kind !== 'animal');
        fill(game, 0, near, t => t.kind === CELLS[near].kind && !t.building);
        fill(game, 0, b, t => t.animal === 'cow' && t.count === 3);
        setDice(game, 0, [CELLS[a].die, CELLS[a].die]);
        const cow = giveStorage(game, 0, t => t.animal === 'cow' && t.count === 4);
        expect(game.applyCommand(0, { type: 'place', die: 0, tile: cow, cell: a })).toBe(true);
        expect(game.players[0].vp).toBe(4 + 3);
        const g2 = newGame(2, 3);
        fill(g2, 0, near, t => t.kind === CELLS[near].kind && !t.building);
        fill(g2, 0, b, t => t.animal === 'sheep' && t.count === 4);
        giveKnowledge(g2, 0, 7);
        setDice(g2, 0, [CELLS[a].die, 1]);
        const sheep = giveStorage(g2, 0, t => t.animal === 'sheep' && t.count === 3);
        g2.applyCommand(0, { type: 'place', die: 0, tile: sheep, cell: a });
        expect(g2.players[0].vp).toBe((3 + 1) + (4 + 1));
    });

    it('船：区域の商品をすべて取り（3種類まで）、手番の順が1つ前へ', () => {
        const game = newGame(2);
        game.players[0].goods = { 1: 1, 2: 1 };
        game.depotGoods = [[], [], [3, 3, 4], [], [], []];
        setDice(game, 0, [2, 2]);
        const ship = giveStorage(game, 0, t => t.kind === 'ship');
        game.applyCommand(0, { type: 'place', die: 0, tile: ship, cell: RIVER });
        expect(game.pending.at(-1)).toEqual({ kind: 'ship' });
        expect(game.applyCommand(0, { type: 'ship', depots: [0] })).toBe(false); // 商品がない
        expect(game.applyCommand(0, { type: 'ship', depots: [2] })).toBe(true);
        expect(game.players[0].goods).toEqual({ 1: 1, 2: 1, 3: 2 });
        expect(game.depotGoods[2]).toEqual([4]); // 4種類目は残る
        expect(game.players[0].track).toBe(1);
    });

    it('知識5なら、となり合う2つの区域（6と1もとなり）から取れる', () => {
        const game = newGame(2);
        game.players[0].goods = {};
        game.depotGoods = [[1], [], [], [], [], [6, 6]];
        giveKnowledge(game, 0, 5);
        setDice(game, 0, [2, 2]);
        const ship = giveStorage(game, 0, t => t.kind === 'ship');
        game.applyCommand(0, { type: 'place', die: 0, tile: ship, cell: RIVER });
        expect(game.applyCommand(0, { type: 'ship', depots: [5, 0] })).toBe(true);
        expect(game.players[0].goods).toEqual({ 1: 1, 6: 2 });
    });

    it('手番の順：船で進んだ人が、次のラウンドで先になる（同じ位置なら後から来た人が上）', () => {
        const game = newGame(2);
        expect(game.turnOrder()).toEqual([0, 1]);
        game.players[1].track = 1;
        game.players[1].stamp = 99;
        expect(game.turnOrder()).toEqual([1, 0]);
        game.players[0].track = 1;
        game.players[0].stamp = 100;
        expect(game.turnOrder()).toEqual([0, 1]);
    });

    it('建物：倉庫は売る、市場は区域から船か家畜を取る、下宿は労働者4、市庁舎はもう1枚置く', () => {
        const game = newGame(2);
        game.players[0].goods = { 4: 3 };
        setDice(game, 0, [3, 3]);
        const wh = giveStorage(game, 0, t => t.building === 'warehouse');
        game.applyCommand(0, { type: 'place', die: 0, tile: wh, cell: CITY1 });
        expect(game.pending.at(-1)).toEqual({ kind: 'warehouse' });
        expect(game.applyCommand(0, { type: 'sell', die: 'bonus', goods: 4 })).toBe(true);
        expect(game.players[0].vp).toBe(11 + 6);

        const g2 = newGame(2, 5);
        setDice(g2, 0, [3, 3]);
        const market = giveStorage(g2, 0, t => t.building === 'market');
        putInDepot(g2, 4, 0, t => t.kind === 'ship');
        g2.applyCommand(0, { type: 'place', die: 0, tile: market, cell: CITY1 });
        expect(g2.pending.at(-1)).toEqual({ kind: 'pick', kinds: ['ship', 'animal'] });
        const castleSlot = g2.depots.findIndex(d => d.some(s => s.tile !== null && TILES[s.tile].kind === 'castle'));
        const cs = g2.depots[castleSlot].findIndex(s => s.tile !== null && TILES[s.tile].kind === 'castle');
        expect(g2.applyCommand(0, { type: 'take', die: 'bonus', depot: castleSlot, slot: cs })).toBe(false);
        expect(g2.applyCommand(0, { type: 'take', die: 'bonus', depot: 4, slot: 0 })).toBe(true);

        const g3 = newGame(2, 6);
        setDice(g3, 0, [3, 1]);
        const hall = giveStorage(g3, 0, t => t.building === 'cityHall');
        const know = giveStorage(g3, 0, t => t.knowledge === 20);
        g3.applyCommand(0, { type: 'place', die: 0, tile: hall, cell: CITY1 });
        expect(g3.pending.at(-1)).toEqual({ kind: 'cityHall' });
        expect(g3.applyCommand(0, { type: 'place', die: 'bonus', tile: know, cell: KNOW })).toBe(true); // 目1のマスに、目3のダイスを使わずに
        expect(g3.players[0].used).toEqual([true, false]);

        const g4 = newGame(2, 7);
        setDice(g4, 0, [3, 3]);
        const w = g4.players[0].workers;
        const bh = giveStorage(g4, 0, t => t.building === 'boardingHouse');
        g4.applyCommand(0, { type: 'place', die: 0, tile: bh, cell: CITY1 });
        expect(g4.players[0].workers).toBe(w + 4);
    });

    it('使えない効果は自動で飛ばす（商品のない倉庫など）', () => {
        const game = newGame(2);
        game.players[0].goods = {};
        setDice(game, 0, [3, 3]);
        const wh = giveStorage(game, 0, t => t.building === 'warehouse');
        game.applyCommand(0, { type: 'place', die: 0, tile: wh, cell: CITY1 });
        expect(game.pending).toEqual([]);
    });
});

describe('フェーズと終わり', () => {
    // 全員が労働者を取り続けて進める
    function advanceRounds(game, rounds) {
        for (let i = 0; i < rounds * game.players.length; i++) {
            const seat = game.actors()[0];
            game.applyCommand(seat, { type: 'workers', die: 0 });
            game.applyCommand(seat, { type: 'workers', die: 1 });
            game.applyCommand(seat, { type: 'end' });
        }
    }

    it('フェーズの終わりに鉱山1つにつき銀貨1枚（知識2なら労働者も）。区域は並べ直し、商品は残る', () => {
        const game = newGame(2);
        fill(game, 0, MINE);
        fill(game, 1, MINE);
        giveKnowledge(game, 1, 2);
        const goodsBefore = game.depotGoods.flat().length;
        advanceRounds(game, 5);
        expect(game.phase).toBe(1);
        expect(game.players[0].silver).toBe(2);
        expect(game.players[1].silver).toBe(2);
        expect(game.players[1].workers).toBe(2 + 20 + 1);
        expect(game.depotGoods.flat().length).toBe(goodsBefore + 4 + 1);
        expect(game.depots.flat().every(s => s.tile !== null)).toBe(true);
    });

    it('5フェーズで終わり、商品・銀貨・労働者2つ・知識の点を足す', () => {
        const game = newGame(2);
        [15, 25, 26, 24, 17].forEach(k => giveKnowledge(game, 0, k));
        fill(game, 0, CITY1, t => t.building === 'watchtower');
        fill(game, 0, RIVER);
        advanceRounds(game, 24);
        game.players[0].goods = { 1: 2 };
        game.players[0].sold = { 2: 3, 3: 1 };
        game.players[0].silver = 4;
        game.players[0].bonuses = ['mine'];
        advanceRounds(game, 1);
        expect(game.isOver()).toBe(true);
        const s = game.finalScores[0];
        expect(s.goods).toBe(2);
        expect(s.silver).toBe(4);
        expect(s.workers).toBe(Math.floor(game.players[0].workers / 2));
        expect(s.total).toBe(s.before + s.goods + s.silver + s.workers + s.knowledge);
        // 15：売った2種類×3、25：売った4枚、26：ボーナス1枚×2、24：家畜なし、17：見張り塔1つ×4
        expect(s.knowledge).toBe(6 + 4 + 2 + 0 + 4);
    });

    it('同点なら空いたマスの多い人、それも同じなら手番の順の後ろの人', () => {
        const game = newGame(2);
        game.players.forEach(p => { p.vp = 10; p.workers = 0; p.silver = 0; p.goods = {}; });
        fill(game, 0, MINE);
        game.finish();
        expect(game.ranking).toEqual([1, 0]);
        const g2 = newGame(2);
        g2.players.forEach(p => { p.vp = 10; p.workers = 0; p.silver = 0; p.goods = {}; });
        g2.finish();
        expect(g2.ranking).toEqual([1, 0]); // 手番の順は 0 → 1。後ろの1が上
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・おかしな値は断り、状態を変えない', () => {
        const game = newGame(3);
        const before = snapshot(game);
        [[1, { type: 'workers', die: 0 }], [0, null], [0, { type: 'fly' }], [0, { type: 'take', die: 2, depot: 0, slot: 0 }],
            [0, { type: 'take', die: 0, depot: 9, slot: 0 }], [0, { type: 'place', die: 0, tile: 999, cell: 0 }],
            [0, { type: 'sell', die: 0, goods: 7 }], [0, { type: 'ship', depots: [1] }], [0, { type: 'skip' }],
            [0, { type: 'workers', die: 'bonus' }], [0, { type: 'buy', depot: -1, slot: 99 }]]
            .forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});
