import { describe, it, expect } from 'vitest';
import Game, { HOUSES } from '../public/js/game.js';
import { BOARDS, BOARD_IDS, KING_CARD_IDS } from '../public/js/boards.js';
import { buildTargets, tileTargets, usableTiles } from '../public/js/rules.js';
import { NEIGHBORS } from '../public/js/hex.js';
import { newGame, players, put, run, playSimple, snapshot, cellOf } from './helpers.js';

const sorted = (list) => [...list].sort((a, b) => a - b);

describe('盤面のデータ', () => {
    it('8枚とも 10×10 で、地形の文字だけからなり、場所は1〜2・城は1〜2・場所と城で3マス', () => {
        expect(BOARD_IDS).toHaveLength(8);
        for (const id of BOARD_IDS) {
            const rows = BOARDS[id];
            expect(rows, id).toHaveLength(10);
            rows.forEach(row => expect(row, id).toMatch(/^[GFTCDWMKL]{10}$/));
            const text = rows.join('');
            const loc = [...text].filter(ch => ch === 'L').length;
            const castle = [...text].filter(ch => ch === 'K').length;
            expect(loc + castle, id).toBe(3);
            expect(loc, id).toBeGreaterThanOrEqual(1);
            expect(castle, id).toBeGreaterThanOrEqual(1);
        }
    });

    it('場所のマスは、水・山・場所・城ばかりに囲まれず、隣に家を建てられるマスがある', () => {
        for (const id of BOARD_IDS) {
            const others = BOARD_IDS.filter(x => x !== id).slice(0, 3);
            const game = new Game(players(2), { seed: 1, boards: [id, ...others].map(x => ({ id: x, rot: false })) });
            game.locations.filter(l => l.type === id).forEach(l => {
                expect(NEIGHBORS[l.cell].some(n => 'GFTCD'.includes(game.terrain[n])), `${id} ${l.cell}`).toBe(true);
            });
        }
    });
});

describe('準備', () => {
    it('4枚の違う盤面・3枚の違う王のカード・場所ごとに2枚のタイル・1人40軒と手札1枚', () => {
        for (const n of [2, 3, 4]) {
            for (let seed = 1; seed <= 20; seed++) {
                const game = new Game(players(n), { seed });
                expect(new Set(game.boards.map(b => b.id)).size).toBe(4);
                expect(new Set(game.cards).size).toBe(3);
                game.cards.forEach(c => expect(KING_CARD_IDS).toContain(c));
                const expectedLocs = game.boards.reduce((sum, b) => sum + BOARDS[b.id].join('').split('L').length - 1, 0);
                expect(game.locations).toHaveLength(expectedLocs);
                game.locations.forEach(l => expect(l.tiles).toBe(2));
                game.players.forEach(p => {
                    expect(p.supply).toBe(HOUSES);
                    expect('GFTCD').toContain(p.card);
                });
                expect(game.deck.length).toBe(25 - n);
                expect(game.active).toBe(game.start);
            }
        }
    });

    it('同じシードなら同じ盤面・カード・山になり、回した盤面も混ざる', () => {
        const a = new Game(players(3), { seed: 42 });
        const b = new Game(players(3), { seed: 42 });
        expect(snapshot(a)).toBe(snapshot(b));
        const rotated = Array.from({ length: 30 }, (_, i) => new Game(players(2), { seed: i }).boards.filter(x => x.rot).length);
        expect(Math.max(...rotated)).toBeGreaterThan(0);
        expect(Math.min(...rotated)).toBeLessThan(4);
    });

    it('180度回した盤面は、行と列を逆から読んだ地形になる', () => {
        const game = new Game(players(2), { seed: 1, boards: [{ id: 'oracle', rot: true }, { id: 'farm' }, { id: 'harbor' }, { id: 'tower' }] });
        expect(game.terrain[cellOf(0, 0)]).toBe(BOARDS.oracle[9][9]);
        expect(game.terrain[cellOf(9, 9)]).toBe(BOARDS.oracle[0][0]);
        expect(game.terrain[cellOf(3, 2)]).toBe(BOARDS.oracle[6][7]);
    });
});

