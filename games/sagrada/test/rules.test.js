import { describe, it, expect } from 'vitest';
import { PATTERNS, PATTERN_CARDS, TOOL_IDS, OBJECTIVE_IDS } from '../public/js/data.js';
import { canPlace, legalCells, canMove, objectiveScore, privateScore, scoreWindow } from '../public/js/rules.js';
import { blankPattern, die, windowOf } from './helpers.js';

describe('データ', () => {
    it('窓は24（12枚の表裏）。難しさは3〜6、20マス', () => {
        expect(PATTERNS).toHaveLength(24);
        expect(PATTERN_CARDS).toHaveLength(12);
        PATTERN_CARDS.forEach(card => expect(PATTERNS.filter(p => p.card === card)).toHaveLength(2));
        PATTERNS.forEach(p => {
            expect(p.cells).toHaveLength(20);
            expect(p.difficulty).toBeGreaterThanOrEqual(3);
            expect(p.difficulty).toBeLessThanOrEqual(6);
        });
        expect(TOOL_IDS).toHaveLength(12);
        expect(OBJECTIVE_IDS).toHaveLength(10);
    });

    it('どの窓も、縦横に同じ色・同じ目の制約が並ばない（全部を埋められる見込みがある）', () => {
        PATTERNS.forEach(p => {
            p.cells.forEach((c, i) => {
                if (!c) return;
                const right = i % 5 < 4 ? p.cells[i + 1] : null;
                const below = i + 5 < 20 ? p.cells[i + 5] : null;
                [right, below].forEach(o => {
                    if (!o) return;
                    expect(c.color && c.color === o.color, `${p.name} ${i}`).toBeFalsy();
                    expect(c.value && c.value === o.value, `${p.name} ${i}`).toBeFalsy();
                });
            });
        });
    });

    it('Kaleidoscopic Dream の並び（資料と同じ）', () => {
        const p = PATTERNS.find(x => x.name === 'Kaleidoscopic Dream');
        expect(p.difficulty).toBe(4);
        expect(p.cells[0]).toEqual({ color: 'yellow' });
        expect(p.cells[4]).toEqual({ value: 1 });
        expect(p.cells[12]).toEqual({ color: 'red' });
    });
});

describe('置き方', () => {
    const empty = Array(20).fill(null);
    const blank = blankPattern();

    it('最初のダイスは縁か角', () => {
        expect(legalCells(empty, blank, die('red', 3))).toEqual([0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 16, 17, 18, 19]);
    });

    it('2個目からは、すでにあるダイスに縦横斜めで接する', () => {
        const w = windowOf('R1 .. .. .. .. ' + '.. .. .. .. .. '.repeat(3));
        expect(legalCells(w, blank, die('blue', 3))).toEqual([1, 5, 6]);
    });

    it('縦横に同じ色・同じ目は置けない（斜めはよい）', () => {
        const w = windowOf('R1 .. .. .. .. ' + '.. .. .. .. .. '.repeat(3));
        expect(canPlace(w, blank, 1, die('red', 4))).toBe(false);
        expect(canPlace(w, blank, 1, die('blue', 1))).toBe(false);
        expect(canPlace(w, blank, 6, die('red', 1))).toBe(true);
    });

    it('マスの色と目の制約（無視する指定もできる）', () => {
        const p = PATTERNS.find(x => x.name === 'Kaleidoscopic Dream');
        expect(canPlace(empty, p, 0, die('yellow', 3))).toBe(true);
        expect(canPlace(empty, p, 0, die('red', 3))).toBe(false);
        expect(canPlace(empty, p, 0, die('red', 3), { ignoreColor: true })).toBe(true);
        expect(canPlace(empty, p, 4, die('red', 2))).toBe(false);
        expect(canPlace(empty, p, 4, die('red', 2), { ignoreValue: true })).toBe(true);
    });

    it('コルクの定規：ほかのダイスと接しないマス', () => {
        const w = windowOf('R1 .. .. .. .. ' + '.. .. .. .. .. '.repeat(3));
        expect(canPlace(w, blank, 1, die('blue', 3), { alone: true })).toBe(false);
        expect(canPlace(w, blank, 12, die('blue', 3), { alone: true })).toBe(true);
    });

    it('動かす：元の場所から外してから確かめる', () => {
        const w = windowOf('R1 B2 .. .. .. ' + '.. .. .. .. .. '.repeat(3));
        expect(canMove(w, blank, 1, 6)).toBe(true);
        expect(canMove(w, blank, 0, 12)).toBe(false);
    });
});

