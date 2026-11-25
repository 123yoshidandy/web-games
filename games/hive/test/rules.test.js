import { describe, it, expect } from 'vitest';
import { createState, legalActions, applyAction, actionKey, placementCells, placeableKinds, moveActions, articulationPoints, neighbors, ORIGIN } from '../public/js/rules.js';

// 局面を作る。layout は [マス, 持ち主, 種類] を下から順に（同じマスなら積み重なる）
function position(layout, { current = 0, expansions = ['L', 'M', 'P'], turns = [5, 5], lastMoved = null, frozen = null } = {}) {
    const s = createState({ expansions });
    let id = 0;
    const ids = {};
    for (const [cell, owner, kind, name] of layout) {
        const piece = { id: id++, owner, kind };
        (s.board[cell] ??= []).push(piece);
        s.hands[owner][kind]--;
        if (name) ids[name] = piece.id;
    }
    s.nextId = id;
    s.current = current;
    s.turns = turns;
    s.lastMoved = lastMoved === null ? null : ids[lastMoved];
    s.frozen = frozen === null ? null : ids[frozen];
    return { s, ids };
}
const destsOf = (s, from) => moveActions(s, s.current).filter(a => a.from === from && !a.via).map(a => a.to).sort();
const sorted = (list) => [...list].sort();

describe('置く', () => {
    it('最初は中央、2手目はそれに接して、3手目からは自分の駒にだけ接するマス', () => {
        let s = createState({ tournament: false });
        expect(placementCells(s, 0)).toEqual([ORIGIN]);
        s = applyAction(s, { type: 'place', kind: 'A', to: ORIGIN });
        expect(sorted(placementCells(s, 1))).toEqual(sorted(neighbors(ORIGIN)));
        s = applyAction(s, { type: 'place', kind: 'A', to: '1,0' });
        // 白の3手目：白のアリ（0,0）に接し、黒のアリ（1,0）に接しない
        const cells = placementCells(s, 0);
        for (const c of cells) {
            expect(neighbors(c).some(n => n === ORIGIN)).toBe(true);
            expect(neighbors(c).includes('1,0')).toBe(false);
        }
        expect(sorted(cells)).toEqual(sorted(['-1,0', '-1,1', '0,-1']));
    });

    it('トーナメントルール：最初の手に女王蜂を置けない（切れば置ける）', () => {
        expect(placeableKinds(createState(), 0)).not.toContain('Q');
        expect(placeableKinds(createState({ tournament: false }), 0)).toContain('Q');
    });

    it('4手目までに女王蜂：4手目に女王蜂が手持ちなら、女王蜂しか置けない', () => {
        const { s } = position([['0,0', 0, 'A'], ['1,0', 1, 'A'], ['-1,0', 0, 'G'], ['2,0', 1, 'G'], ['-2,0', 0, 'S'], ['3,0', 1, 'S']], { turns: [3, 3] });
        expect(placeableKinds(s, 0)).toEqual(['Q']);
        expect(legalActions(s).every(a => a.type === 'place' && a.kind === 'Q')).toBe(true);
    });

    it('積み重なったマスは、いちばん上の駒の色で数える', () => {
        // 黒の女王蜂の上に白のカブトムシ。白は、黒の女王蜂に接するマスにも置ける
        const { s } = position([['0,0', 1, 'Q'], ['1,0', 0, 'Q'], ['0,0', 0, 'B']], { turns: [3, 3] });
        expect(placementCells(s, 0)).toContain('-1,0');
        expect(placementCells(s, 1)).toEqual([]);
    });

    it('拡張の駒は、選んだときだけ手持ちにある', () => {
        expect(createState().hands[0]).toEqual({ Q: 1, B: 2, G: 3, S: 2, A: 3 });
        expect(createState({ expansions: ['M'] }).hands[0].M).toBe(1);
    });
});