describe('建てる決まり', () => {
    it('自分の家に隣接するマスがあれば、そこにしか建てられない', () => {
        const game = newGame(2, { card: 'G' });
        put(game, 0, [cellOf(0, 0)]);
        expect(sorted(buildTargets(game, 0))).toEqual([cellOf(0, 1), cellOf(1, 0)]);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'build', cell: cellOf(0, 2) })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('隣接するマスがなければ、手札の地形のどこにでも建てられる。ほかの人の家・水・山・城・場所には建てられない', () => {
        const game = newGame(2, { card: 'D' });
        put(game, 0, [cellOf(0, 0)]);
        put(game, 1, [cellOf(5, 8)]);
        const all = [...game.terrain].map((t, i) => (t === 'D' && game.owner[i] === -1 ? i : -1)).filter(i => i >= 0);
        expect(sorted(buildTargets(game, 0))).toEqual(all);
        expect(buildTargets(game, 0)).not.toContain(cellOf(5, 8));
        for (const cell of [cellOf(0, 5), cellOf(5, 0), cellOf(1, 3), cellOf(3, 7)]) {
            expect(game.applyCommand(0, { type: 'build', cell })).toBe(false);
        }
    });

    it('必須の3軒を建てるまで番を終えられず、4軒目は建てられない', () => {
        const game = newGame(2, { card: 'G' });
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        run(game, [[0, { type: 'build', cell: cellOf(0, 0) }], [0, { type: 'build', cell: cellOf(0, 1) }]]);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        run(game, [[0, { type: 'build', cell: cellOf(0, 2) }]]);
        expect(game.mandatoryDone).toBe(true);
        expect(game.applyCommand(0, { type: 'build', cell: cellOf(1, 0) })).toBe(false);
        expect(game.players[0].supply).toBe(HOUSES - 3);
        const deck = game.deck.length;
        run(game, [[0, { type: 'end' }]]);
        expect(game.discard).toEqual(['G']);
        expect(game.deck.length).toBe(deck - 1);
        expect(game.active).toBe(1);
        expect(game.applyCommand(0, { type: 'build', cell: cellOf(1, 0) })).toBe(false);
    });

    it('手札の地形に建てられるマスがなくなったら、そのカードを取り除いて引き直す', () => {
        const game = newGame(2, { card: 'C' });
        [...game.terrain].forEach((t, i) => { if (t === 'C') game.owner[i] = 1; });
        game.deck = ['C', 'F', 'G'];
        game.checkCard();
        expect(game.players[0].card).toBe('F');
        expect(game.removed).toEqual(['C', 'C']);
        expect(buildTargets(game, 0).length).toBeGreaterThan(0);
    });

    it('山がなくなったら捨て札を混ぜて引く', () => {
        const game = newGame(2, { card: 'G' });
        game.deck = [];
        game.discard = ['F', 'T'];
        playSimple(game);
        expect(game.players[0].card).not.toBe(null);
        expect(game.deck.length + game.discard.length).toBe(2);
    });
});

