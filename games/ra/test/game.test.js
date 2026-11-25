import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { TILES, TILE_ORDER, SUN_SETS, RA_TRACK } from '../public/js/data.js';
import { players, newGame, setBag, setSuns, setTiles, setTurn, snapshot } from './helpers.js';

describe('準備', () => {
    it('タイルは180枚（ラー30・神8・金5・ファラオ25・ナイル河25・洪水12・文明25・モニュメント40・災害10）', () => {
        const total = TILE_ORDER.reduce((s, t) => s + TILES[t].count, 0);
        expect(total).toBe(180);
        const group = (g) => TILE_ORDER.filter(t => TILES[t].group === g).reduce((s, t) => s + TILES[t].count, 0);
        expect([TILES.ra.count, group('god'), group('gold'), group('pharaoh'), TILES.nile.count, TILES.flood.count, group('civ'), group('monument'), group('disaster')])
            .toEqual([30, 8, 5, 25, 25, 12, 25, 40, 10]);
        expect([TILES.funeral.count, TILES.drought.count, TILES.unrest.count, TILES.earthquake.count]).toEqual([2, 2, 4, 2]);
    });

    it('人数ごとの太陽駒の組とラーのトラック。各自10点で、一番大きい太陽駒の人から', () => {
        for (const n of [2, 3, 4, 5]) {
            const game = new Game(players(n), { seed: n });
            expect(game.bag).toHaveLength(180);
            expect(game.center).toBe(1);
            expect(game.raLimit).toBe(RA_TRACK[n]);
            const sets = game.players.map(p => p.suns.map(s => s.value).sort((a, b) => b - a));
            expect(sets.map(s => s.join()).sort()).toEqual(SUN_SETS[n].map(s => s.join()).sort());
            game.players.forEach(p => expect(p.score).toBe(10));
            const top = Math.max(...sets.flat());
            expect(game.players[game.current].suns.some(s => s.value === top)).toBe(true);
        }
        expect(RA_TRACK).toEqual({ 2: 6, 3: 8, 4: 9, 5: 10 });
    });
});