describe('動かす', () => {
    it('女王蜂を置くまでは動かせない', () => {
        const s0 = createState({ tournament: false });
        let s = applyAction(s0, { type: 'place', kind: 'A', to: ORIGIN });
        s = applyAction(s, { type: 'place', kind: 'Q', to: '1,0' });
        s = applyAction(s, { type: 'place', kind: 'Q', to: '-1,0' });
        // 黒は女王蜂を置いたので動かせる。白はまだ動かせない（このあと白の番で確かめる）
        expect(moveActions(s, 1).length).toBeGreaterThan(0);
        const t = { ...s, current: 0, hands: [{ ...s.hands[0], Q: 1 }, s.hands[1]] };
        expect(moveActions(t, 0)).toEqual([]);
    });

    it('ひとつながり：取り除くと巣が分かれる駒は動かせない', () => {
        const { s } = position([['0,0', 0, 'Q'], ['1,0', 1, 'Q'], ['-1,0', 0, 'A'], ['2,0', 1, 'A']]);
        expect(articulationPoints(s.board)).toEqual(new Set(['0,0', '1,0']));
        expect(moveActions(s, 0).some(a => a.from === '0,0')).toBe(false);
        expect(moveActions(s, 0).some(a => a.from === '-1,0')).toBe(true);
    });

    it('すき間：両側がふさがったすき間は滑って通れない。巣から離れる滑りもできない', () => {
        // (1,0) のまわり5マスがふさがり、(0,0) の女王蜂は (1,0) に入れない
        const ring = [['0,1', 1, 'A'], ['1,1', 1, 'G'], ['2,0', 1, 'Q'], ['2,-1', 0, 'G'], ['1,-1', 0, 'A']];
        const { s } = position([['0,0', 0, 'Q'], ...ring]);
        expect(destsOf(s, '0,0')).toEqual(sorted(['0,-1', '-1,1']));
        // アリもすき間の奥には入れない
        const ant = destsOf(s, '1,-1');
        expect(ant).not.toContain('1,0');
        expect(ant.length).toBeGreaterThan(5);
    });

    it('女王蜂は1マス、アリは巣のまわりならどこへでも', () => {
        const { s } = position([['0,0', 1, 'Q'], ['1,0', 0, 'Q']]);
        expect(destsOf(s, '1,0')).toEqual(sorted(['1,-1', '0,1']));
        const t = position([['0,0', 1, 'Q'], ['1,0', 0, 'A'], ['-1,0', 0, 'Q']]).s;
        // 2つの駒のまわりの空きマス（8つ）から、アリのいたマスを除いた7つ
        expect(destsOf(t, '1,0')).toHaveLength(7);
    });

    it('クモはちょうど3マス', () => {
        // 隣り合う2つの駒のまわり（8マス）を、どちら回りでも3歩
        const { s } = position([['1,0', 0, 'S'], ['0,0', 1, 'Q'], ['-1,0', 0, 'Q']]);
        expect(destsOf(s, '1,0')).toEqual(sorted(['-1,-1', '-2,1']));
    });

    it('バッタは一直線に1つ以上を跳び越す', () => {
        const { s } = position([['0,0', 0, 'G'], ['1,0', 1, 'Q'], ['2,0', 1, 'A'], ['1,-1', 0, 'Q']]);
        expect(destsOf(s, '0,0')).toEqual(sorted(['3,0', '2,-2']));
    });

    it('カブトムシは上に乗れ、乗られた駒は動けない。上から降りられる', () => {
        const { s } = position([['0,0', 1, 'Q'], ['1,0', 0, 'B'], ['-1,0', 0, 'Q']]);
        expect(destsOf(s, '1,0')).toEqual(sorted(['0,0', '1,-1', '0,1']));
        const up = applyAction(s, { type: 'move', from: '1,0', to: '0,0' });
        expect(moveActions(up, 1).some(a => a.from === '0,0')).toBe(false);
        // 上のカブトムシは、どの方向へも進める（空きマスへ降りるのも、隣の駒に乗り移るのも）
        const down = { ...up, current: 0 };
        expect(destsOf(down, '0,0')).toEqual(sorted(neighbors('0,0')));
    });

    it('カブトムシ：両側が高い積み重なりのすき間は、上でも通れない', () => {
        // (1,-1) と (0,1) が高さ2。地面の (0,0) から (1,0) へ（両側とも高さ2 > 行き先0・元0）は通れない
        const { s } = position([
            ['0,0', 0, 'B'], ['-1,1', 0, 'Q'], ['1,-1', 1, 'Q'], ['1,-1', 1, 'B'], ['0,1', 1, 'A'], ['0,1', 0, 'B'], ['1,1', 1, 'G'], ['2,-1', 1, 'G'], ['2,0', 1, 'A']
        ]);
        expect(destsOf(s, '0,0')).not.toContain('1,0');
        expect(destsOf(s, '0,0')).toContain('1,-1');
    });

    it('テントウムシ：2マス上を進み、3マス目で降りる', () => {
        const { s } = position([['1,0', 0, 'L'], ['0,0', 1, 'Q'], ['-1,0', 0, 'Q']]);
        expect(destsOf(s, '1,0')).toEqual(sorted(['0,-1', '-1,-1', '-2,0', '-2,1', '-1,1']));
    });

    it('蚊：接している駒の動きをまねる。巣の上ではカブトムシ', () => {
        const { s } = position([['1,0', 0, 'M'], ['0,0', 1, 'Q'], ['-1,0', 0, 'Q']]);
        expect(destsOf(s, '1,0')).toEqual(sorted(['1,-1', '0,1']));
        const g = position([['1,0', 0, 'M'], ['0,0', 1, 'G'], ['-1,0', 0, 'Q']]).s;
        expect(destsOf(g, '1,0')).toEqual(['-2,0']);
        const top = position([['0,0', 1, 'Q'], ['0,0', 0, 'M'], ['-1,0', 0, 'Q'], ['1,0', 1, 'A']]).s;
        expect(destsOf(top, '0,0')).toEqual(sorted(neighbors('0,0')));
    });

    it('ダンゴムシ：接している駒を、自分の上を通して自分に接する空きマスへ動かす', () => {
        const layout = [['0,0', 0, 'P'], ['-1,0', 0, 'Q'], ['1,0', 1, 'A', 'ant'], ['1,-1', 1, 'Q']];
        const { s } = position(layout);
        const throws = moveActions(s, 0).filter(a => a.via === '0,0' && a.from === '1,0').map(a => a.to).sort();
        expect(throws).toEqual(sorted(['0,-1', '-1,1', '0,1']));
        // 直前に動いた駒は動かせない
        const last = position(layout, { lastMoved: 'ant' }).s;
        expect(moveActions(last, 0).some(a => a.via && a.from === '1,0')).toBe(false);
        // 動かされた駒は、次の手番に動けない
        const after = applyAction(s, { type: 'move', from: '1,0', to: '0,1', via: '0,0' });
        expect(moveActions(after, 1).some(a => a.from === '0,1')).toBe(false);
        expect(legalActions(after).some(a => a.type === 'move' && a.from === '0,1')).toBe(false);
    });

    it('ダンゴムシ：積み重なった駒・巣を分ける駒は動かせない', () => {
        const { s } = position([['0,0', 0, 'P'], ['-1,0', 0, 'Q'], ['1,0', 1, 'Q'], ['1,0', 1, 'B'], ['2,0', 1, 'A']]);
        expect(moveActions(s, 0).some(a => a.via && a.from === '1,0')).toBe(false);
        // 巣を分ける駒（2,0 のアリはつながりの端なので動かせるが、ダンゴムシには接していない）
        expect(moveActions(s, 0).some(a => a.via && a.from === '-1,0')).toBe(true);
    });
});