describe('場所タイル', () => {
    it('場所に隣接して建てるとタイルを取る。1つの場所からは1枚だけ。取った番には使えず、次の番から1回ずつ使える', () => {
        const game = newGame(2, { card: 'G' });
        const oracle = cellOf(3, 7);
        run(game, [[0, { type: 'build', cell: cellOf(2, 7) }]]);
        expect(game.players[0].tiles).toEqual([{ type: 'oracle', loc: oracle, fresh: true, used: false }]);
        expect(game.locations.find(l => l.cell === oracle).tiles).toBe(1);
        run(game, [[0, { type: 'build', cell: cellOf(2, 8) }], [0, { type: 'build', cell: cellOf(1, 6) }]]);
        expect(game.players[0].tiles).toHaveLength(1);
        expect(usableTiles(game, 0)).toEqual([]);
        expect(game.applyCommand(0, { type: 'tile', tile: 'oracle', cell: buildTargets(game, 0)[0] })).toBe(false);
        run(game, [[0, { type: 'end' }]]);
        playSimple(game);
        expect(game.active).toBe(0);
        expect(usableTiles(game, 0)).toEqual(['oracle']);
        // 必須の途中では使えない
        run(game, [[0, { type: 'build', cell: buildTargets(game, 0)[0] }]]);
        expect(usableTiles(game, 0)).toEqual([]);
        while (!game.mandatoryDone) run(game, [[0, { type: 'build', cell: buildTargets(game, 0)[0] }]]);
        const cell = tileTargets(game, 0, 'oracle')[0];
        run(game, [[0, { type: 'tile', tile: 'oracle', cell }]]);
        expect(game.applyCommand(0, { type: 'tile', tile: 'oracle', cell: tileTargets(game, 0, 'oracle')[0] })).toBe(false);
        expect(game.players[0].supply).toBe(HOUSES - 7);
    });

    it('必須の行動の前にも使える', () => {
        const game = newGame(2, { card: 'G' });
        put(game, 0, [cellOf(0, 0)]);
        game.players[0].tiles.push({ type: 'farm', loc: cellOf(1, 17), fresh: false, used: false });
        game.owner[cellOf(1, 18)] = 0;
        run(game, [[0, { type: 'tile', tile: 'farm', cell: cellOf(0, 1) }]]);
        expect(game.built).toBe(0);
        expect(game.mandatoryDone).toBe(false);
    });

    const withTile = (type, houses, card = 'G') => {
        const game = newGame(2, { card });
        put(game, 0, houses);
        // タイルの出どころは神託所の場所（隣に家がないので、動かすと失う）
        game.players[0].tiles.push({ type, loc: cellOf(3, 7), fresh: false, used: false });
        return game;
    };

    it('農場は草原に、オアシスは砂漠に。どちらも隣接できれば隣接', () => {
        const game = withTile('farm', [cellOf(0, 0)], 'D');
        expect(sorted(tileTargets(game, 0, 'farm'))).toEqual([cellOf(0, 1), cellOf(1, 0)]);
        const allDesert = [...game.terrain].map((t, i) => (t === 'D' && game.owner[i] === -1 ? i : -1)).filter(i => i >= 0);
        expect(sorted(tileTargets(game, 0, 'oasis'))).toEqual(allDesert);
    });

    it('神託所は手札の地形に。塔は盤の端に、隣接できれば隣接', () => {
        const game = withTile('oracle', [cellOf(0, 0)], 'G');
        expect(sorted(tileTargets(game, 0, 'oracle'))).toEqual([cellOf(0, 1), cellOf(1, 0)]);
        expect(sorted(tileTargets(game, 0, 'tower'))).toEqual([cellOf(0, 1), cellOf(1, 0)]);
        game.owner[cellOf(0, 0)] = -1;
        game.owner[cellOf(10, 10)] = 0;
        const edge = tileTargets(game, 0, 'tower');
        expect(edge.length).toBeGreaterThan(40);
        edge.forEach(cell => {
            const r = Math.floor(cell / 20);
            const c = cell % 20;
            expect(r === 0 || r === 19 || c === 0 || c === 19).toBe(true);
            expect('GFTCD').toContain(game.terrain[cell]);
        });
    });

    it('酒場は、自分の家が3軒並んだ列の端に建てる', () => {
        const game = withTile('tavern', [cellOf(0, 0), cellOf(0, 1), cellOf(0, 2)]);
        expect(tileTargets(game, 0, 'tavern')).toEqual([cellOf(0, 3)]);
        const two = withTile('tavern', [cellOf(0, 0), cellOf(0, 1)]);
        expect(tileTargets(two, 0, 'tavern')).toEqual([]);
        expect(usableTiles(two, 0)).toEqual([]);
        // 斜めの列（右下へ）：(0,0) → (1,0) → (2,1) → 端は (3,1)
        const diag = withTile('tavern', [cellOf(0, 0), cellOf(1, 0), cellOf(2, 1)]);
        expect(tileTargets(diag, 0, 'tavern')).toEqual([cellOf(3, 1)]);
    });

    it('納屋は、動かす家を除いてから、手札の地形の隣接を判定する', () => {
        const game = withTile('barn', [cellOf(0, 0), cellOf(1, 1)], 'F');
        // (1,1) を動かすと、残る (0,0) の隣に花畑はないので、どの花畑にも行ける
        const far = tileTargets(game, 0, 'barn', cellOf(1, 1));
        expect(far).toContain(cellOf(3, 0));
        expect(far.length).toBeGreaterThan(10);
        // (0,0) を動かすと、残る (1,1) の隣の花畑だけ
        expect(sorted(tileTargets(game, 0, 'barn', cellOf(0, 0)))).toEqual([cellOf(2, 1), cellOf(2, 2)]);
        run(game, [[0, { type: 'tile', tile: 'barn', from: cellOf(0, 0), cell: cellOf(2, 1) }]]);
        expect(game.owner[cellOf(0, 0)]).toBe(-1);
        expect(game.owner[cellOf(2, 1)]).toBe(0);
        expect(game.players[0].supply).toBe(HOUSES - 2);
    });

    it('港は水へ動かす。隣接できれば隣接。水に建てられるのは港だけ', () => {
        const game = withTile('harbor', [cellOf(0, 4), cellOf(1, 4)]);
        expect(sorted(tileTargets(game, 0, 'harbor', cellOf(0, 4)))).toEqual([cellOf(0, 5), cellOf(1, 5)]);
        run(game, [[0, { type: 'tile', tile: 'harbor', from: cellOf(0, 4), cell: cellOf(0, 5) }]]);
        expect(game.owner[cellOf(0, 5)]).toBe(0);
        for (const card of ['G', 'F', 'T', 'C', 'D']) {
            game.players[0].card = card;
            buildTargets(game, 0).forEach(cell => expect(game.terrain[cell]).toBe(card));
        }
    });

    it('馬小屋は、まっすぐ2マス先の空いた建てられるマスへ跳ぶ（隣接しなくてよい）', () => {
        const game = withTile('paddock', [cellOf(0, 0)]);
        expect(sorted(tileTargets(game, 0, 'paddock', cellOf(0, 0)))).toEqual([cellOf(0, 2), cellOf(2, 1)]);
        game.owner[cellOf(0, 2)] = 1;
        expect(tileTargets(game, 0, 'paddock', cellOf(0, 0))).toEqual([cellOf(2, 1)]);
        expect(game.applyCommand(0, { type: 'tile', tile: 'paddock', from: cellOf(0, 0), cell: cellOf(0, 1) })).toBe(false);
        expect(game.applyCommand(0, { type: 'tile', tile: 'paddock', cell: cellOf(2, 1) })).toBe(false);
    });

    it('動かして場所の隣に自分の家がなくなったら、そのタイルを失う（場所には戻らない）。動かした先の場所のタイルは取る', () => {
        const game = newGame(2, { card: 'G' });
        const oracle = cellOf(3, 7);
        run(game, [[0, { type: 'build', cell: cellOf(2, 7) }], [0, { type: 'build', cell: cellOf(2, 8) }], [0, { type: 'build', cell: cellOf(1, 6) }]]);
        expect(game.players[0].tiles.map(t => t.type)).toEqual(['oracle']);
        game.players[0].tiles.push({ type: 'paddock', loc: oracle, fresh: false, used: false });
        // (2,8) を動かしても (2,7) が残るので、まだ失わない
        run(game, [[0, { type: 'tile', tile: 'paddock', from: cellOf(2, 8), cell: cellOf(0, 9) }]]);
        expect(game.players[0].tiles).toHaveLength(2);
        game.players[0].tiles.forEach(t => { t.used = false; });
        run(game, [[0, { type: 'tile', tile: 'paddock', from: cellOf(2, 7), cell: cellOf(2, 5) }]]);
        expect(game.players[0].tiles).toEqual([]);
        expect(game.locations.find(l => l.cell === oracle).tiles).toBe(1);
        expect(game.players[0].lost).toEqual([oracle]);
        // 一度失った場所からは、また隣接しても取れない
        game.players[0].tiles.push({ type: 'paddock', loc: cellOf(19, 0), fresh: false, used: false });
        game.owner[cellOf(18, 0)] = 0;
        run(game, [[0, { type: 'tile', tile: 'paddock', from: cellOf(2, 5), cell: cellOf(2, 7) }]]);
        expect(game.players[0].tiles.map(t => t.type)).toEqual(['paddock']);
        expect(game.locations.find(l => l.cell === oracle).tiles).toBe(1);
    });

    it('同じ盤面の2つの場所の隣に建てれば、同じ種類のタイルを2枚持ち、1番に2回使える', () => {
        const game = newGame(2, { card: 'G' });
        game.players[0].tiles.push({ type: 'farm', loc: cellOf(1, 17), fresh: false, used: false }, { type: 'farm', loc: cellOf(5, 12), fresh: false, used: false });
        put(game, 0, [cellOf(1, 18), cellOf(5, 11)]);
        run(game, [[0, { type: 'tile', tile: 'farm', cell: tileTargets(game, 0, 'farm')[0] }]]);
        expect(usableTiles(game, 0)).toEqual(['farm']);
        run(game, [[0, { type: 'tile', tile: 'farm', cell: tileTargets(game, 0, 'farm')[0] }]]);
        expect(usableTiles(game, 0)).toEqual([]);
    });
});

