import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseMove, decide, think, runCpuStep, CPU_LEVELS, LEVELS } from '../public/js/cpu-player.js';
import { analyze, bruteForce, WIN } from '../public/js/engine.js';
import { legalMoves, applyMove, initialBoard, sqName, colorOf } from '../public/js/rules.js';
import { createRandom } from '../public/js/random.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';
import { boardOf } from './helpers.js';

const viewOf = (rows, current, ply = 20) => ({ board: boardOf(rows), current, ply, moves: legalMoves(boardOf(rows), colorOf(current)) });

// 読み切りの点（勝ちは WIN を足してある）を石の差に戻す
const discs = (score) => score > WIN / 2 ? score - WIN : score < -WIN / 2 ? score + WIN : 0;

// シード付きの乱数で、空きが empties になるまで打った局面（手番の人が置けるもの）
function randomPosition(seed, empties) {
    const random = createRandom(seed);
    let board = initialBoard();
    let color = 1;
    while (board.filter(s => !s).length > empties) {
        let moves = legalMoves(board, color);
        if (!moves.length) {
            color = 3 - color;
            moves = legalMoves(board, color);
            if (!moves.length) return null;
        }
        board = applyMove(board, moves[Math.floor(random() * moves.length)], color).board;
        color = 3 - color;
    }
    if (!legalMoves(board, color).length) return null;
    return { board, color };
}

describe('CPU どうしの試合', () => {
    it('どの強さの組み合わせでも、最後まで止まらずに終わる', () => {
        const pairs = [
            ...Array.from({ length: 6 }, (_, i) => [['easy', 'easy'], i]),
            ...Array.from({ length: 6 }, (_, i) => [['normal', 'normal'], i]),
            [['strong', 'easy'], 1], [['easy', 'strong'], 2],
            [['expert', 'normal'], 3]
        ];
        pairs.forEach(([levels, seed]) => {
            const { game } = playMatch({ levels, seed });
            expect(game.isOver(), `${levels} ${seed}`).toBe(true);
            const { black, white, empty } = game.counts();
            expect(black + white + empty).toBe(64);
        });
    });

    it('ふつうはやさしいに、つよいはふつうに勝ち越す', () => {
        const a = runMatches({ games: 20, a: 'normal', b: 'easy' });
        expect(a.stuck).toBe(0);
        expect(a.winsA).toBeGreaterThanOrEqual(15);
        const b = runMatches({ games: 6, a: 'strong', b: 'normal' });
        expect(b.stuck).toBe(0);
        expect(b.winsA).toBeGreaterThan(b.winsB);
    });
});

