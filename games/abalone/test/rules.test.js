import { describe, it, expect } from 'vitest';
import { createState, legalMoves, examineMove, applyMove, cellAt, countOf, lineAxis, BLACK, WHITE, EMPTY, SIZE, STEP, LAYOUTS } from '../public/js/rules.js';
import Game from '../public/js/game.js';

// 盤を組み立てる：rows は 9 行（上から 5〜9〜5 マス）の文字列。B 黒・W 白・. 空き。省いた行は空き
const EMPTY_ROWS = ['.....', '......', '.......', '........', '.........', '........', '.......', '......', '.....'];
function board(rows, current = BLACK) {
    const s = createState();
    const full = EMPTY_ROWS.map((e, i) => rows[i] ?? e);
    s.board = [];
    full.forEach(row => [...row].forEach(ch => s.board.push(ch === 'B' ? BLACK : ch === 'W' ? WHITE : EMPTY)));
    if (s.board.length !== SIZE) throw new Error('行の長さが違います');
    s.current = current;
    return s;
}
const at = cellAt;
const R = 0; // 右
const L = 3; // 左

describe('盤と並べ方', () => {
    it('61マス、各14個。先手は黒', () => {
        for (const layout of Object.keys(LAYOUTS)) {
            const s = createState({ layout });
            expect(s.board).toHaveLength(61);
            expect(countOf(s, BLACK)).toBe(14);
            expect(countOf(s, WHITE)).toBe(14);
            expect(s.current).toBe(BLACK);
        }
    });

    it('標準の並べ方の最初の手は 44 通り', () => {
        expect(legalMoves(createState())).toHaveLength(44);
    });

    it('となりのマス：盤の端の先は外', () => {
        expect(STEP[at(0, 0)][2]).toBe(-1);
        expect(STEP[at(4, 0)][3]).toBe(-1);
        expect(STEP[at(4, 4)][R]).toBe(at(4, 5));
    });

    it('一列に並んだ1〜3個だけを動かせる', () => {
        expect(lineAxis([at(4, 2), at(4, 3), at(4, 4)])).toBe(0);
        expect(lineAxis([at(4, 2), at(4, 4)])).toBe(null);
        expect(lineAxis([at(4, 2), at(4, 3), at(4, 4), at(4, 5)])).toBe(null);
        const s = board({ 4: '..BBBB...' });
        expect(examineMove(s, [at(4, 2), at(4, 3), at(4, 4), at(4, 5)], R).error).toBe('range');
    });
});

describe('動かす', () => {
    it('列の向きに動かす。前が空きなら進む', () => {
        const s = board({ 4: '..BBB....' });
        const r = examineMove(s, [at(4, 2), at(4, 3), at(4, 4)], R);
        expect(r.error).toBeUndefined();
        const next = applyMove(s, { cells: [at(4, 2), at(4, 3), at(4, 4)], dir: R }, r);
        expect(next.board.slice(at(4, 0), at(4, 9)).join('')).toBe('000111000');
        expect(next.current).toBe(WHITE);
    });

    it('横に動かす（平行移動）。動く先がすべて空きのときだけ', () => {
        const s = board({ 4: '..BBB....' });
        // 右上へ：3個とも上の行へ
        expect(examineMove(s, [at(4, 2), at(4, 3), at(4, 4)], 1).error).toBeUndefined();
        const t = board({ 3: '...W....', 4: '..BBB....' });
        // 右上の先の1つに白がいる（横には押せない）
        expect(examineMove(t, [at(4, 2), at(4, 3), at(4, 4)], 1).error).toBe('side');
    });

    it('自分の玉を盤の外へは出せない。前が自分の玉なら進めない', () => {
        const s = board({ 4: 'BB.......' });
        expect(examineMove(s, [at(4, 0), at(4, 1)], L).error).toBe('edge');
        const t = board({ 4: 'BBBB.....' });
        expect(examineMove(t, [at(4, 0), at(4, 1), at(4, 2)], R).error).toBe('blocked');
    });
});

