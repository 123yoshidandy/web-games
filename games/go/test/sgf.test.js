import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { toSgf, sgfFileName, resultCode } from '../public/js/sgf.js';
import { players, at } from './helpers.js';

describe('棋譜（SGF）', () => {
    it('盤・コミ・ルール・対局者と、手（パスは空）を書く', () => {
        const game = new Game(players([false, false]), { size: 9, komi: 6.5 });
        game.applyCommand(0, { type: 'move', sq: at(9, 2, 6) });
        game.applyCommand(1, { type: 'move', sq: at(9, 0, 0) });
        game.applyCommand(0, { type: 'pass' });
        const sgf = toSgf(game, { date: '2026-11-25' });
        expect(sgf).toBe('(;GM[1]FF[4]CA[UTF-8]AP[go-web:1]SZ[9]KM[6.5]RU[Japanese]PB[P0]PW[P1]DT[2026-11-25]\n;B[gc];W[aa];B[])\n');
    });

    it('置き碁は AB と HA、結果は RE に書く。名前の ] はエスケープする', () => {
        const game = new Game([{ name: 'a]b' }, { name: 'CPU' }], { size: 19, handicap: 2, komi: 0.5 });
        game.applyCommand(1, { type: 'move', sq: at(19, 2, 3) });
        game.applyCommand(0, { type: 'resign' });
        const sgf = toSgf(game);
        expect(sgf).toContain('PB[a\\]b]');
        expect(sgf).toContain('HA[2]AB[pd][dp]');
        expect(sgf).toContain('RE[W+R]');
        expect(sgf).toContain(';W[dc]');
        expect(sgf).not.toContain('DT[');
    });

    it('結果の書き方', () => {
        expect(resultCode(null)).toBe('');
        expect(resultCode({ winner: 0, reason: 'score', score: { diff: 3.5 } })).toBe('B+3.5');
        expect(resultCode({ winner: 1, reason: 'score', score: { diff: -0.5 } })).toBe('W+0.5');
        expect(resultCode({ winner: null, reason: 'score', score: { diff: 0 } })).toBe('0');
    });

    it('ファイルの名前に、使えない文字を入れない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'C/P U' }], { size: 13 });
        expect(sgfFileName(game)).toBe('go-13路-黒あなた-白C_P_U.sgf');
    });
});