describe('手番', () => {
    it('引いたタイルは競りのトラックへ。8枚なら引けない', () => {
        const game = newGame(3);
        setTurn(game, 0);
        setBag(game, ['gold']);
        expect(game.applyCommand(0, { type: 'draw' })).toBe(true);
        expect(game.auctionTrack).toEqual(['gold']);
        expect(game.current).toBe(1);
        game.auctionTrack = Array(8).fill('nile');
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'draw' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('ラーを引くとラーのトラックに置いて競り。ラーの人の左から、ラーの人は最後', () => {
        const game = newGame(3);
        setTurn(game, 1);
        setBag(game, ['ra']);
        game.applyCommand(1, { type: 'draw' });
        expect(game.raTrack).toBe(1);
        expect(game.phase).toBe('auction');
        expect(game.auction.order).toEqual([2, 0, 1]);
        expect(game.actors()).toEqual([2]);
    });

    it('競り：前より大きい太陽駒だけ。勝った人はタイルを取り、出した太陽駒を中央へ、中央の太陽駒を裏向きで受け取る', () => {
        const game = newGame(3);
        setSuns(game, 0, [13, 8, 5, 2]);
        setSuns(game, 1, [12, 9, 6, 3]);
        setSuns(game, 2, [11, 10, 7, 4]);
        game.auctionTrack = ['gold', 'pharaoh', 'astronomy'];
        setTurn(game, 0);
        game.applyCommand(0, { type: 'ra' });
        expect(game.applyCommand(1, { type: 'bid', sun: 6 })).toBe(true);
        expect(game.applyCommand(2, { type: 'bid', sun: 4 })).toBe(false);
        expect(game.applyCommand(2, { type: 'bid', sun: 7 })).toBe(true);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        const p2 = game.players[2];
        expect(p2.tiles).toEqual({ gold: 1, pharaoh: 1, astronomy: 1 });
        expect(p2.suns.filter(s => s.up).map(s => s.value).sort((a, b) => a - b)).toEqual([4, 10, 11]);
        expect(p2.suns.find(s => !s.up).value).toBe(1);
        expect(game.center).toBe(7);
        expect(game.auctionTrack).toEqual([]);
        expect(game.current).toBe(1); // ラーの人（0）の左
    });

    it('自分でラー宣言した競りで全員見送りなら、ラーの人は出さなければならない（8枚のときは見送れて、タイルは捨てる）', () => {
        const game = newGame(3);
        setTurn(game, 0);
        game.auctionTrack = ['gold'];
        game.applyCommand(0, { type: 'ra' });
        game.applyCommand(1, { type: 'pass' });
        game.applyCommand(2, { type: 'pass' });
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
        const g2 = newGame(3, 2);
        setTurn(g2, 0);
        g2.auctionTrack = Array(8).fill('nile');
        g2.applyCommand(0, { type: 'ra' });
        g2.applyCommand(1, { type: 'pass' });
        g2.applyCommand(2, { type: 'pass' });
        expect(g2.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(g2.auctionTrack).toEqual([]);
    });

    it('ラーを引いた競りで全員見送りなら、タイルは残る', () => {
        const game = newGame(3);
        setTurn(game, 0);
        game.auctionTrack = ['gold'];
        setBag(game, ['ra']);
        game.applyCommand(0, { type: 'draw' });
        [1, 2, 0].forEach(s => game.applyCommand(s, { type: 'pass' }));
        expect(game.auctionTrack).toEqual(['gold']);
        expect(game.current).toBe(1);
    });

    it('神1枚につき1枚取る（神は取れない）。使った神は捨てる', () => {
        const game = newGame(3);
        setTurn(game, 0);
        setTiles(game, 0, { god: 2 });
        game.auctionTrack = ['gold', 'god', 'pharaoh', 'nile'];
        expect(game.applyCommand(0, { type: 'god', slots: [1] })).toBe(false);
        expect(game.applyCommand(0, { type: 'god', slots: [0, 2, 3] })).toBe(false);
        expect(game.applyCommand(0, { type: 'god', slots: [0, 3] })).toBe(true);
        expect(game.players[0].tiles).toEqual({ god: 0, gold: 1, nile: 1 });
        expect(game.auctionTrack).toEqual(['god', 'pharaoh']);
        expect(game.current).toBe(1);
    });

    it('表の太陽駒がない人は手番を飛ばし、競りにも加わらない', () => {
        const game = newGame(3);
        setSuns(game, 1, [], [9, 6, 3, 12]);
        setTurn(game, 0);
        setBag(game, ['nile']);
        game.applyCommand(0, { type: 'draw' });
        expect(game.current).toBe(2);
        game.applyCommand(2, { type: 'ra' });
        expect(game.auction.order).toEqual([0, 2]);
    });
});

describe('災害', () => {
    function winWith(tiles, holding) {
        const game = newGame(3);
        setTurn(game, 0);
        setTiles(game, 0, holding);
        game.auctionTrack = tiles;
        game.applyCommand(0, { type: 'ra' });
        game.applyCommand(1, { type: 'pass' });
        game.applyCommand(2, { type: 'pass' });
        game.applyCommand(0, { type: 'bid', sun: game.players[0].suns.find(s => s.up).value });
        return game;
    }

    it('葬式はファラオ2枚、干ばつは洪水を先に（足りなければナイル河）、自動で捨てる', () => {
        const a = winWith(['funeral', 'pharaoh'], { pharaoh: 2 });
        expect(a.players[0].tiles.pharaoh).toBe(1);
        const b = winWith(['drought'], { flood: 1, nile: 3 });
        expect(b.players[0].tiles).toEqual({ flood: 0, nile: 2 });
        const c = winWith(['drought'], {});
        expect(c.phase).toBe('play');
    });

    it('内乱・地震は、選ぶ意味があるときは捨てるタイルを選ぶ', () => {
        const game = winWith(['earthquake'], { pyramid: 3, temple: 1 });
        expect(game.phase).toBe('disaster');
        expect(game.actors()).toEqual([0]);
        expect(game.applyCommand(0, { type: 'discard', tiles: ['pyramid'] })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', tiles: ['temple', 'temple'] })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', tiles: ['temple', 'pyramid'] })).toBe(true);
        expect(game.players[0].tiles).toEqual({ pyramid: 2, temple: 0 });
        expect(game.phase).toBe('play');
        const auto = winWith(['unrest'], { art: 3 });
        expect(auto.players[0].tiles.art).toBe(1);
    });
});

describe('時代と得点', () => {
    it('ラーのトラックが埋まったら、競りなしで両方のトラックを捨てて時代の終わり', () => {
        const game = newGame(3);
        setTurn(game, 0);
        game.raTrack = 7;
        game.auctionTrack = ['gold', 'nile'];
        setBag(game, ['ra']);
        game.applyCommand(0, { type: 'draw' });
        expect(game.epoch).toBe(2);
        expect(game.auctionTrack).toEqual([]);
        expect(game.raTrack).toBe(0);
        expect(game.phase).toBe('play');
    });

    it('全員の太陽駒が裏になったら、時代の終わり。太陽駒は表に戻り、一番大きい太陽駒の人から', () => {
        const game = newGame(2);
        setSuns(game, 0, [9], [6, 5, 2]);
        setSuns(game, 1, [], [8, 7, 4, 3]);
        setTurn(game, 0);
        game.applyCommand(0, { type: 'ra' });
        game.applyCommand(0, { type: 'bid', sun: 9 });
        expect(game.epoch).toBe(2);
        game.players.forEach(p => expect(p.suns.every(s => s.up)).toBe(true));
        expect(game.current).toBe(1); // 席1の8が一番大きい
    });

    it('時代の点：神2・金3・ファラオ最多+5/最少-2・洪水があればナイル河と洪水・文明（0種-5、3種+5）', () => {
        const game = newGame(3);
        setTiles(game, 0, { god: 1, gold: 1, pharaoh: 3, nile: 2, flood: 1, art: 1, writing: 2, religion: 1 });
        setTiles(game, 1, { pharaoh: 1, nile: 4 });
        setTiles(game, 2, { pharaoh: 1, astronomy: 1 });
        game.endEpoch();
        const rows = game.epochScores[0];
        expect(rows[0]).toMatchObject({ god: 2, gold: 3, pharaoh: 5, river: 3, civ: 5 });
        expect(rows[1]).toMatchObject({ pharaoh: -2, river: 0, civ: -5 });
        expect(rows[2]).toMatchObject({ pharaoh: -2, civ: 0 });
        expect(game.players.map(p => p.score)).toEqual([10 + 18, 10 - 7, 10 - 2]);
        // 神・金・洪水・文明は捨て、ファラオ・ナイル河は残る
        expect(game.players[0].tiles).toEqual({ pharaoh: 3, nile: 2 });
    });

    it('全員が同じ数なら、ファラオの点はない。点は0より下がらない', () => {
        const game = newGame(2);
        game.players.forEach(p => { p.score = 3; p.tiles = { pharaoh: 2 }; });
        game.endEpoch();
        expect(game.epochScores[0].map(r => r.pharaoh)).toEqual([0, 0]);
        expect(game.players.map(p => p.score)).toEqual([0, 0]); // 文明0種で-5
    });

    it('最後にモニュメント（種類の数と同じ種類の組）と太陽駒の合計（最多+5・最少-5）', () => {
        const game = newGame(3);
        game.epoch = 3;
        // 例：ピラミッド4・神殿3・要塞2・スフィンクス1 → 4種4点＋4枚10点＋3枚5点＝19点
        setTiles(game, 0, { pyramid: 4, temple: 3, fortress: 2, sphinx: 1, art: 1, astronomy: 1, writing: 1 });
        setTiles(game, 1, { art: 1, astronomy: 1, writing: 1, ...Object.fromEntries(['fortress', 'obelisk', 'palace', 'pyramid', 'temple', 'statue', 'stepPyramid', 'sphinx'].map(t => [t, 1])) });
        setTiles(game, 2, { art: 1, astronomy: 1, writing: 1 });
        setSuns(game, 0, [13, 8, 5, 2]);
        setSuns(game, 1, [12, 9, 6, 3]);
        setSuns(game, 2, [11, 10, 7, 1]);
        game.endEpoch();
        const rows = game.epochScores[0];
        expect(rows[0].monument).toBe(19);
        expect(rows[1].monument).toBe(15);
        expect(rows.map(r => r.sun)).toEqual([-5, 5, 0]); // 合計 28・30・29
        expect(game.isOver()).toBe(true);
    });

    it('同点なら、一番大きい太陽駒を持つ人が上', () => {
        const game = newGame(3);
        game.epoch = 3;
        game.players.forEach(p => { p.score = 20; p.tiles = { pharaoh: 1, art: 1, writing: 1, religion: 1 }; });
        setSuns(game, 0, [13, 8, 5, 2]);
        setSuns(game, 1, [12, 9, 6, 1]);
        setSuns(game, 2, [11, 10, 7, 4]);
        game.endEpoch();
        // 太陽駒の合計 28・28・32 → 席2 +5、席0と席1 -5
        expect(game.players.map(p => p.score)).toEqual([20, 20, 30]);
        expect(game.ranking).toEqual([2, 0, 1]);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・おかしな値は断り、状態を変えない', () => {
        const game = newGame(3);
        setTurn(game, 0);
        const before = snapshot(game);
        [[1, { type: 'draw' }], [0, null], [0, { type: 'fly' }], [0, { type: 'bid', sun: 5 }], [0, { type: 'god', slots: [0] }],
            [0, { type: 'discard', tiles: [] }], [0, { type: 'god', slots: 'x' }]]
            .forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});
