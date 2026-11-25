import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { PATTERNS, TOOLS } from '../public/js/data.js';
import { newGame, startPlay, setPool, die, windowOf, act, snapshot, totalDice } from './helpers.js';

// 全部のマスが制約なしのテスト用の窓（このテストファイルの中だけで足す）
const BLANK_ID = PATTERNS.length;
PATTERNS.push({ id: BLANK_ID, name: 'テスト用', difficulty: 4, card: 99, cells: Array(20).fill(null) });
const useBlank = (game) => { game.players.forEach(p => { p.pattern = BLANK_ID; }); return game; };
const withTools = (game, ids) => { game.tools = ids.map(id => ({ id, tokens: 0, used: false })); return game; };

describe('準備', () => {
    it('窓枠カード2枚（表裏で4つの窓）・個人の目標・道具3・公共の目標3を配る', () => {
        const game = newGame(4, 3);
        const all = game.players.flatMap(p => p.offers);
        expect(new Set(all).size).toBe(16);
        game.players.forEach(p => {
            expect(p.offers).toHaveLength(4);
            expect(new Set(p.offers.map(id => PATTERNS[id].card)).size).toBe(2);
            expect(p.privates).toHaveLength(1);
        });
        expect(new Set(game.players.map(p => p.privates[0])).size).toBe(4);
        expect(game.tools).toHaveLength(3);
        expect(game.objectives).toHaveLength(3);
    });

    it('全員が窓を選ぶと、難しさの数の好意トークンを持って1ラウンド目（人数×2＋1個）', () => {
        for (const n of [2, 3, 4]) {
            const game = startPlay(n);
            game.players.forEach(p => expect(p.tokens).toBe(PATTERNS[p.pattern].difficulty));
            expect(game.round).toBe(1);
            expect(game.pool).toHaveLength(n * 2 + 1);
            expect(totalDice(game)).toBe(90);
        }
    });

    it('選んだ窓と個人の目標は、本人にだけ見える', () => {
        const game = newGame(3, 5);
        act(game, 0, { type: 'choose', pattern: game.players[0].offers[2] });
        expect(createGameView(game, 0).players[0].pattern).toBe(game.players[0].offers[2]);
        expect(createGameView(game, 1).players[0].pattern).toBe(null);
        expect(createGameView(game, 1).players[0].privates).toBe(null);
        expect(createGameView(game, 1).players[0].offers).toBe(null);
        expect(createGameView(game, 1).players[1].privates).toEqual(game.players[1].privates);
    });

    it('1人用：道具は指定の枚数、公共の目標2、個人の目標2、好意トークンなし、毎ラウンド4個', () => {
        const game = startPlay(1, [], 2, { soloTools: 5 });
        expect(game.tools).toHaveLength(5);
        expect(game.objectives).toHaveLength(2);
        expect(game.players[0].privates).toHaveLength(2);
        expect(game.players[0].tokens).toBe(0);
        expect(game.pool).toHaveLength(4);
    });
});

