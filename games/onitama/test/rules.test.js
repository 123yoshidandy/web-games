import { describe, it, expect } from 'vitest';
import { CARDS, CARD_IDS, target, initialBoard, legalMoves, pieceOf, seatOf, isMaster } from '../public/js/rules.js';

// 照らし合わせた動き（持ち主から見て [右, 前]）。Arcane Wonders 版のルールブックの図・複数の実装のデータと一致した
const EXPECTED = {
    tiger: [[0, 2], [0, -1]], dragon: [[-2, 1], [2, 1], [-1, -1], [1, -1]], frog: [[-2, 0], [-1, 1], [1, -1]],
    rabbit: [[2, 0], [1, 1], [-1, -1]], crab: [[-2, 0], [2, 0], [0, 1]], elephant: [[-1, 1], [1, 1], [-1, 0], [1, 0]],
    goose: [[-1, 1], [-1, 0], [1, 0], [1, -1]], rooster: [[1, 1], [-1, 0], [1, 0], [-1, -1]], monkey: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
    mantis: [[-1, 1], [1, 1], [0, -1]], horse: [[-1, 0], [0, 1], [0, -1]], ox: [[1, 0], [0, 1], [0, -1]],
    crane: [[0, 1], [-1, -1], [1, -1]], boar: [[-1, 0], [1, 0], [0, 1]], eel: [[-1, 1], [-1, -1], [1, 0]], cobra: [[-1, 0], [1, 1], [1, -1]]
};
const BLUE = ['tiger', 'rabbit', 'crab', 'goose', 'monkey', 'ox', 'crane', 'eel'];

const sorted = (moves) => moves.map(m => m.join(',')).sort();

describe('動きのカード', () => {
    it('16枚で、動きは照らし合わせた表のとおり', () => {
        expect(CARD_IDS).toHaveLength(16);
        CARD_IDS.forEach(id => expect(sorted(CARDS[id].moves), id).toEqual(sorted(EXPECTED[id])));
    });

    it('印の色は藍（青）8枚・朱（赤）8枚', () => {
        CARD_IDS.forEach(id => expect(CARDS[id].stamp, id).toBe(BLUE.includes(id) ? 'blue' : 'red'));
    });

    it('左右が逆の組（蛙と兎、鵞鳥と雄鶏、鰻と蛇、馬と牛）は、左右を入れ替えると同じ動き', () => {
        const mirror = (id) => sorted(CARDS[id].moves.map(([x, y]) => [-x, y]));
        [['frog', 'rabbit'], ['goose', 'rooster'], ['eel', 'cobra'], ['horse', 'ox']].forEach(([a, b]) => expect(mirror(a)).toEqual(sorted(CARDS[b].moves)));
        ['tiger', 'dragon', 'crab', 'elephant', 'monkey', 'mantis', 'crane', 'boar'].forEach(id => expect(mirror(id)).toEqual(sorted(CARDS[id].moves)));
    });
});

describe('盤', () => {
    it('席0（藍）は下の段、席1（朱）は上の段。師匠は真ん中', () => {
        const b = initialBoard();
        expect(b.slice(20)).toEqual([1, 1, 2, 1, 1]);
        expect(b.slice(0, 5)).toEqual([3, 3, 4, 3, 3]);
        expect(seatOf(pieceOf(1, true))).toBe(1);
        expect(isMaster(pieceOf(0, true))).toBe(true);
    });

    it('前は自分から見た前。席1は盤を180度回した向きになる', () => {
        // 真ん中（12）から「前に2」：席0は上（2）、席1は下（22）
        expect(target(0, 12, [0, 2])).toBe(2);
        expect(target(1, 12, [0, 2])).toBe(22);
        // 「右に1」：席0は右（13）、席1は左（11）
        expect(target(0, 12, [1, 0])).toBe(13);
        expect(target(1, 12, [1, 0])).toBe(11);
        // 盤の外
        expect(target(0, 20, [-1, 0])).toBe(-1);
        expect(target(1, 2, [0, -1])).toBe(-1);
    });

    it('最初の局面で、虎は前に2（弟子と師匠の5つ）だけ動ける', () => {
        const state = { board: initialBoard(), hands: [['tiger', 'crab'], ['ox', 'eel']] };
        const tiger = legalMoves(state, 0).filter(m => m.card === 'tiger');
        expect(tiger.map(m => m.to).sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14]);
    });
});
