/**
 * 和了の役・符・翻と点数
 * 和了の形を面子と雀頭に分ける方法を全部試し、和了牌がどの面子を完成させたか（待ちの形）も全部試して、
 * 一番点数が高い取り方を採る
 */

import {
    kindOf, isRed, toCounts, isHonor, isTerminal, isYaochu, isSimple, isDragon, isWind,
    suitOf, doraFromIndicator, YAOCHU_KINDS
} from './tiles.js';

const GREEN_KINDS = [19, 20, 21, 23, 25, 32]; // 2索・3索・4索・6索・8索・發
const DRAGON_NAMES = { 31: '役牌 白', 32: '役牌 發', 33: '役牌 中' };

// 14枚の枚数を、雀頭1つと面子に分ける取り方を全部返す
export function decompose(counts) {
    const results = [];
    const c = [...counts];
    const sets = [];
    const collect = (i, pair) => {
        while (i < 34 && c[i] === 0) i++;
        if (i === 34) {
            results.push({ pair, sets: sets.map(s => ({ ...s })) });
            return;
        }
        if (c[i] >= 3) {
            c[i] -= 3; sets.push({ type: 'pon', kind: i });
            collect(i, pair);
            sets.pop(); c[i] += 3;
        }
        if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
            c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ type: 'chi', kind: i });
            collect(i, pair);
            sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
        }
    };
    for (let k = 0; k < 34; k++) {
        if (c[k] < 2) continue;
        c[k] -= 2;
        collect(0, k);
        c[k] += 2;
    }
    return results;
}

const isChiitoi = (counts) => counts.filter(n => n === 2).length === 7;
const isKokushi = (counts) => YAOCHU_KINDS.every(k => counts[k] >= 1) && YAOCHU_KINDS.some(k => counts[k] === 2);

// 基本点（符 × 2^(翻+2)、満貫以上は決まった値）
export function basePoints(han, fu, yakuman = 0) {
    if (yakuman > 0) return 8000 * yakuman;
    if (han >= 13) return 8000;
    if (han >= 11) return 6000;
    if (han >= 8) return 4000;
    if (han >= 6) return 3000;
    if (han >= 5) return 2000;
    return Math.min(2000, fu * 2 ** (han + 2));
}

export function limitName(han, fu, yakuman = 0) {
    if (yakuman >= 2) return `${yakuman}倍役満`;
    if (yakuman === 1) return '役満';
    if (han >= 13) return '数え役満';
    if (han >= 11) return '三倍満';
    if (han >= 8) return '倍満';
    if (han >= 6) return '跳満';
    if (basePoints(han, fu) >= 2000) return '満貫';
    return '';
}

export const ceil100 = (x) => Math.ceil(x / 100) * 100;

// 支払い。ロンは放銃者が ron を払う。ツモは親が dealer、子が child を払う（親の和了なら全員 child）
// 本場は、ロンで 300、ツモで1人 100 ずつ足す
export function payments(base, { dealer, tsumo, honba = 0 }) {
    if (!tsumo) return { ron: ceil100(base * (dealer ? 6 : 4)) + honba * 300 };
    if (dealer) {
        const each = ceil100(base * 2) + honba * 100;
        return { dealer: each, child: each, total: each * 3 };
    }
    const fromDealer = ceil100(base * 2) + honba * 100;
    const fromChild = ceil100(base) + honba * 100;
    return { dealer: fromDealer, child: fromChild, total: fromDealer + fromChild * 2 };
}

// 鳴いた面子を、役の判定に使う形にする
function meldGroup(meld) {
    const kinds = meld.tiles.map(kindOf);
    const kind = Math.min(...kinds);
    if (meld.type === 'chi') return { type: 'chi', kind, open: true, kan: false };
    return { type: 'pon', kind, open: meld.type !== 'ankan', kan: meld.type !== 'pon' };
}

const groupKinds = (g) => (g.type === 'chi' ? [g.kind, g.kind + 1, g.kind + 2] : [g.kind]);

