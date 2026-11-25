import { describe, it, expect } from 'vitest';
import { scorePlayer, scoreAll } from '../public/js/rules.js';
import { KING_CARD_IDS } from '../public/js/boards.js';
import { cellOf } from './helpers.js';

// 草原だけの地形に、指定のマスだけ別の地形を置いた状態を作る
function state(special, houses, nPlayers = 2) {
    const terrain = Array(400).fill('G');
    Object.entries(special).forEach(([cell, t]) => { terrain[cell] = t; });
    const owner = Array(400).fill(-1);
    houses.forEach((cells, seat) => cells.forEach(cell => { owner[cell] = seat; }));
    return {
        terrain: terrain.join(''),
        owner,
        locations: [],
        cards: [...KING_CARD_IDS],
        players: Array.from({ length: nPlayers }, () => ({ supply: 40, card: null, tiles: [] }))
    };
}
const card = (s, seat, id) => scorePlayer(s, seat).cards[KING_CARD_IDS.indexOf(id)];

describe('王のカードの得点', () => {
    it('漁師：水に隣接する家1軒につき1点。水の上の家は数えない', () => {
        const s = state({ [cellOf(3, 3)]: 'W' }, [[cellOf(3, 4), cellOf(3, 2), cellOf(3, 3), cellOf(8, 8)]]);
        expect(card(s, 0, 'fishermen')).toBe(2);
    });

    it('商人：自分の家でつないだ場所と城1つにつき4点。場所を挟んだ集落どうしもつながる', () => {
        // 城(5,3) - 家(5,4) - 場所(5,5) - 家(5,6),(5,7) - 城(5,8)。離れた場所(10,10)は家が1軒隣接するだけ
        const s = state({ [cellOf(5, 3)]: 'K', [cellOf(5, 5)]: 'L', [cellOf(5, 8)]: 'K', [cellOf(10, 10)]: 'L' },
            [[cellOf(5, 4), cellOf(5, 6), cellOf(5, 7), cellOf(10, 11)]]);
        expect(card(s, 0, 'merchants')).toBe(12);
        // 家が1軒しか隣接していない2つの場所は、つながらない
        const t = state({ [cellOf(5, 3)]: 'K', [cellOf(5, 8)]: 'K' }, [[cellOf(5, 4), cellOf(5, 7)]]);
        expect(card(t, 0, 'merchants')).toBe(0);
    });

    it('発見者：家のある横の行1つにつき1点', () => {
        const s = state({}, [[cellOf(0, 0), cellOf(0, 5), cellOf(3, 3), cellOf(19, 19)]]);
        expect(card(s, 0, 'discoverers')).toBe(3);
    });

    it('隠者：集落（1軒でもよい）1つにつき1点。市民：いちばん大きな集落の家2軒につき1点', () => {
        const s = state({}, [[cellOf(0, 0), cellOf(0, 1), cellOf(1, 0), cellOf(5, 5), cellOf(9, 9), cellOf(9, 10), cellOf(9, 11)]]);
        expect(card(s, 0, 'hermits')).toBe(3);
        expect(card(s, 0, 'citizens')).toBe(1);
        const big = state({}, [[0, 1, 2, 3, 4].map(c => cellOf(2, c))]);
        expect(card(big, 0, 'citizens')).toBe(2);
    });

    it('騎士：家がいちばん多い横の行の家1軒につき2点（同数の行が複数でも1行分）', () => {
        const s = state({}, [[cellOf(2, 0), cellOf(2, 5), cellOf(2, 9), cellOf(7, 1), cellOf(7, 2), cellOf(7, 3), cellOf(9, 9)]]);
        expect(card(s, 0, 'knights')).toBe(6);
    });

    it('領主：盤面ごとに1位12点・2位6点。同数の1位は全員12点、2位は次に多い数。家のない盤面は0点', () => {
        // 左上：A3軒 B3軒 C1軒 → A・Bが12点、Cが6点。右上：A2軒 B1軒 → A12点、B6点。左下：Cだけ1軒
        const s = state({}, [
            [cellOf(0, 0), cellOf(0, 1), cellOf(0, 2), cellOf(0, 10), cellOf(0, 11)],
            [cellOf(5, 0), cellOf(5, 1), cellOf(5, 2), cellOf(5, 10)],
            [cellOf(8, 8), cellOf(15, 0)]
        ], 3);
        expect(card(s, 0, 'lords')).toBe(24);
        expect(card(s, 1, 'lords')).toBe(18);
        expect(card(s, 2, 'lords')).toBe(18);
    });

    it('農夫：家がいちばん少ない盤面の家1軒につき3点（家のない盤面があれば0点）', () => {
        const s = state({}, [[cellOf(0, 0), cellOf(0, 1), cellOf(0, 10), cellOf(0, 11), cellOf(10, 0), cellOf(10, 1), cellOf(10, 10), cellOf(10, 11), cellOf(19, 19)]]);
        expect(card(s, 0, 'farmers')).toBe(6);
        const none = state({}, [[cellOf(0, 0), cellOf(0, 10), cellOf(10, 0)]]);
        expect(card(none, 0, 'farmers')).toBe(0);
    });

    it('働き手：場所か城に隣接する家1軒につき1点。坑夫：山に隣接する家1軒につき1点', () => {
        const s = state({ [cellOf(4, 4)]: 'L', [cellOf(8, 8)]: 'K', [cellOf(12, 12)]: 'M' },
            [[cellOf(4, 3), cellOf(4, 5), cellOf(8, 9), cellOf(12, 13), cellOf(12, 11), cellOf(0, 0)]]);
        expect(card(s, 0, 'workers')).toBe(3);
        expect(card(s, 0, 'miners')).toBe(2);
    });

    it('城：隣接する城1つにつき3点（何軒隣接しても3点）。合計は城と3枚の和', () => {
        const s = state({ [cellOf(4, 4)]: 'K', [cellOf(8, 8)]: 'K' }, [[cellOf(4, 3), cellOf(4, 5), cellOf(8, 9)], [cellOf(0, 0)]]);
        s.cards = ['hermits', 'discoverers', 'knights'];
        const score = scorePlayer(s, 0);
        expect(score.castles).toBe(6);
        expect(score.cards).toEqual([3, 2, 4]);
        expect(score.total).toBe(15);
        expect(scoreAll(s).map(x => x.total)).toEqual([15, 4]);
    });
});