describe('勝ち負け・パス・引き分け', () => {
    it('女王蜂の6方向がふさがったら負け', () => {
        const around = neighbors('0,0').slice(0, 5).map((c, i) => [c, i % 2, ['A', 'G', 'S', 'B', 'G'][i]]);
        const { s } = position([['0,0', 1, 'Q'], ...around, ['2,-2', 0, 'Q'], ['-1,2', 0, 'A']], { current: 0 });
        // 最後の1マス（0,1）を白がふさぐ
        const fill = legalActions(s).find(a => a.to === '0,1' && a.from === '-1,2');
        expect(fill).toBeTruthy();
        const end = applyAction(s, fill);
        expect(end.result).toEqual({ winner: 0, reason: 'queen' });
        expect(legalActions(end)).toEqual([]);
    });

    it('両方の女王蜂が同時に囲まれたら引き分け', () => {
        // 白の女王蜂 (0,0) と黒の女王蜂 (1,0) が隣り合い、残りのすき間 (1,-1)… をカブトムシが埋める形
        const { s } = position([
            ['0,0', 0, 'Q'], ['1,0', 1, 'Q'],
            ['-1,0', 0, 'A'], ['-1,1', 0, 'A'], ['0,1', 1, 'A'], ['1,1', 1, 'A'], ['2,0', 1, 'G'], ['2,-1', 1, 'G'], ['0,-1', 0, 'G'],
            ['1,-2', 0, 'B']
        ]);
        // (1,-1) が両方の女王蜂に接する最後のすき間。白のカブトムシ (1,-2) が入る
        const fill = legalActions(s).find(a => a.type === 'move' && a.from === '1,-2' && a.to === '1,-1');
        expect(fill).toBeTruthy();
        expect(applyAction(s, fill).result).toEqual({ winner: null, reason: 'both' });
    });

    it('置けず動かせないときは、パスしかできない', () => {
        const { s } = position([['0,0', 1, 'Q'], ['0,0', 0, 'B'], ['1,0', 0, 'Q']], { current: 1 });
        s.hands[1] = { Q: 0, B: 0, G: 0, S: 0, A: 0 };
        expect(legalActions(s)).toEqual([{ type: 'pass' }]);
        const after = applyAction(s, { type: 'pass' });
        expect(after.current).toBe(0);
        expect(after.result).toBe(null);
    });

    it('同じ局面が3回目になったら引き分け', () => {
        const { s } = position([['0,0', 0, 'Q'], ['1,0', 1, 'Q']], { expansions: [] });
        s.hands = [{ Q: 0, B: 0, G: 0, S: 0, A: 0 }, { Q: 0, B: 0, G: 0, S: 0, A: 0 }];
        // 両者が行って戻るを繰り返す。1手目のあとの局面が、5手目・9手目のあとにも出て、3回目で引き分け
        let t = s;
        const seen = [];
        let plies = 0;
        for (let i = 0; i < 20 && !t.result; i++) {
            const a = i % 4 < 2 ? legalActions(t).find(x => x.type === 'move') : { type: 'move', from: seen[i - 2].to, to: seen[i - 2].from };
            seen.push(a);
            t = applyAction(t, a);
            plies++;
        }
        expect(plies).toBe(9);
        expect(t.result).toEqual({ winner: null, reason: 'repetition' });
    });
});

describe('手の形', () => {
    it('通る手はすべて、違う鍵を持つ', () => {
        const { s } = position([['0,0', 0, 'P'], ['-1,0', 0, 'Q'], ['1,0', 1, 'A'], ['1,-1', 1, 'Q'], ['0,1', 0, 'M']]);
        const keys = legalActions(s).map(actionKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
