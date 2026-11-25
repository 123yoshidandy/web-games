import { describe, it, expect } from 'vitest';
import { scoreEdict, monsterPenalty, surroundedMountains, clusters } from '../public/js/scoring.js';
import { EDICT_CARDS } from '../public/js/cards.js';
import { board } from './helpers.js';

// 山のない盤で、カードごとの数え方を確かめる
const b = (...rows) => board(rows, { mountains: false });

describe('得点カード', () => {
    it('16枚すべてに採点がある', () => {
        EDICT_CARDS.forEach(e => expect(typeof scoreEdict(e.id, b())).toBe('number'));
        expect(EDICT_CARDS.length).toBe(16);
    });

    it('見張りの森：端の森', () => {
        expect(scoreEdict('sentinel-wood', b('F....F', '', '', '', '', '.....F', '', '', '', '', '..........F'))).toBe(3);
    });

    it('緑の枝：森のある行と列', () => {
        expect(scoreEdict('greenbough', b('F....F', '', '', '.....F'))).toBe(4);
    });

    it('樹の塔：四方が埋まったか端の森', () => {
        expect(scoreEdict('treetower', b('FA', 'A', '', '', '', '.....F'))).toBe(1);
    });

    it('石の森：森でつながった山', () => {
        expect(scoreEdict('stoneside-forest', b('MFFM', '', '', '', '', '.....MF'))).toBe(6);
        expect(scoreEdict('stoneside-forest', b('MFFM', '.F', '.FM'))).toBe(9);
    });

    it('荒野の砦：6マス以上の村', () => {
        expect(scoreEdict('wildholds', b('VVVVVV', '', 'VVVVV'))).toBe(8);
    });

    it('大都市：山に接しない最大の村', () => {
        expect(scoreEdict('great-city', b('VVVVM', '', 'VVV'))).toBe(3);
    });

    it('盾の門：2番目に大きい村（最大が並べばその大きさ）', () => {
        expect(scoreEdict('shieldgate', b('VVVV', '', 'VVVV'))).toBe(8);
        expect(scoreEdict('shieldgate', b('VVVVV', '', 'VV'))).toBe(4);
        expect(scoreEdict('shieldgate', b('VVVVV'))).toBe(0);
    });

    it('緑金の平原：3種類以上の地形に接する村', () => {
        expect(scoreEdict('greengold-plains', b('FVA', '.W', '', 'FVA'))).toBe(3);
    });

    it('運河の湖：畑に接する水と、水に接する畑', () => {
        expect(scoreEdict('canal-lake', b('WAA'))).toBe(2);
    });

    it('黄金の穀倉：廃墟に接する水と、廃墟の上の畑', () => {
        // 廃墟は (1,5) など
        expect(scoreEdict('golden-granary', b('.....W', '.....A'))).toBe(4);
    });

    it('魔術師の谷：山に接する水は2点、畑は1点', () => {
        expect(scoreEdict('mages-valley', b('MW', 'A'))).toBe(3);
    });

    it('岸辺の広がり：水にも端にも接しない畑のかたまり（水も同じ）', () => {
        expect(scoreEdict('shoreside-expanse', b('W', '', '', '...WA', '', '.....A'))).toBe(3);
    });

    it('境界の地：埋まった行と列', () => {
        expect(scoreEdict('borderlands', b('AAAAAAAAAAA'))).toBe(6);
    });

    it('途切れた道：左と下の端に接する、埋まった斜めの列', () => {
        expect(scoreEdict('broken-road', b('', '', '', '', '', '', '', '', '', 'A', 'AA'))).toBe(6);
        expect(scoreEdict('broken-road', b('', '', '', '', '', '', '', '', '', '', '.A'))).toBe(0);
    });

    it('失われた男爵領：最大の正方形の1辺', () => {
        expect(scoreEdict('lost-barony', b('AAA', 'AAA', 'AAAA', 'A'))).toBe(9);
    });

    it('大釜：四方が埋まったか端の空きマス', () => {
        expect(scoreEdict('cauldrons', b('.A', 'A', '', '', '', '....A', '...A.A', '....A'))).toBe(2);
    });
});

describe('季節の減点と山のコイン', () => {
    it('異形に接する空きマスは、何体に接していても1点', () => {
        expect(monsterPenalty(b('', '', '', '', '', '.....X'))).toBe(4);
        expect(monsterPenalty(b('', '', '', '', '', '....X.X'))).toBe(7);
    });

    it('上下左右が埋まった山を数える', () => {
        // 地図の山 (5,5)
        expect(surroundedMountains(board(['', '', '', '', '.....A', '....AMA', '.....A']))).toBe(1);
        expect(surroundedMountains(board(['', '', '', '', '.....A', '....AMA']))).toBe(0);
    });

    it('かたまりを分ける', () => {
        expect(clusters(b('VV.V', '...V'), 'village').map(g => g.length).sort()).toEqual([2, 2]);
    });
});
