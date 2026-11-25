import { describe, it, expect } from 'vitest';
import { evaluateWin, handPoints, basePoints, decompose } from '../public/js/scoring.js';
import { parseTiles, toCounts } from '../public/js/tiles.js';

// 手（和了牌を除く）・和了牌・鳴き・状況から評価する。既定は南家（子）・東場・ロン
function win(handText, winText, options = {}) {
    const used = new Set();
    const melds = (options.melds ?? []).map(([type, text]) => ({ type, tiles: parseTiles(text, used) }));
    const hand = parseTiles(handText, used);
    const winTile = parseTiles(winText, used)[0];
    return evaluateWin({
        tsumo: false, seatWind: 28, roundWind: 27, dealer: false, riichi: 0,
        ...options,
        hand: [...hand, winTile], melds, winTile,
        doraIndicators: options.dora ? parseTiles(options.dora, used) : [],
        uraIndicators: options.ura ? parseTiles(options.ura, used) : []
    });
}

const names = (r) => r.yaku.map(y => y.name);
const ron = (r, dealer = false, honba = 0) => handPoints(r.han, r.fu, { dealer, yakuman: r.yakuman, honba }).ron;
const tsumo = (r, dealer = false) => handPoints(r.han, r.fu, { dealer, tsumo: true, yakuman: r.yakuman });

describe('点数表', () => {
    it('子のロン', () => {
        expect(handPoints(1, 30).ron).toBe(1000);
        expect(handPoints(1, 40).ron).toBe(1300);
        expect(handPoints(2, 25).ron).toBe(1600);
        expect(handPoints(2, 30).ron).toBe(2000);
        expect(handPoints(3, 30).ron).toBe(3900);
        expect(handPoints(3, 40).ron).toBe(5200);
        expect(handPoints(4, 30).ron).toBe(7700); // 切り上げ満貫なし
        expect(handPoints(4, 40).ron).toBe(8000);
        expect(handPoints(1, 110).ron).toBe(3600);
        expect(handPoints(6, 30).ron).toBe(12000);
        expect(handPoints(8, 30).ron).toBe(16000);
        expect(handPoints(11, 30).ron).toBe(24000);
        expect(handPoints(13, 30).ron).toBe(32000);
    });

    it('親のロン', () => {
        expect(handPoints(1, 30, { dealer: true }).ron).toBe(1500);
        expect(handPoints(2, 30, { dealer: true }).ron).toBe(2900);
        expect(handPoints(3, 30, { dealer: true }).ron).toBe(5800);
        expect(handPoints(4, 30, { dealer: true }).ron).toBe(11600);
        expect(handPoints(5, 30, { dealer: true }).ron).toBe(12000);
        expect(handPoints(0, 0, { dealer: true, yakuman: 1 }).ron).toBe(48000);
    });

    it('ツモ（子は 子の払い/親の払い、親は全員の払い）', () => {
        expect(handPoints(1, 30, { tsumo: true })).toMatchObject({ child: 300, dealer: 500 });
        expect(handPoints(2, 20, { tsumo: true })).toMatchObject({ child: 400, dealer: 700 });
        expect(handPoints(3, 20, { tsumo: true })).toMatchObject({ child: 700, dealer: 1300 });
        expect(handPoints(3, 25, { tsumo: true })).toMatchObject({ child: 800, dealer: 1600 });
        expect(handPoints(4, 30, { tsumo: true })).toMatchObject({ child: 2000, dealer: 3900 });
        expect(handPoints(5, 30, { tsumo: true })).toMatchObject({ child: 2000, dealer: 4000 });
        expect(handPoints(1, 30, { tsumo: true, dealer: true })).toMatchObject({ child: 500, total: 1500 });
        expect(handPoints(2, 20, { tsumo: true, dealer: true })).toMatchObject({ child: 700, total: 2100 });
        expect(handPoints(3, 30, { tsumo: true, dealer: true })).toMatchObject({ child: 2000, total: 6000 });
    });

    it('本場は、ロンで300、ツモで1人100ずつ', () => {
        expect(handPoints(1, 30, { honba: 2 }).ron).toBe(1600);
        expect(handPoints(1, 30, { tsumo: true, honba: 1 })).toMatchObject({ child: 400, dealer: 600, total: 1400 });
    });

    it('基本点', () => {
        expect(basePoints(3, 70)).toBe(2000);
        expect(basePoints(2, 30)).toBe(480);
    });
});

