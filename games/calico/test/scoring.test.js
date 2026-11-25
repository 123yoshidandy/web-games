import { describe, it, expect } from 'vitest';
import { goalResult, catFits, awardsFor, groupAt, scorePlayer, goalFeasible } from '../public/js/scoring.js';
import { GOALS, BOARDS, COLORS, PATTERNS } from '../public/js/data.js';
import { NEIGHBORS, GOAL_CELLS, BORDER, OPEN_CELLS, cellOf } from '../public/js/board.js';
import { quiltOf, shift } from './helpers.js';

// 置き場 0（2行3列）のまわり6マスに、色と模様を並べる
const around = NEIGHBORS[GOAL_CELLS[0]];
const goalQuilt = (colors, patterns) => quiltOf(Object.fromEntries(around.map((c, i) => [c, [colors[i], patterns[i]]])));
const score = (goal, colors, patterns) => goalResult(0, goalQuilt(colors, patterns), goal, 0).points;
const [Y, P, U, S, G, N] = COLORS;      // 黄・ピンク・紫・水色・緑・紺
const [st, fe, dt, fl, qu, vi] = PATTERNS; // しま・シダ・水玉・花・四つ葉・つる

describe('目標タイル（色か模様で合えば低い点、両方なら高い点だけ）', () => {
    it('置き場のまわりは6マスとも内側のパッチ', () => {
        GOAL_CELLS.forEach(cell => {
            expect(NEIGHBORS[cell].length).toBe(6);
            NEIGHBORS[cell].forEach(n => expect(OPEN_CELLS).toContain(n));
        });
    });
    it('≠：すべて違う（10・15）', () => {
        expect(score('diff', [Y, P, U, S, G, N], [st, fe, dt, fl, qu, vi])).toBe(15);
        expect(score('diff', [Y, P, U, S, G, N], [st, st, dt, fl, qu, vi])).toBe(10);
        expect(score('diff', [Y, Y, U, S, G, N], [st, st, dt, fl, qu, vi])).toBe(0);
    });
    it('AAA-BBB（7・13）', () => {
        expect(score('aaabbb', [Y, Y, Y, P, P, P], [st, fe, dt, fl, qu, vi])).toBe(7);
        expect(score('aaabbb', [Y, Y, Y, P, P, P], [dt, dt, fl, fl, dt, fl])).toBe(13);
    });
    it('AAAA-BB（7・14）', () => {
        expect(score('aaaabb', [Y, Y, P, Y, Y, P], [st, fe, dt, fl, qu, vi])).toBe(7);
        expect(score('aaaabb', [Y, Y, P, Y, Y, P], [dt, dt, dt, dt, st, st])).toBe(14);
    });
    it('AAA-BB-C（7・11）', () => {
        expect(score('aaabbc', [Y, Y, Y, P, P, U], [st, fe, dt, fl, qu, vi])).toBe(7);
        expect(score('aaabbc', [Y, Y, Y, P, P, U], [st, st, st, fe, fe, dt])).toBe(11);
    });
    it('AA-BB-CC（7・11）', () => {
        expect(score('aabbcc', [Y, Y, P, P, U, U], [st, fe, dt, fl, qu, vi])).toBe(7);
        expect(score('aabbcc', [Y, Y, P, P, U, U], [st, st, fe, fe, dt, dt])).toBe(11);
        // 色と模様がまざった3組では合わない
        expect(score('aabbcc', [Y, Y, P, P, U, S], [st, fe, dt, fl, qu, qu])).toBe(0);
    });
    it('AA-BB-C-D（5・7）', () => {
        expect(score('aabbcd', [Y, Y, P, P, U, S], [st, fe, dt, fl, qu, vi])).toBe(5);
        expect(score('aabbcd', [Y, Y, P, P, U, S], [st, st, fe, fe, dt, fl])).toBe(7);
    });
    it('まわりが埋まっていなければ0。まだ合わせられるかも分かる', () => {
        const quilt = goalQuilt([Y, Y, Y, P, P, P], [dt, dt, fl, fl, dt, fl]);
        quilt[around[0]] = null;
        expect(goalResult(0, quilt, 'aaabbb', 0).points).toBe(0);
        expect(goalFeasible([Y, Y, P], GOALS.aaabbb.counts)).toBe(true);
        expect(goalFeasible([Y, P, U], GOALS.aaabbb.counts)).toBe(false);
        expect(goalFeasible([Y, Y, Y, Y], GOALS.aaabbb.counts)).toBe(false);
    });
});

describe('猫の条件', () => {
    const base = cellOf(3, 2);
    const line = (n, dq = 1, dr = 0) => Array.from({ length: n }, (_, i) => shift(base, dq * i, dr * i));
    it('枚数の猫：同じ模様が n 枚以上つながる', () => {
        expect(catFits('millie', line(3))).toBe(true);
        expect(catFits('millie', line(2))).toBe(false);
        expect(catFits('gwen', [...line(4), ...line(3, 0, 1).slice(1)])).toBe(false);
        expect(catFits('gwen', [...line(4), ...line(4, 0, 1).slice(1)])).toBe(true);
    });
    it('直線の猫：n 枚まっすぐ（3本の軸のどれでも）。曲がっていると来ない。長くてもよい', () => {
        expect(catFits('rumi', line(3))).toBe(true);
        expect(catFits('rumi', line(3, 0, 1))).toBe(true);
        expect(catFits('rumi', line(3, 1, -1))).toBe(true);
        expect(catFits('rumi', [shift(base, 0, 0), shift(base, 1, 0), shift(base, 1, 1)])).toBe(false);
        expect(catFits('tecolote', line(5))).toBe(true);
        expect(catFits('leo', line(4))).toBe(false);
    });
    it('キャリー：三角の3枚。アーモンド：3枚の列の上に2枚', () => {
        expect(catFits('callie', [shift(base, 0, 0), shift(base, 1, 0), shift(base, 0, 1)])).toBe(true);
        expect(catFits('callie', [shift(base, 0, 0), shift(base, 1, 0), shift(base, 1, -1)])).toBe(true);
        expect(catFits('callie', line(3))).toBe(false);
        const trapezoid = [shift(base, 0, 0), shift(base, 1, 0), shift(base, 2, 0), shift(base, 1, -1), shift(base, 2, -1)];
        expect(catFits('almond', trapezoid)).toBe(true);
        expect(catFits('almond', [...line(3), shift(base, 1, -1), shift(base, 3, -1)])).toBe(false);
        // 回した向きでもよい
        expect(catFits('almond', [shift(base, 0, 0), shift(base, 0, 1), shift(base, 0, 2), shift(base, 1, 0), shift(base, 1, 1)])).toBe(true);
    });
});