describe('手番', () => {
    it('往復の順（スタートの人から最後まで、最後の人から戻る）。スタートの人はラウンドごとに次へ', () => {
        const game = startPlay(3, [], 4);
        const start = game.firstStart;
        expect(game.order).toEqual([0, 1, 2, 2, 1, 0].map(k => (start + (k === 0 ? 0 : k)) % 3).map((_, i) => game.order[i]));
        expect(game.order.slice(0, 3)).toEqual([start, (start + 1) % 3, (start + 2) % 3]);
        expect(game.order.slice(3)).toEqual([...game.order.slice(0, 3)].reverse());
        // 全員が番を終えると次のラウンド
        for (let k = 0; k < 6; k++) act(game, game.turn.seat, { type: 'end' });
        expect(game.round).toBe(2);
        expect(game.order[0]).toBe((start + 1) % 3);
        // 残ったダイスはラウンドトラックへ
        expect(game.roundTrack[0]).toHaveLength(7);
    });

    it('選んで置く。同じ手番で2個は選べない。番を終える', () => {
        const game = useBlank(startPlay(2, [], 6));
        const seat = game.turn.seat;
        const [a, b] = setPool(game, [die('red', 3), die('blue', 4), die('green', 5)]);
        act(game, seat, { type: 'draft', die: a.id, cell: 0 });
        expect(game.players[seat].window[0]).toMatchObject({ color: 'red', value: 3 });
        const before = snapshot(game);
        expect(game.applyCommand(seat, { type: 'draft', die: b.id, cell: 1 })).toBe(false);
        expect(snapshot(game)).toBe(before);
        act(game, seat, { type: 'end' });
        expect(game.turn.seat).not.toBe(seat);
    });

    it('置けないダイスと場所は断り、状態を変えない', () => {
        const game = useBlank(startPlay(2, [], 6));
        const seat = game.turn.seat;
        const [a] = setPool(game, [die('red', 3), die('blue', 4)]);
        const before = snapshot(game);
        [{ die: a.id, cell: 7 }, { die: 999, cell: 0 }, { die: a.id, cell: 20 }, { die: a.id, cell: '0' }].forEach(c => expect(game.applyCommand(seat, { type: 'draft', ...c })).toBe(false));
        expect(game.applyCommand((seat + 1) % 2, { type: 'draft', die: a.id, cell: 0 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('置けず道具も使えない人の番は、自動で飛ばす', () => {
        const game = useBlank(startPlay(2, [], 7));
        game.players.forEach(p => { p.tokens = 0; });
        const seat = game.turn.seat;
        const other = (seat + 1) % 2;
        // 相手の窓を、置けるマスが残らない形にする
        game.players[other].window = windowOf(`
            R1 Y2 G3 B4 P5
            Y3 G4 B5 P6 R1
            G5 B6 P1 R2 Y3
            B2 P3 R4 Y5 ..`);
        // 19 の縦横は 14（黄3）と 18（黄5）。黄・3・5 のダイスは置けない
        setPool(game, [die('yellow', 1), die('blue', 3), die('red', 5)]);
        act(game, seat, { type: 'end' });
        expect(game.turn.seat).toBe(seat);
    });
});

describe('道具', () => {
    const setup = (tool, seed = 8) => {
        const game = withTools(useBlank(startPlay(2, [], seed)), [tool]);
        const seat = game.turn.seat;
        return { game, seat, p: game.players[seat] };
    };

    it('好意トークン：最初は1つ、使われていれば2つ。足りなければ使えない', () => {
        const { game, seat, p } = setup('grinding');
        const [a] = setPool(game, [die('red', 2), die('blue', 3)]);
        p.tokens = 3;
        act(game, seat, { type: 'tool', tool: 'grinding', die: a.id, cell: 0 });
        expect(p.tokens).toBe(2);
        expect(game.tools[0].tokens).toBe(1);
        expect(p.window[0]).toMatchObject({ color: 'red', value: 5 });
        expect(game.toolCost(game.tools[0])).toBe(2);
        // 選んで道具も使ったので、番は自動で進む
        expect(game.turn.seat).not.toBe(seat);
        const q = game.players[game.turn.seat];
        q.tokens = 1;
        const [b] = setPool(game, [die('green', 2)]);
        expect(game.applyCommand(game.turn.seat, { type: 'tool', tool: 'grinding', die: b.id, cell: 19 })).toBe(false);
    });

    it('やっとこ：目を1つ増減（1を6、6を1にはできない）', () => {
        const { game, seat, p } = setup('grozing');
        const [a, b] = setPool(game, [die('red', 1), die('blue', 6)]);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'grozing', die: a.id, delta: -1, cell: 0 })).toBe(false);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'grozing', die: b.id, delta: 1, cell: 0 })).toBe(false);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'grozing', die: a.id, delta: 2, cell: 0 })).toBe(false);
        act(game, seat, { type: 'tool', tool: 'grozing', die: a.id, delta: 1, cell: 0 });
        expect(p.window[0].value).toBe(2);
    });

    it('ガラス絵の筆・銅箔のへら：色か目の制約を無視して動かす', () => {
        const { game, seat, p } = setup('eglomise');
        const pattern = PATTERNS.find(x => x.name === 'Kaleidoscopic Dream');
        p.pattern = pattern.id;
        p.window[3] = die('red', 6);
        p.window[13] = die('green', 4);
        // 0 は黄のマス
        expect(game.applyCommand(seat, { type: 'tool', tool: 'eglomise', from: 3, to: 0 })).toBe(false); // 接していない
        p.window[1] = die('purple', 2);
        // 1 は青のマスだが、紫のダイスを置いてある（テスト用）。3 の赤を 0（黄）へ：0 は 1 と接する
        act(game, seat, { type: 'tool', tool: 'eglomise', from: 3, to: 0 });
        expect(p.window[0]).toMatchObject({ color: 'red' });
        expect(p.window[3]).toBe(null);
    });

    it('銅箔のへら：目の制約を無視する', () => {
        const { game, seat, p } = setup('copper');
        p.pattern = PATTERNS.find(x => x.name === 'Kaleidoscopic Dream').id;
        p.window[2] = die('red', 6);
        p.window[3] = die('green', 3);
        // 4 は「1」のマス
        act(game, seat, { type: 'tool', tool: 'copper', from: 2, to: 4 });
        expect(p.window[4]).toMatchObject({ value: 6 });
    });

    it('鉛線のへら：ちょうど2個を決まりを守って動かす（同じダイスを2回は動かさない）', () => {
        const { game, seat, p } = setup('lathekin');
        p.window[0] = die('red', 1);
        p.window[1] = die('blue', 2);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'lathekin', moves: [[1, 6]] })).toBe(false);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'lathekin', moves: [[1, 6], [6, 7]] })).toBe(false);
        act(game, seat, { type: 'tool', tool: 'lathekin', moves: [[1, 5], [0, 6]] });
        expect(p.window[5]).toMatchObject({ color: 'blue' });
        expect(p.window[6]).toMatchObject({ color: 'red' });
    });

    it('レンズカッター：プールのダイスとラウンドトラックのダイスを入れ替えて置く', () => {
        const { game, seat, p } = setup('lens');
        game.roundTrack = [[die('purple', 6)]];
        const [a] = setPool(game, [die('red', 2)]);
        act(game, seat, { type: 'tool', tool: 'lens', die: a.id, track: [0, 0], cell: 0 });
        expect(p.window[0]).toMatchObject({ color: 'purple', value: 6 });
        expect(game.roundTrack[0][0]).toMatchObject({ color: 'red', value: 2 });
    });

    it('フラックスの刷毛：振り直して置く（置けるなら必ず置く）', () => {
        const { game, seat, p } = setup('fluxBrush');
        const [a] = setPool(game, [die('red', 2)]);
        act(game, seat, { type: 'tool', tool: 'fluxBrush', die: a.id });
        expect(game.pending).toMatchObject({ kind: 'place', die: a.id, mustPlace: true });
        expect(game.applyCommand(seat, { type: 'place', cell: null })).toBe(false);
        act(game, seat, { type: 'place', cell: 0 });
        expect(p.window[0].id).toBe(a.id);
    });

    it('艶出しの槌：2回目の手番で、選ぶ前だけ。プールを全部振り直す', () => {
        const { game, seat } = setup('glazing');
        setPool(game, [die('red', 2), die('blue', 2), die('green', 2), die('yellow', 2), die('purple', 2)]);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'glazing' })).toBe(false);
        act(game, seat, { type: 'end' });
        act(game, game.turn.seat, { type: 'end' });
        // 2周目（相手から逆順）
        const s2 = game.turn.seat;
        expect(game.turn.second).toBe(true);
        game.players[s2].tokens = 5;
        act(game, s2, { type: 'tool', tool: 'glazing' });
        expect(game.pool.map(d => d.value)).not.toEqual([2, 2, 2, 2, 2]);
    });

    it('続けざまのやっとこ：1回目の手番で選んだあと、もう1個。2回目の手番はない', () => {
        const { game, seat, p } = setup('running');
        const [a, b] = setPool(game, [die('red', 2), die('blue', 3), die('green', 4), die('yellow', 5), die('purple', 6)]);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'running', die: a.id, cell: 0 })).toBe(false);
        act(game, seat, { type: 'draft', die: a.id, cell: 0 });
        act(game, seat, { type: 'tool', tool: 'running', die: b.id, cell: 1 });
        expect(p.window[1]).toMatchObject({ color: 'blue' });
        // 選んで道具も使ったので、番は自動で進む
        act(game, game.turn.seat, { type: 'end' }); // 相手の1回目
        act(game, game.turn.seat, { type: 'end' }); // 相手の2回目
        // 自分の2回目は飛ばされ、次のラウンドへ
        expect(game.round).toBe(2);
    });

    it('コルクの定規：ほかのダイスと接しないマスに置く', () => {
        const { game, seat, p } = setup('cork');
        p.window[0] = die('red', 1);
        const [a] = setPool(game, [die('blue', 2)]);
        expect(game.applyCommand(seat, { type: 'tool', tool: 'cork', die: a.id, cell: 1 })).toBe(false);
        act(game, seat, { type: 'tool', tool: 'cork', die: a.id, cell: 13 });
        expect(p.window[13]).toMatchObject({ color: 'blue' });
    });

    it('フラックス落とし：袋に戻して1個を引き、目を選んで置く（置かずにプールへ戻してもよい）', () => {
        const { game, seat, p } = setup('fluxRemover');
        const [a] = setPool(game, [die('red', 2)]);
        const bag = { ...game.bag };
        act(game, seat, { type: 'tool', tool: 'fluxRemover', die: a.id });
        expect(game.pending.kind).toBe('fluxValue');
        expect(game.pool.some(d => d.id === a.id)).toBe(false);
        expect(game.applyCommand(seat, { type: 'fluxValue', value: 7 })).toBe(false);
        act(game, seat, { type: 'fluxValue', value: 4 });
        expect(game.pending).toMatchObject({ kind: 'place', mustPlace: false });
        const drawn = game.pool.find(d => d.id === game.pending.die);
        expect(drawn.value).toBe(4);
        expect(Object.values(game.bag).reduce((s, x) => s + x, 0)).toBe(Object.values(bag).reduce((s, x) => s + x, 0));
        act(game, seat, { type: 'place', cell: null });
        expect(p.window.every(d => !d)).toBe(true);
    });

    it('タップホイール：ラウンドトラックにある色の、同じ色のダイスを2個まで動かす', () => {
        const { game, seat, p } = setup('tapWheel');
        p.window[0] = die('red', 1);
        p.window[7] = die('red', 2);
        p.window[1] = die('blue', 3);
        game.roundTrack = [[die('blue', 5)]];
        expect(game.applyCommand(seat, { type: 'tool', tool: 'tapWheel', moves: [[0, 5]] })).toBe(false); // 赤はトラックにない
        game.roundTrack = [[die('red', 5)]];
        expect(game.applyCommand(seat, { type: 'tool', tool: 'tapWheel', moves: [[0, 5], [1, 2]] })).toBe(false); // 色が違う
        act(game, seat, { type: 'tool', tool: 'tapWheel', moves: [[0, 5], [7, 11]] });
        expect(p.window[5]).toMatchObject({ color: 'red', value: 1 });
        expect(p.window[11]).toMatchObject({ color: 'red', value: 2 });
    });

    it('1人用：同じ色のダイスで払い、道具は1回だけ。払ったダイスはなくなる', () => {
        const game = withTools(useBlank(startPlay(1, [], 3, { soloTools: 1 })), ['grinding']);
        const p = game.players[0];
        const [a, g, r] = setPool(game, [die('red', 2), die('green', 5), die('red', 6)]);
        expect(TOOLS.grinding.color).toBe('green');
        expect(game.applyCommand(0, { type: 'tool', tool: 'grinding', die: a.id, cell: 0, pay: r.id })).toBe(false);
        act(game, 0, { type: 'tool', tool: 'grinding', die: a.id, cell: 0, pay: g.id });
        expect(game.pool.map(d => d.id)).toEqual([r.id]);
        expect(p.window[0].value).toBe(5);
        expect(game.tools[0].used).toBe(true);
    });
});