describe('役と符', () => {
    it('平和・断幺九のロン：2翻30符 2000点', () => {
        const r = win('234m567p45s678s22p', '3s');
        expect(names(r)).toEqual(['平和', '断幺九']);
        expect([r.han, r.fu]).toEqual([2, 30]);
        expect(ron(r)).toBe(2000);
    });

    it('平和ツモは20符：門前清自摸和・平和・断幺九 3翻20符 700/1300', () => {
        const r = win('234m567p45s678s22p', '6s', { tsumo: true });
        expect(names(r)).toEqual(expect.arrayContaining(['門前清自摸和', '平和', '断幺九']));
        expect([r.han, r.fu]).toEqual([3, 20]);
        expect(tsumo(r)).toMatchObject({ child: 700, dealer: 1300 });
    });

    it('七対子のツモ：25符3翻 800/1600', () => {
        const r = win('11m33m55p77p22s33z4z', '4z', { tsumo: true });
        expect(names(r)).toEqual(['門前清自摸和', '七対子']);
        expect([r.han, r.fu]).toEqual([3, 25]);
        expect(tsumo(r)).toMatchObject({ child: 800, dealer: 1600 });
    });

    it('役牌の中を鳴いた単騎：1翻30符（20+明刻の字牌4+単騎2=26→30）', () => {
        const r = win('123m456p789s5p', '5p', { melds: [['pon', '777z']] });
        expect(names(r)).toEqual(['役牌 中']);
        expect([r.han, r.fu]).toEqual([1, 30]);
        expect(ron(r)).toBe(1000);
    });

    it('喰いタン＋赤ドラ：鳴いた平和の形のロンは30符', () => {
        const r = win('234p678p55s34s', '2s', { melds: [['chi', '340m']] });
        expect(names(r)).toEqual(['断幺九', '赤ドラ']);
        expect([r.han, r.fu]).toEqual([2, 30]);
        expect(ron(r)).toBe(2000);
    });

    it('役がなければ和了にならない', () => {
        expect(win('456p789p34s11z', '5s', { melds: [['chi', '123m']] })).toBe(null);
        expect(win('123m456p789s13s11z', '2s')).toBe(null);
    });

    it('連風牌の雀頭は4符：親の立直・嵌張のロン 40符1翻 2000点', () => {
        const r = win('123m456p789s13s11z', '2s', { seatWind: 27, dealer: true, riichi: 1 });
        expect([r.han, r.fu]).toEqual([1, 40]);
        expect(ron(r, true)).toBe(2000);
    });

    it('立直・一発・ツモ・平和に裏ドラが乗って満貫', () => {
        const r = win('123m456p567s78s99s', '9s', { tsumo: true, riichi: 1, ippatsu: true, ura: '1m' });
        expect(names(r)).toEqual(['立直', '一発', '門前清自摸和', '平和', '裏ドラ']);
        expect([r.han, r.fu]).toEqual([5, 20]);
        expect(tsumo(r)).toMatchObject({ child: 2000, dealer: 4000 });
    });

    it('裏ドラは立直していなければ数えない。ドラは表示牌の次', () => {
        const r = win('123m456p567s78s99s', '9s', { tsumo: true, ura: '1m', dora: '9m' });
        expect(names(r)).toEqual(['門前清自摸和', '平和', 'ドラ']);
        expect(r.dora).toEqual({ dora: 1, aka: 0, ura: 0 });
    });

    it('清一色・一盃口：7翻の跳満 12000点', () => {
        const r = win('223344567678p9p', '9p');
        expect(names(r)).toEqual(expect.arrayContaining(['清一色', '一盃口']));
        expect(r.han).toBe(7);
        expect(r.limit).toBe('跳満');
        expect(ron(r)).toBe(12000);
    });

    it('数え役満：13翻以上', () => {
        const r = win('223344567678p9p', '9p', { tsumo: true, riichi: 1, dora: '1p3p' });
        expect(r.han).toBe(13);
        expect(r.limit).toBe('数え役満');
        expect(tsumo(r)).toMatchObject({ child: 8000, dealer: 16000 });
    });

    it('三色同順（門前2翻）と一気通貫（鳴き1翻）', () => {
        const a = win('123m123p123s456m9s', '9s', { riichi: 1 });
        expect(names(a)).toContain('三色同順');
        expect(a.yaku.find(y => y.name === '三色同順').han).toBe(2);
        const b = win('456m789m11z22z', '2z', { melds: [['chi', '123m']] });
        expect(b.yaku.find(y => y.name === '一気通貫').han).toBe(1);
    });

    it('対々和・三暗刻（ロンで完成した刻子は明刻）', () => {
        const r = win('111m333p555s2277z', '7z');
        expect(names(r)).toEqual(expect.arrayContaining(['役牌 中', '対々和', '三暗刻']));
        expect(r.han).toBe(5);
        expect(ron(r)).toBe(8000);
    });

    it('混全帯幺九・純全帯幺九', () => {
        const a = win('123m789p11z999s78m', '9m', { riichi: 1 });
        expect(names(a)).toContain('混全帯幺九');
        const b = win('123m789p11s999s78m', '9m', { riichi: 1 });
        expect(names(b)).toContain('純全帯幺九');
        expect(b.yaku.find(y => y.name === '純全帯幺九').han).toBe(3);
    });

    it('混一色（鳴き2翻）と小三元', () => {
        const r = win('123m456m55z66z', '6z', { melds: [['pon', '777z']] });
        expect(names(r)).toEqual(expect.arrayContaining(['混一色', '小三元', '役牌 中', '役牌 發']));
        expect(r.yaku.find(y => y.name === '混一色').han).toBe(2);
    });

    it('二盃口は一盃口と七対子より高く取る', () => {
        const r = win('223344m556677p8p', '8p', { riichi: 1 });
        expect(names(r)).toContain('二盃口');
        expect(names(r)).not.toContain('七対子');
    });

    it('状況の役：嶺上開花・海底摸月・河底撈魚・槍槓', () => {
        expect(names(win('123m456p789s4p', '4p', { tsumo: true, rinshan: true, melds: [['ankan', '2222z']] }))).toContain('嶺上開花');
        expect(names(win('123m456p789p4s', '4s', { melds: [['chi', '678s']], tsumo: true, haitei: true }))).toEqual(['海底摸月']);
        expect(names(win('123m456p789p4s', '4s', { melds: [['chi', '678s']], houtei: true }))).toEqual(['河底撈魚']);
        expect(names(win('123m456p789p4s', '4s', { melds: [['chi', '678s']], chankan: true }))).toEqual(['槍槓']);
    });

    it('暗槓の符：么九牌の暗槓は32符', () => {
        const r = win('234m567p45s22p', '3s', { melds: [['ankan', '1111z']], riichi: 1 });
        // 20 + 門前ロン10 + 暗槓の字牌32 = 62 → 70符
        expect(r.fu).toBe(70);
    });
});

