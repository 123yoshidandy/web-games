import { describe, it, expect } from 'vitest';
import { Position, sqOf, makeMove, makeDrop, KA, GI } from '../public/js/rules.js';
import { moveText } from '../public/js/notation.js';

const text = (sfen, m, prevTo = null) => moveText(Position.fromSfen(sfen), m, prevTo);

describe('棋譜の表記', () => {
    it('初手からの手：同・成・打（盤の同じ駒が行けないときは打を付けない）', () => {
        const pos = Position.initial();
        const play = (m, prevTo = null) => {
            const t = moveText(pos, m, prevTo);
            pos.make(m);
            return t;
        };
        expect(play(makeMove(sqOf(7, 7), sqOf(7, 6)))).toBe('▲７六歩');
        expect(play(makeMove(sqOf(3, 3), sqOf(3, 4)))).toBe('△３四歩');
        expect(play(makeMove(sqOf(8, 8), sqOf(2, 2), true))).toBe('▲２二角成');
        expect(play(makeMove(sqOf(3, 1), sqOf(2, 2)), sqOf(2, 2))).toBe('△同　銀');
        expect(play(makeDrop(KA, sqOf(4, 5)))).toBe('▲４五角');
    });

    it('成・不成', () => {
        const sfen = '4k4/9/9/6S2/9/9/9/9/4K4 b -';
        expect(text(sfen, makeMove(sqOf(3, 4), sqOf(3, 3), true))).toBe('▲３三銀成');
        expect(text(sfen, makeMove(sqOf(3, 4), sqOf(3, 3), false))).toBe('▲３三銀不成');
    });

    it('打：盤の同じ駒もその升へ行けるとき', () => {
        const sfen = '4k4/9/9/9/9/9/9/5S3/4K4 b S';
        expect(text(sfen, makeDrop(GI, sqOf(5, 7)))).toBe('▲５七銀打');
        expect(text(sfen, makeMove(sqOf(4, 8), sqOf(5, 7)))).toBe('▲５七銀');
    });

    it('右・左', () => {
        const sfen = '4k4/9/9/9/9/9/9/9/3GKG3 b -';
        expect(text(sfen, makeMove(sqOf(4, 9), sqOf(5, 8)))).toBe('▲５八金右');
        expect(text(sfen, makeMove(sqOf(6, 9), sqOf(5, 8)))).toBe('▲５八金左');
        // 後手は向きが逆（後手から見た右は、筋の大きい方）
        const gote = '3gkg3/9/9/9/9/9/9/9/4K4 w -';
        expect(text(gote, makeMove(sqOf(6, 1), sqOf(5, 2)))).toBe('△５二金右');
        expect(text(gote, makeMove(sqOf(4, 1), sqOf(5, 2)))).toBe('△５二金左');
    });

    it('直・寄・上・引', () => {
        const gold = '4k4/9/9/9/9/9/9/5G3/K3G4 b -';
        expect(text(gold, makeMove(sqOf(5, 9), sqOf(5, 8)))).toBe('▲５八金直');
        expect(text(gold, makeMove(sqOf(4, 8), sqOf(5, 8)))).toBe('▲５八金寄');
        const silver = '4k4/9/9/9/9/9/5S3/9/K2S5 b -';
        expect(text(silver, makeMove(sqOf(4, 7), sqOf(5, 8)))).toBe('▲５八銀引');
        expect(text(silver, makeMove(sqOf(6, 9), sqOf(5, 8)))).toBe('▲５八銀上');
    });
});