describe('ボタンと猫が来る', () => {
    const cats = [{ id: 'millie', patterns: ['dots', 'stripes'] }, { id: 'rumi', patterns: ['flowers', 'ferns'] }, { id: 'gwen', patterns: ['quatrefoil', 'vines'] }];
    const player = (placements, extra = {}) => ({ board: 0, quilt: quiltOf(placements), buttons: [], rainbow: false, cats: [], goals: [], ...extra });
    const a = cellOf(1, 2);
    const b = cellOf(1, 3);
    const c = cellOf(2, 2);
    it('同じ色が3枚つながるとボタン。広げても増えない。離れた別のまとまりならもう1つ', () => {
        const p = player({ [a]: [Y, st], [b]: [Y, fe], [c]: [Y, fl] });
        expect(groupAt(0, p.quilt, c, 'color').length).toBeGreaterThanOrEqual(3);
        expect(awardsFor(p, cats, c).button).toBe(Y);
        p.buttons.push({ color: Y, cell: c });
        const d = cellOf(2, 1);
        p.quilt[d] = quiltOf({ [d]: [Y, dt] })[d];
        expect(awardsFor(p, cats, d).button).toBe(null);
    });
    it('縁のパッチもまとまりに数える', () => {
        const edges = BOARDS[0].edges;
        // 縁のマスと、そのとなりの内側の2マスで3枚にする
        const found = BORDER.map((e, i) => ({ e, color: edges[i].color })).find(({ e }) => NEIGHBORS[e].some(n => OPEN_CELLS.includes(n) && NEIGHBORS[n].some(m => m !== e && OPEN_CELLS.includes(m) && !NEIGHBORS[m].includes(e))));
        const n1 = NEIGHBORS[found.e].find(n => OPEN_CELLS.includes(n));
        const n2 = NEIGHBORS[n1].find(m => m !== found.e && OPEN_CELLS.includes(m) && !NEIGHBORS[m].includes(found.e) && !BORDER.some(x => NEIGHBORS[m].includes(x) && edges[BORDER.indexOf(x)].color === found.color));
        const other = PATTERNS.find(pt => pt !== edges[BORDER.indexOf(found.e)].pattern);
        const p = player({ [n1]: [found.color, other], [n2]: [found.color, other] });
        expect(awardsFor(p, [], n2).button).toBe(found.color);
    });
    it('6色のボタンがそろうと虹のボタン', () => {
        const p = player({ [a]: [N, st], [b]: [N, fe], [c]: [N, fl] }, { buttons: [Y, P, U, S, G].map((color, i) => ({ color, cell: 30 + i })) });
        const r = awardsFor(p, cats, c);
        expect(r.button).toBe(N);
        expect(r.rainbow).toBe(true);
        expect(awardsFor({ ...p, rainbow: true }, cats, c).rainbow).toBe(false);
    });
    it('好きな模様のまとまりが条件を満たすと猫。猫のいるまとまりには、もう来ない', () => {
        const p = player({ [a]: [Y, dt], [b]: [P, dt], [c]: [U, dt] });
        expect(awardsFor(p, cats, c).cat).toBe('millie');
        p.cats.push({ cat: 'millie', cell: c });
        const d = cellOf(2, 1);
        p.quilt[d] = quiltOf({ [d]: [S, dt] })[d];
        expect(awardsFor(p, cats, d).cat).toBe(null);
        // 接していない別のまとまりなら、同じ猫がもう1匹来る
        const far = [cellOf(4, 3), cellOf(4, 4), cellOf(5, 3)];
        far.forEach((cell, i) => { p.quilt[cell] = quiltOf({ [cell]: [[G, N, Y][i], dt] })[cell]; });
        expect(far.every(cell => !groupAt(0, p.quilt, c, 'pattern').includes(cell))).toBe(true);
        expect(awardsFor(p, cats, far[2]).cat).toBe('millie');
        // 好きでない模様には来ない
        const q = player({ [a]: [Y, qu], [b]: [P, qu], [c]: [U, qu] });
        expect(awardsFor(q, cats.slice(0, 2), c).cat).toBe(null);
    });
    it('点：目標＋ボタン3点ずつ（虹も3点）＋猫', () => {
        const p = player({}, { buttons: [{ color: Y, cell: 8 }, { color: P, cell: 9 }], rainbow: true, cats: [{ cat: 'millie', cell: 8 }, { cat: 'gwen', cell: 10 }], goals: ['diff', 'aaabbb', 'aabbcc'] });
        const s = scorePlayer(p);
        expect(s.buttonPoints).toBe(9);
        expect(s.catPoints).toBe(14);
        expect(s.goalPoints).toBe(0);
        expect(s.total).toBe(23);
    });
});