describe('得点', () => {
    // ルールブックの例は窓の絵なので、同じ考え方の盤面で確かめる
    const full = windowOf(`
        R1 Y2 G3 B4 P5
        Y3 G4 B5 P6 R1
        G5 B6 P1 R2 Y3
        B2 P3 R4 Y5 G6`);

    it('行・列の色違いと目違い（埋まった行・列だけ）', () => {
        expect(objectiveScore(full, 'rowColor')).toBe(4 * 6);
        expect(objectiveScore(full, 'colColor')).toBe(5 * 5);
        expect(objectiveScore(full, 'rowShade')).toBe(4 * 5);
        expect(objectiveScore(full, 'colShade')).toBe(5 * 4);
        const holed = [...full];
        holed[0] = null;
        expect(objectiveScore(holed, 'rowColor')).toBe(3 * 6);
        expect(objectiveScore(holed, 'colColor')).toBe(4 * 5);
    });

    it('組の目標：淡い・中くらい・深い色合い、目の揃い、色の揃い', () => {
        // 目の数：1×3、2×3、3×4、4×3、5×4、6×3
        expect(objectiveScore(full, 'light')).toBe(3 * 2);
        expect(objectiveScore(full, 'medium')).toBe(3 * 2);
        expect(objectiveScore(full, 'deep')).toBe(3 * 2);
        expect(objectiveScore(full, 'shadeVariety')).toBe(3 * 5);
        expect(objectiveScore(full, 'colorVariety')).toBe(4 * 4);
    });

    it('色の斜め：斜めに同じ色と接するダイスの数', () => {
        // 斜めの並び（左上→右下）は R1・G4・P1・Y5 で色が違い、右上→左下 Y2・Y3 などが同じ色
        const w = windowOf(`
            R1 .. .. .. ..
            .. R2 .. .. ..
            .. .. R3 .. ..
            .. G1 .. G2 ..`);
        expect(objectiveScore(w, 'diagonals')).toBe(3);
        const v = windowOf(`
            R1 .. .. .. ..
            .. R2 .. .. ..
            .. .. .. .. ..
            .. .. .. .. ..`);
        expect(objectiveScore(v, 'diagonals')).toBe(2);
    });

    it('ルールブックの例の合計：目標＋個人の目標＋好意トークン − 空きマス', () => {
        const w = [...full];
        w[0] = null; w[7] = null; w[12] = null;
        const r = scoreWindow(w, { objectives: ['colColor', 'light', 'colorVariety'], privates: ['purple'], tokens: 0 });
        expect(r.open).toBe(-3);
        expect(r.private).toBe(privateScore(w, 'purple'));
        expect(r.total).toBe(r.publics.reduce((s, x) => s + x, 0) + r.private - 3);
    });

    it('1人用：個人の目標は2枚のうち点の多い方、空きマスは −3', () => {
        const r = scoreWindow(full, { objectives: ['light'], privates: ['red', 'green'], openPenalty: 3 });
        expect(r.private).toBe(Math.max(privateScore(full, 'red'), privateScore(full, 'green')));
        const holed = [...full];
        holed[3] = null;
        expect(scoreWindow(holed, { objectives: [], privates: ['red'], openPenalty: 3 }).open).toBe(-3);
    });
});