/**
 * 和了を評価する。和了でない・役がないなら null
 * p: {
 *   hand: 手の中の牌（和了牌を含む）, melds: [{ type: 'chi'|'pon'|'minkan'|'kakan'|'ankan', tiles }], winTile, tsumo,
 *   seatWind, roundWind（種類）, dealer, riichi（0・1・2=ダブル立直）, ippatsu, haitei, houtei, rinshan, chankan, tenhou, chiihou,
 *   doraIndicators, uraIndicators（id の配列）
 * }
 * 返り値: { han, fu, yaku: [{ name, han }], yakuman, base, limit, dora }
 */
export function evaluateWin(p) {
    const melds = p.melds ?? [];
    const counts = toCounts(p.hand);
    const winKind = kindOf(p.winTile);
    const closed = melds.every(m => m.type === 'ankan');
    const candidates = [];

    if (melds.length === 0 && isKokushi(counts)) {
        candidates.push(yakumanResult([{ name: '国士無双', yakuman: 1 }], p));
    }
    if (melds.length === 0 && isChiitoi(counts)) {
        const r = evaluateChiitoi(counts, p);
        if (r) candidates.push(r);
    }
    for (const d of decompose(counts)) {
        const groups = [
            ...d.sets.map(s => ({ ...s, open: false, kan: false })),
            ...melds.map(meldGroup)
        ];
        // 和了牌が入っている雀頭・面子ごとに、待ちの形を決めて評価する
        const winGroups = [];
        if (d.pair === winKind) winGroups.push(-1);
        d.sets.forEach((s, i) => {
            if (groupKinds(s).includes(winKind)) winGroups.push(i);
        });
        for (const index of winGroups) {
            const r = evaluateStandard(d.pair, groups.map(g => ({ ...g })), index, winKind, closed, counts, p);
            if (r) candidates.push(r);
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.base - a.base || b.han - a.han || b.fu - a.fu);
    return candidates[0];
}

function waitShape(group, winKind) {
    if (!group) return 'tanki';
    if (group.type === 'pon') return 'shanpon';
    const pos = winKind - group.kind;
    if (pos === 1) return 'kanchan';
    if (pos === 0) return group.kind % 9 === 6 ? 'penchan' : 'ryanmen';
    return group.kind % 9 === 0 ? 'penchan' : 'ryanmen';
}

// 状況の役（立直・一発・ツモ・海底など）。どの形にも共通
function situationYaku(p, closed) {
    const list = [];
    if (p.riichi === 2) list.push({ name: 'ダブル立直', han: 2 });
    else if (p.riichi === 1) list.push({ name: '立直', han: 1 });
    if (p.riichi && p.ippatsu) list.push({ name: '一発', han: 1 });
    if (closed && p.tsumo) list.push({ name: '門前清自摸和', han: 1 });
    if (p.tsumo && p.haitei && !p.rinshan) list.push({ name: '海底摸月', han: 1 });
    if (!p.tsumo && p.houtei) list.push({ name: '河底撈魚', han: 1 });
    if (p.tsumo && p.rinshan) list.push({ name: '嶺上開花', han: 1 });
    if (!p.tsumo && p.chankan) list.push({ name: '槍槓', han: 1 });
    return list;
}

function situationYakuman(p) {
    const list = [];
    if (p.tenhou) list.push({ name: '天和', yakuman: 1 });
    if (p.chiihou) list.push({ name: '地和', yakuman: 1 });
    return list;
}

// ドラ・赤ドラ・裏ドラ（役があるときだけ数える）
function countDora(p) {
    const all = [...p.hand, ...(p.melds ?? []).flatMap(m => m.tiles)];
    const countFor = (indicators) => (indicators ?? []).reduce((sum, id) => {
        const dora = doraFromIndicator(kindOf(id));
        return sum + all.filter(t => kindOf(t) === dora).length;
    }, 0);
    return {
        dora: countFor(p.doraIndicators),
        aka: all.filter(isRed).length,
        ura: p.riichi ? countFor(p.uraIndicators) : 0
    };
}

function finish(yaku, fu, p) {
    const han0 = yaku.reduce((s, y) => s + y.han, 0);
    if (han0 === 0) return null;
    const dora = countDora(p);
    const list = [...yaku];
    if (dora.dora) list.push({ name: 'ドラ', han: dora.dora });
    if (dora.aka) list.push({ name: '赤ドラ', han: dora.aka });
    if (dora.ura) list.push({ name: '裏ドラ', han: dora.ura });
    const han = han0 + dora.dora + dora.aka + dora.ura;
    const base = basePoints(han, fu);
    return { han, fu, yaku: list, yakuman: 0, base, limit: limitName(han, fu), dora };
}

function yakumanResult(list, p) {
    const all = [...situationYakuman(p), ...list];
    const yakuman = all.reduce((s, y) => s + y.yakuman, 0);
    return {
        han: 0, fu: 0, yaku: all.map(y => ({ name: y.name, han: 13 * y.yakuman })), yakuman,
        base: basePoints(0, 0, yakuman), limit: limitName(0, 0, yakuman), dora: { dora: 0, aka: 0, ura: 0 }
    };
}

// 字一色・混老頭・清一色・混一色など、使っている牌の種類だけで決まる役
function colorYaku(kinds, closed) {
    const list = [];
    const suits = new Set(kinds.filter(k => !isHonor(k)).map(suitOf));
    const honors = kinds.some(isHonor);
    if (kinds.every(isSimple)) list.push({ name: '断幺九', han: 1 });
    if (suits.size === 1 && !honors) list.push({ name: '清一色', han: closed ? 6 : 5 });
    else if (suits.size === 1 && honors) list.push({ name: '混一色', han: closed ? 3 : 2 });
    return list;
}

function evaluateChiitoi(counts, p) {
    const kinds = counts.flatMap((n, k) => (n ? [k] : []));
    if (kinds.every(isHonor)) return yakumanResult([{ name: '字一色', yakuman: 1 }], p);
    const yakuman = situationYakuman(p);
    if (yakuman.length) return yakumanResult([], p);
    const yaku = [...situationYaku(p, true), { name: '七対子', han: 2 }, ...colorYaku(kinds, true)];
    if (kinds.every(isYaochu)) yaku.push({ name: '混老頭', han: 2 });
    return finish(yaku, 25, p);
}

function evaluateStandard(pair, groups, winIndex, winKind, closed, counts, p) {
    const winGroup = winIndex >= 0 ? groups[winIndex] : null;
    const wait = waitShape(winGroup, winKind);
    // ロンで完成した刻子は明刻として数える
    if (winGroup && winGroup.type === 'pon' && !p.tsumo) winGroup.open = true;

    const pons = groups.filter(g => g.type === 'pon');
    const chis = groups.filter(g => g.type === 'chi');
    const concealedPons = pons.filter(g => !g.open).length;
    const kans = groups.filter(g => g.kan).length;
    const kinds = [pair, ...groups.flatMap(groupKinds)];
    const ponKinds = pons.map(g => g.kind);

    // ---- 役満 ----
    const yakuman = [];
    if (concealedPons === 4) yakuman.push({ name: '四暗刻', yakuman: 1 });
    if (DRAGONS_ALL(ponKinds)) yakuman.push({ name: '大三元', yakuman: 1 });
    const windPons = ponKinds.filter(isWind).length;
    if (windPons === 4) yakuman.push({ name: '大四喜', yakuman: 1 });
    else if (windPons === 3 && isWind(pair)) yakuman.push({ name: '小四喜', yakuman: 1 });
    if (kinds.every(isHonor)) yakuman.push({ name: '字一色', yakuman: 1 });
    if (kinds.every(k => GREEN_KINDS.includes(k))) yakuman.push({ name: '緑一色', yakuman: 1 });
    if (kinds.every(isTerminal)) yakuman.push({ name: '清老頭', yakuman: 1 });
    if (kans === 4) yakuman.push({ name: '四槓子', yakuman: 1 });
    if (closed && (p.melds ?? []).length === 0 && isChuuren(counts)) yakuman.push({ name: '九蓮宝燈', yakuman: 1 });
    if (yakuman.length || situationYakuman(p).length) return yakumanResult(yakuman, p);

    // ---- 通常の役 ----
    const yaku = situationYaku(p, closed);
    const valuePair = (k) => isDragon(k) || k === p.seatWind || k === p.roundWind;
    const pinfu = closed && chis.length === 4 && !valuePair(pair) && wait === 'ryanmen';
    if (pinfu) yaku.push({ name: '平和', han: 1 });

    if (closed) {
        const chiKinds = chis.map(g => g.kind).sort((a, b) => a - b);
        let peiko = 0;
        for (let i = 0; i + 1 < chiKinds.length; i++) {
            if (chiKinds[i] === chiKinds[i + 1]) { peiko++; i++; }
        }
        if (peiko === 2) yaku.push({ name: '二盃口', han: 3 });
        else if (peiko === 1) yaku.push({ name: '一盃口', han: 1 });
    }

    ponKinds.forEach(k => {
        if (isDragon(k)) yaku.push({ name: DRAGON_NAMES[k], han: 1 });
        if (k === p.seatWind) yaku.push({ name: '自風牌', han: 1 });
        if (k === p.roundWind) yaku.push({ name: '場風牌', han: 1 });
    });

    const chiSet = new Set(chis.map(g => g.kind));
    for (let n = 0; n < 7; n++) {
        if (chiSet.has(n) && chiSet.has(n + 9) && chiSet.has(n + 18)) { yaku.push({ name: '三色同順', han: closed ? 2 : 1 }); break; }
    }
    for (let s = 0; s < 3; s++) {
        if (chiSet.has(s * 9) && chiSet.has(s * 9 + 3) && chiSet.has(s * 9 + 6)) { yaku.push({ name: '一気通貫', han: closed ? 2 : 1 }); break; }
    }
    if (pons.length === 4) yaku.push({ name: '対々和', han: 2 });
    if (concealedPons === 3) yaku.push({ name: '三暗刻', han: 2 });
    const ponSet = new Set(ponKinds);
    for (let n = 0; n < 9; n++) {
        if (ponSet.has(n) && ponSet.has(n + 9) && ponSet.has(n + 18)) { yaku.push({ name: '三色同刻', han: 2 }); break; }
    }
    if (kans === 3) yaku.push({ name: '三槓子', han: 2 });
    if (ponKinds.filter(isDragon).length === 2 && isDragon(pair)) yaku.push({ name: '小三元', han: 2 });
    if (kinds.every(isYaochu)) {
        yaku.push({ name: '混老頭', han: 2 });
    } else if (chis.length > 0 && isYaochu(pair) && groups.every(g => groupKinds(g).some(isYaochu))) {
        if (kinds.some(isHonor)) yaku.push({ name: '混全帯幺九', han: closed ? 2 : 1 });
        else yaku.push({ name: '純全帯幺九', han: closed ? 3 : 2 });
    }
    yaku.push(...colorYaku(kinds, closed));

    // ---- 符 ----
    let fu;
    if (pinfu) {
        fu = p.tsumo ? 20 : 30;
    } else {
        fu = 20;
        if (closed && !p.tsumo) fu += 10;
        if (p.tsumo) fu += 2;
        pons.forEach(g => {
            let f = 2;
            if (isYaochu(g.kind)) f *= 2;
            if (!g.open) f *= 2;
            if (g.kan) f *= 4;
            fu += f;
        });
        if (isDragon(pair)) fu += 2;
        if (pair === p.seatWind) fu += 2;
        if (pair === p.roundWind) fu += 2;
        if (wait === 'kanchan' || wait === 'penchan' || wait === 'tanki') fu += 2;
        fu = Math.ceil(fu / 10) * 10;
        if (fu === 20) fu = 30; // 鳴いた平和形のロン（喰い平和）
    }
    const result = finish(yaku, fu, p);
    if (result) result.wait = wait;
    return result;
}

const DRAGONS_ALL = (ponKinds) => [31, 32, 33].every(k => ponKinds.includes(k));

// 九蓮宝燈：門前で1色、1と9が3枚以上、2〜8が1枚以上
function isChuuren(counts) {
    for (let s = 0; s < 3; s++) {
        const part = counts.slice(s * 9, s * 9 + 9);
        if (part.reduce((a, b) => a + b, 0) !== 14) continue;
        return part[0] >= 3 && part[8] >= 3 && part.slice(1, 8).every(n => n >= 1);
    }
    return false;
}

// 点数の早見（テストと遊び方の表で使う）
export function handPoints(han, fu, { dealer = false, tsumo = false, honba = 0, yakuman = 0 } = {}) {
    return payments(basePoints(han, fu, yakuman), { dealer, tsumo, honba });
}