describe('CPU の判断', () => {
    it('どの強さも、相手の石をすべて返す手（即勝ち）を選ぶ', () => {
        const cases = [
            [['........', '........', '........', '..XXX...', '..XXO...', '..XXOXX.', '....O...', '........'], 0, 'e8'],
            [['........', '........', '..XOOO..', '...XXO..', '...XOX..', '...X....', '...X....', '........'], 0, 'g3'],
            [['........', '...O....', '.XXOXX..', '...OXX..', '...XXX..', '........', '........', '........'], 0, 'd1']
        ];
        cases.forEach(([rows, current, win]) => {
            expect(viewOf(rows, current).moves.length).toBeGreaterThanOrEqual(3);
            CPU_LEVELS.forEach(level => expect(sqName(chooseMove(viewOf(rows, current), level)), `${level} ${win}`).toBe(win));
        });
    });

    it('どの強さも、相手にすべて返される手（即負け）を避ける', () => {
        const cases = [
            [['........', '.....X..', '...XX...', '...XO...', '...XXXXX', '.....O..', '........', '........'], 1, ['e6']],
            [['........', '.....X..', '...XX...', '.XOOX...', '.XXXXX..', '.X......', '........', '........'], 1, ['f4']],
            [['........', '........', '........', '..XXX...', '..XXO...', '..XXXXX.', '........', '........'], 1, ['c3', 'e3', 'e7', 'g7']]
        ];
        cases.forEach(([rows, current, losing]) => {
            CPU_LEVELS.forEach(level => expect(losing, level).not.toContain(sqName(chooseMove(viewOf(rows, current), level))));
        });
    });

    it('終盤の読み切りは、枝刈りなしで最後まで読んだ結果と同じ石の差になり、その手を選ぶ', () => {
        let checked = 0;
        for (let seed = 1; checked < 12; seed++) {
            const pos = randomPosition(seed, 9);
            if (!pos) continue;
            checked++;
            const best = bruteForce(pos.board, pos.color);
            const result = analyze(pos.board, pos.color, LEVELS.strong);
            expect(result.exact).toBe(true);
            expect(Math.max(...result.scored.map(s => discs(s.score))), `seed ${seed}`).toBe(best);
            // CPU の選んだ手を打ったあと、相手が最善を尽くしても同じ石の差になる
            const view = { board: pos.board, current: pos.color - 1, ply: 51 };
            ['strong', 'expert'].forEach(level => {
                const sq = chooseMove(view, level);
                const next = applyMove(pos.board, sq, pos.color).board;
                expect(-bruteForce(next, 3 - pos.color), `seed ${seed} ${level}`).toBe(best);
            });
        }
    });

    it('パスをはさむ終盤も正しく読み切る', () => {
        // 白は置けるが、置いたあと黒が置けずにパスになる形
        const rows = ['XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXO', 'XXXXXX..', 'XXXXXX.O', 'XXXXXXX.'];
        const board = boardOf(rows);
        [1, 2].forEach(color => {
            if (!legalMoves(board, color).length) return;
            const r = analyze(board, color, LEVELS.normal);
            expect(r.exact).toBe(true);
            expect(Math.max(...r.scored.map(s => discs(s.score)))).toBe(bruteForce(board, color));
        });
    });

    it('読み切りをあきらめたときは、そこまでに読んだ局面も中盤の読みの上限に数える', () => {
        const pos = randomPosition(3, 14);
        const opt = { depth: 2, maxDepth: 8, nodeLimit: 3000, exact: 14, exactLimit: 2000 };
        const r = analyze(pos.board, pos.color, opt);
        expect(r.exact).toBe(false);
        expect(r.depth).toBeGreaterThanOrEqual(2);
        expect(r.nodes).toBeLessThanOrEqual(opt.nodeLimit + 1);
        expect(r.scored.length).toBe(legalMoves(pos.board, pos.color).length);
    });

    it('CPU は自分の席のビューだけで決め、同じビューなら同じ手を選ぶ（JSON にしても同じ）', () => {
        const game = new Game([{ name: 'a', isCPU: true, cpuLevel: 'normal' }, { name: 'b', isCPU: true, cpuLevel: 'normal' }]);
        for (let i = 0; i < 12; i++) {
            const view = createGameView(game, game.current);
            const json = JSON.parse(JSON.stringify(view));
            const command = decide(json, 'normal');
            expect(decide(view, 'normal')).toEqual(command);
            expect(runCpuStep(game)).toBe(true);
            expect(game.commands.at(-1).command).toEqual(command);
        }
    });

    it('読む量は局面の数で打ち切り、時間は使わない（端末の速さで手が変わらない）', () => {
        const view = createGameView(new Game([{ name: 'a' }, { name: 'b' }]), 0);
        ['strong', 'expert'].forEach(level => {
            const r = think(view, level);
            expect(r.nodes).toBeLessThanOrEqual(LEVELS[level].nodeLimit + 1);
            expect(r.depth).toBeGreaterThanOrEqual(LEVELS[level].depth);
            expect(think(view, level)).toEqual(r);
        });
        expect(sqName(chooseMove(view, 'expert'))).toMatch(/^(d3|c4|f5|e6)$/);
    });
});