describe('押し出し', () => {
    it('3対2・3対1・2対1 は押せる', () => {
        expect(examineMove(board({ 4: 'BBBWW....' }), [at(4, 0), at(4, 1), at(4, 2)], R).pushed).toHaveLength(2);
        expect(examineMove(board({ 4: 'BBBW.....' }), [at(4, 0), at(4, 1), at(4, 2)], R).pushed).toHaveLength(1);
        expect(examineMove(board({ 4: '.BBW.....' }), [at(4, 1), at(4, 2)], R).pushed).toHaveLength(1);
    });

    it('同数（1対1・2対2・3対3）と、相手のほうが多いときは押せない', () => {
        expect(examineMove(board({ 4: '.BW......' }), [at(4, 1)], R).error).toBe('outnumbered');
        expect(examineMove(board({ 4: 'BBWW.....' }), [at(4, 0), at(4, 1)], R).error).toBe('outnumbered');
        expect(examineMove(board({ 4: 'BBBWWW...' }), [at(4, 0), at(4, 1), at(4, 2)], R).error).toBe('outnumbered');
        expect(examineMove(board({ 4: 'BBWWW....' }), [at(4, 0), at(4, 1)], R).error).toBe('outnumbered');
    });

    it('相手の後ろに自分の玉があると押せない（挟まれている）。相手の後ろに相手が続けば数に入る', () => {
        expect(examineMove(board({ 4: 'BBBWB....' }), [at(4, 0), at(4, 1), at(4, 2)], R).error).toBe('sandwich');
        expect(examineMove(board({ 4: 'BBBWWB...' }), [at(4, 0), at(4, 1), at(4, 2)], R).error).toBe('sandwich');
    });

    it('横に動かすときは押せない', () => {
        expect(examineMove(board({ 3: '..W.....', 4: '..BB.....' }), [at(4, 2), at(4, 3)], 2).error).toBe('side');
    });

    it('盤の外へ押し出すと数え、6個で勝ち', () => {
        let s = board({ 4: '....BBBW.', 2: '......W' }, BLACK);
        s.captured[BLACK] = 5;
        // 右へ：白を (4,8) へ押す（まだ盤の上）
        let r = examineMove(s, [at(4, 4), at(4, 5), at(4, 6)], R);
        s = applyMove(s, { cells: [at(4, 4), at(4, 5), at(4, 6)], dir: R }, r);
        expect(s.captured[BLACK]).toBe(5);
        expect(s.board[at(4, 8)]).toBe(WHITE);
        s.current = BLACK;
        r = examineMove(s, [at(4, 5), at(4, 6), at(4, 7)], R);
        expect(r.pushed).toEqual([[at(4, 8), -1]]);
        s = applyMove(s, { cells: [at(4, 5), at(4, 6), at(4, 7)], dir: R }, r);
        expect(s.captured[BLACK]).toBe(6);
        expect(s.result).toEqual({ winner: BLACK });
        expect(legalMoves(s)).toEqual([]);
    });
});

describe('進行と記録', () => {
    it('操作を記録し、同じ結果を再現できる。断った操作は状態を変えない', () => {
        for (const layout of ['standard', 'belgian', 'german']) {
            const players = [{ name: 'A' }, { name: 'B', isCPU: true }];
            const game = new Game(players, { seed: 3, layout });
            for (let n = 0; n < 80 && !game.isOver(); n++) {
                const before = JSON.stringify(game.state);
                const seat = game.current;
                const m = game.legalMoves()[(n * 37) % game.legalMoves().length];
                expect(game.applyCommand(1 - seat, m)).toBe(false);
                expect(game.applyCommand(seat, { type: 'move', cells: [0, 30], dir: 0 })).toBe(false);
                expect(game.applyCommand(seat, { type: 'move', cells: 'x', dir: 0 })).toBe(false);
                expect(game.applyCommand(seat, { type: 'move', cells: m.cells, dir: 9 })).toBe(false);
                expect(JSON.stringify(game.state)).toBe(before);
                expect(game.applyCommand(seat, { ...m, extra: 1 })).toBe(true);
                expect(Object.keys(game.commands.at(-1).command).sort()).toEqual(['cells', 'dir', 'type']);
            }
            const again = Game.replay(players, game.options, game.commands);
            expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
        }
    });

    it('黒（先手）の席はシードで決まる。並べ方は設定で受け取る', () => {
        const firsts = new Set(Array.from({ length: 10 }, (_, i) => new Game([{}, {}], { seed: i }).first));
        expect(firsts.size).toBe(2);
        const g = new Game([{}, {}], { seed: 1, layout: 'belgian' });
        expect(g.players[g.first].color).toBe(BLACK);
        expect(g.current).toBe(g.first);
        expect(g.options.layout).toBe('belgian');
        expect(new Game([{}, {}], { seed: 1, layout: 'x' }).options.layout).toBe('standard');
    });

    it('断った理由', () => {
        const game = new Game([{}, {}], { seed: 1 });
        const seat = game.current;
        expect(game.applyCommand(seat, { type: 'move', cells: [at(8, 0)], dir: 4 })).toBe(false);
        expect(game.lastError).toBe('自分の玉を盤の外へは出せません');
    });
});