describe('終わり', () => {
    it('10ラウンドで終わり、点を数える。1人用は目標の点（ラウンドトラックの合計）と比べる', () => {
        const game = startPlay(1, [], 5, { soloTools: 3 });
        while (!game.isOver()) act(game, 0, { type: 'end' });
        expect(game.roundTrack).toHaveLength(10);
        expect(game.target).toBe(game.roundTrack.flat().reduce((s, d) => s + d.value, 0));
        expect(game.players[0].result.open).toBe(-60);
        expect(game.winners).toEqual([]);
    });

    it('同点は、個人の目標の点 → 残りの好意トークン → 最終ラウンドの手番の逆順', () => {
        const game = startPlay(3, [], 9);
        // 全員が何もせずに終える（窓は空、点は好意トークン − 20）
        game.players.forEach(p => { p.tokens = 4; });
        while (!game.isOver()) act(game, game.turn.seat, { type: 'end' });
        const lastStart = (game.firstStart + 9) % 3;
        // 全員が同じ点・同じ個人の目標の点・同じトークンなので、最終ラウンドで最後に手番だった人（スタートの人の右隣）が勝つ
        expect(game.winners).toEqual([(lastStart + 2) % 3]);
    });
});

it('同じシードなら同じ配り方とダイス', () => {
    expect(snapshot(startPlay(3, [], 11))).toBe(snapshot(startPlay(3, [], 11)));
});
