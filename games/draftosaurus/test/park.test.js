import { describe, it, expect } from 'vitest';
import { scorePark, legalZones, fitsZone, dieAllows, placementGain } from '../public/js/park.js';
import { ZONES, ENCLOSURES } from '../public/js/dinos.js';
import { park } from './helpers.js';

const score = (p, others = []) => scorePark([p, ...others], 0);

describe('囲いの決まり', () => {
    it('同じ種類の森は、同じ種類だけ、6 匹まで', () => {
        expect(fitsZone(park(), 'forest', 'trex')).toBe(true);
        expect(fitsZone(park({ forest: 'tri' }), 'forest', 'tri')).toBe(true);
        expect(fitsZone(park({ forest: 'tri' }), 'forest', 'stego')).toBe(false);
        expect(fitsZone(park({ forest: 'tri tri tri tri tri tri' }), 'forest', 'tri')).toBe(false);
    });

    it('違う種類の草原は、まだいない種類だけ', () => {
        expect(fitsZone(park({ meadow: 'tri stego' }), 'meadow', 'para')).toBe(true);
        expect(fitsZone(park({ meadow: 'tri stego' }), 'meadow', 'tri')).toBe(false);
    });

    it('3 匹の木は 3 匹、王の座と島は 1 匹まで。恋人の草原と川は上限なし', () => {
        expect(fitsZone(park({ love: 'tri tri tri tri tri tri tri tri' }), 'love', 'stego')).toBe(true);
        expect(fitsZone(park({ trio: 'a b' }), 'trio', 'tri')).toBe(true);
        expect(fitsZone(park({ trio: 'a b c' }), 'trio', 'tri')).toBe(false);
        expect(fitsZone(park({ king: 'tri' }), 'king', 'stego')).toBe(false);
        expect(fitsZone(park({ island: 'tri' }), 'island', 'stego')).toBe(false);
        expect(fitsZone(park({ river: 'a b c d e f g h i j k' }), 'river', 'tri')).toBe(true);
    });
});

describe('夏の面の区分', () => {
    it('川の左（カフェの側）に森・3 匹の木・恋人の草原、右（トイレの側）に王の座・違う種類の草原・島', () => {
        const where = k => `${ZONES[k].side}/${ZONES[k].area}`;
        expect(['forest', 'trio', 'love'].map(where)).toEqual(['left/woods', 'left/woods', 'left/grass']);
        expect(['king', 'meadow', 'island'].map(where)).toEqual(['right/woods', 'right/grass', 'right/grass']);
    });
});

describe('配置ダイス', () => {
    it('森・草原・トイレ・カフェの面は、囲いの区分で決まる', () => {
        const p = park();
        ENCLOSURES.forEach(zone => {
            expect(dieAllows(p, zone, 'woods')).toBe(ZONES[zone].area === 'woods');
            expect(dieAllows(p, zone, 'grass')).toBe(ZONES[zone].area === 'grass');
            expect(dieAllows(p, zone, 'toilet')).toBe(ZONES[zone].side === 'right');
            expect(dieAllows(p, zone, 'cafe')).toBe(ZONES[zone].side === 'left');
        });
    });

    it('空きの面は、1 匹もいない囲いだけ。ティラノなしの面は、ティラノのいない囲いだけ', () => {
        const p = park({ forest: 'tri', love: 'trex' });
        expect(dieAllows(p, 'forest', 'empty')).toBe(false);
        expect(dieAllows(p, 'meadow', 'empty')).toBe(true);
        expect(dieAllows(p, 'forest', 'notrex')).toBe(true);
        expect(dieAllows(p, 'love', 'notrex')).toBe(false);
    });

    it('川には、ダイスに関係なくいつでも置ける', () => {
        DIE_FACES_KEYS.forEach(face => expect(legalZones(park(), 'tri', face)).toContain('river'));
    });

    it('ダイスを振った人は、ダイスの決まりを受けない（囲いの決まりは受ける）', () => {
        const p = park({ forest: 'tri', king: 'stego' });
        const zones = legalZones(p, 'para', 'empty', true);
        expect(zones).not.toContain('forest');
        expect(zones).not.toContain('king');
        expect(zones).toEqual(expect.arrayContaining(['meadow', 'love', 'trio', 'island', 'river']));
        expect(legalZones(p, 'para', 'empty', false)).not.toContain('forest');
    });

    it('ダイスの決まりで置ける囲いがなくても、川には置ける', () => {
        const p = park({ forest: 'tri', meadow: 'tri', love: 'tri', trio: 'tri', king: 'tri', island: 'tri' });
        expect(legalZones(p, 'stego', 'empty')).toEqual(['river']);
    });
});