describe('終わり', () => {
    it('最後の家を建てたら、その巡の最後（最初の人の右隣）まで続けて終わる', () => {
        const game = newGame(3, { card: 'G' });
        game.active = 1;
        game.players[1].card = 'G';
        game.players[1].supply = 2;
        run(game, [[1, { type: 'build', cell: buildTargets(game, 1)[0] }]]);
        run(game, [[1, { type: 'build', cell: buildTargets(game, 1)[0] }]]);
        expect(game.players[1].supply).toBe(0);
        expect(game.mandatoryDone).toBe(true);
        expect(game.finalRound).toBe(true);
        run(game, [[1, { type: 'end' }]]);
        expect(game.isOver()).toBe(false);
        expect(game.active).toBe(2);
        playSimple(game);
        expect(game.isOver()).toBe(true);
        expect(game.scores).toHaveLength(3);
        expect(game.winners.length).toBeGreaterThan(0);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
    });

    it('同点なら勝ちを分け合う', () => {
        const game = newGame(3, { card: 'G' });
        put(game, 0, [cellOf(0, 0), cellOf(0, 1)]);
        put(game, 1, [cellOf(0, 18), cellOf(0, 19)]);
        game.finish();
        expect(game.scores[0].total).toBe(game.scores[1].total);
        expect(game.scores[2].total).toBeLessThan(game.scores[0].total);
        expect(game.winners).toEqual([0, 1]);
    });
});

describe('断る操作', () => {
    it('手番でない人・知らない操作・おかしな値は断り、状態を変えない', () => {
        const game = newGame(2, { card: 'G' });
        const before = snapshot(game);
        const bad = [
            [1, { type: 'build', cell: cellOf(0, 0) }], [0, null], [0, { type: 'fly' }], [0, { type: 'build', cell: -1 }],
            [0, { type: 'build', cell: 400 }], [0, { type: 'build', cell: '0' }], [0, { type: 'tile', tile: 'oracle', cell: 0 }],
            [0, { type: 'tile', tile: 'nope', cell: 0 }], [0, { type: 'end' }], [5, { type: 'end' }]
        ];
        bad.forEach(([seat, command]) => expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});
