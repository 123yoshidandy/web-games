import { describe, it, expect } from 'vitest';
import { FastBoard, search, ownership, boardSeed } from '../public/js/engine.js';
import { createBoard, tryMove, legalMoves, BLACK, WHITE } from '../public/js/rules.js';
import { createRandom } from '../public/js/random.js';
import { boardOf, at } from './helpers.js';

describe('速い盤（FastBoard）', () => {
    it('乱数の対局で、打てる点・取り・コウの点・盤が rules.js と一致する', () => {
        for (const size of [9, 13]) {
            for (let g = 0; g < 12; g++) {
                const random = createRandom(g + 100);
                let board = createBoard(size);
                let ko = -1;
                let color = BLACK;
                const fb = new FastBoard(size);
                for (let ply = 0; ply < size * size * 2; ply++) {
                    const legal = legalMoves(board, size, color, ko);
                    const fast = [];
                    for (let sq = 0; sq < size * size; sq++) if (fb.isLegal(fb.points[sq], color)) fast.push(sq);
                    expect(fast).toEqual(legal);
                    if (!legal.length) break;
                    const sq = legal[Math.floor(random() * legal.length)];
                    const res = tryMove(board, size, sq, color, ko);
                    board = res.board;
                    ko = res.ko;
                    const taken = fb.play(fb.points[sq], color);
                    expect(taken).toBe(res.captured.length);
                    expect(fb.ko < 0 ? -1 : fb.toSq(fb.ko)).toBe(ko);
                    color = 3 - color;
                }
                expect(Array.from(fb.points, p => fb.color[p])).toEqual(board);
            }
        }
    });

    it('連のダメが1つかどうかと、その点が分かる', () => {
        const fb = FastBoard.from(boardOf(['.....', '.XO..', '..X..', '.....', '.....']), 5);
        const white = fb.points[at(5, 1, 2)];
        expect(fb.atariLib(fb.head[white])).toBe(-1);
        fb.play(fb.points[at(5, 0, 2)], BLACK);
        expect(fb.atariLib(fb.head[white])).toBe(fb.points[at(5, 1, 3)]);
    });
});

describe('探索', () => {
    it('同じシードなら同じ手、同じ回数', () => {
        const state = { board: createBoard(9), size: 9, toPlay: BLACK, komi: 6.5, ply: 0, lastMove: -1 };
        const a = search(state, { playouts: 600, seed: 7 });
        const b = search(state, { playouts: 600, seed: 7 });
        expect(a.move).toBe(b.move);
        expect(a.playouts).toBe(600);
        expect(a.children).toEqual(b.children);
    });

    it('大石をアタリにされたら逃げ、取れる大石は取る', () => {
        // 黒の4子がアタリ（ダメは (2,5) だけ）。白が取れば勝ちが決まり、黒が伸びればダメが3つになる
        const board = boardOf([
            '.........',
            '.OOOO....',
            'OXXXX....',
            '.OOOO....',
            '.........',
            '.........',
            '.........',
            '.........',
            '.........'
        ]);
        const take = search({ board, size: 9, toPlay: WHITE, komi: 6.5, ply: 20, lastMove: -1 }, { playouts: 1500, seed: 3 });
        expect(take.move).toBe(at(9, 2, 5));
        const escape = search({ board, size: 9, toPlay: BLACK, komi: 6.5, ply: 20, lastMove: at(9, 1, 4) }, { playouts: 1500, seed: 3 });
        expect(escape.move).toBe(at(9, 2, 5));
    });

    it('コウの点と自殺手は選ばない', () => {
        const rows = ['.........', '.XO......', 'XO.O.....', '.XO......', '.........', '.........', '.........', '.........', '.........'];
        const res = tryMove(boardOf(rows), 9, at(9, 2, 2), BLACK);
        const r = search({ board: res.board, size: 9, toPlay: WHITE, ko: res.ko, komi: 6.5, ply: 10, lastMove: at(9, 2, 2) }, { playouts: 800, seed: 1 });
        expect(r.move).not.toBe(res.ko);
        expect(r.children.some(ch => ch.move === res.ko)).toBe(false);
    });

    it('打ち切りは回数で決まる（時間は安全弁）', () => {
        const state = { board: createBoard(9), size: 9, toPlay: BLACK, komi: 6.5, ply: 0, lastMove: -1 };
        expect(search(state, { playouts: 123, seed: 1 }).playouts).toBe(123);
        expect(search(state, { playouts: 100000, seed: 1, maxMs: 0 }).playouts).toBeLessThan(100000);
    });
});

describe('持ち主の見込み', () => {
    it('しっかり囲んだ地は、囲んだ色のものになる（乱数のプレイアウトなので、相手の打ち込みで値はぶれる）', () => {
        const board = boardOf([
            '...XO....',
            '...XO....',
            '...XO....',
            '...XO....',
            '...XO....',
            '...XO....',
            '...XO....',
            '...XO....',
            '...XO....'
        ]);
        const own = ownership(board, 9, { komi: 6.5, playouts: 200, seed: boardSeed(board) });
        expect(own[at(9, 4, 1)]).toBeGreaterThan(0.2);
        expect(own[at(9, 4, 7)]).toBeLessThan(-0.2);
    });

    it('盤から作るシードは、同じ盤なら同じ値', () => {
        const board = createBoard(9);
        expect(boardSeed(board, 1)).toBe(boardSeed([...board], 1));
        board[40] = 1;
        expect(boardSeed(board, 1)).not.toBe(boardSeed(createBoard(9), 1));
    });
});