describe('役満', () => {
    it('国士無双', () => {
        const r = win('19m19p19s1234567z', '1m');
        expect(names(r)).toEqual(['国士無双']);
        expect(ron(r)).toBe(32000);
        expect(ron(r, true)).toBe(48000);
    });

    it('四暗刻はツモだけ。ロンなら対々和・三暗刻', () => {
        const r = win('111m333p555s2277z', '7z', { tsumo: true });
        expect(names(r)).toEqual(['四暗刻']);
        expect(tsumo(r)).toMatchObject({ child: 8000, dealer: 16000 });
        expect(win('111m333p555s2277z', '7z').yakuman).toBe(0);
    });

    it('大三元・字一色・緑一色・清老頭・九蓮宝燈・小四喜・大四喜・四槓子', () => {
        expect(names(win('555z666z77z11m', '7z', { melds: [['pon', '999m']] }))).toEqual(['大三元']);
        expect(names(win('111z222z333z555z6z', '6z'))).toContain('字一色');
        expect(names(win('234s234s666s8s', '8s', { melds: [['pon', '666z']] }))).toContain('緑一色');
        expect(names(win('111m999m111p9s', '9s', { melds: [['pon', '999p']] }))).toEqual(['清老頭']);
        expect(names(win('1112345678999m', '5m'))).toEqual(['九蓮宝燈']);
        expect(names(win('111z222z333z44z23m', '1m'))).toEqual(['小四喜']);
        // 四暗刻の単騎も重なって3倍役満（ダブル役満は数えない）
        expect(names(win('111z222z333z444z5z', '5z'))).toEqual(['四暗刻', '大四喜', '字一色']);
        expect(win('111z222z333z444z5z', '5z').yakuman).toBe(3);
        expect(names(win('5m', '5m', {
            melds: [['ankan', '1111m'], ['minkan', '2222p'], ['kakan', '3333s'], ['ankan', '5555z']]
        }))).toEqual(['四槓子']);
    });

    it('天和・地和', () => {
        expect(names(win('234m567p45s678s22p', '3s', { tsumo: true, tenhou: true }))).toEqual(['天和']);
        expect(names(win('234m567p45s678s22p', '3s', { tsumo: true, chiihou: true }))).toEqual(['地和']);
    });
});

describe('面子の分け方', () => {
    it('111222333 は刻子3つと順子3つの両方に分けられる', () => {
        const counts = toCounts(parseTiles('111222333m44p567s'));
        const list = decompose(counts);
        expect(list.length).toBe(2);
    });
});