const DIE_FACES_KEYS = ['woods', 'grass', 'toilet', 'cafe', 'empty', 'notrex'];

describe('得点', () => {
    it('同じ種類の森：1〜6 匹で 2・4・8・12・18・24 点', () => {
        [2, 4, 8, 12, 18, 24].forEach((pts, i) => {
            expect(score(park({ forest: Array(i + 1).fill('stego').join(' ') })).forest).toBe(pts);
        });
    });

    it('違う種類の草原：1〜6 匹で 1・3・6・10・15・21 点', () => {
        const kinds = ['tri', 'stego', 'brachio', 'para', 'spino', 'trex'];
        [1, 3, 6, 10, 15, 21].forEach((pts, i) => {
            expect(score(park({ meadow: kinds.slice(0, i + 1).join(' ') })).meadow).toBe(pts);
        });
    });

    it('恋人の草原：同じ種類の 2 匹の組ごとに 5 点', () => {
        expect(score(park({ love: 'tri tri stego' })).love).toBe(5);
        expect(score(park({ love: 'tri tri tri tri stego stego' })).love).toBe(15);
        expect(score(park({ love: 'tri tri tri' })).love).toBe(5);
        expect(score(park({ love: 'tri stego para' })).love).toBe(0);
    });

    it('3 匹の木：ちょうど 3 匹で 7 点', () => {
        expect(score(park({ trio: 'tri stego' })).trio).toBe(0);
        expect(score(park({ trio: 'tri stego para' })).trio).toBe(7);
    });

    it('王の座：その種類を自分より多く持つ人がいなければ 7 点（同じ数なら得点する）', () => {
        // 自分は王の座と川に 1 匹ずつ、合わせて 2 匹
        const me = park({ king: 'tri', river: 'tri' });
        expect(score(me, [park({ forest: 'tri' })]).king).toBe(7);
        expect(score(me, [park({ forest: 'tri tri' })]).king).toBe(7);
        expect(score(me, [park(), park({ forest: 'tri tri tri' })]).king).toBe(0);
        expect(score(me, [park({ forest: 'tri' }), park({ meadow: 'tri', love: 'tri' })]).king).toBe(7);
    });

    it('ひとりぼっちの島：その種類が公園で 1 匹だけなら 7 点', () => {
        expect(score(park({ island: 'spino' })).island).toBe(7);
        expect(score(park({ island: 'spino', river: 'spino' })).island).toBe(0);
        expect(score(park({ island: 'spino', love: 'spino' })).island).toBe(0);
    });

    it('川は 1 匹 1 点。ティラノサウルスは、いる囲いごとに 1 点（川は数えない）', () => {
        const s = score(park({ river: 'tri stego trex', forest: 'trex trex', love: 'trex' }));
        expect(s.river).toBe(3);
        expect(s.trex).toBe(2);
        expect(s.total).toBe(3 + 4 + 0 + 2);
    });

    it('置いたときの点の増え方は、減ることもある（島と同じ種類を置く）', () => {
        const p = park({ island: 'para' });
        expect(placementGain([p], 0, 'para', 'river')).toBe(1 - 7);
        expect(placementGain([p], 0, 'tri', 'river')).toBe(1);
        expect(placementGain([park({ forest: 'tri tri' })], 0, 'tri', 'forest')).toBe(4);
    });
});
