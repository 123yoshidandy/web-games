/**
 * 公園の計算：置ける場所の判定と得点
 * 公園は { forest: ['trex', ...], meadow: [...], ..., river: [...] } の形（置いた順。森と草原は左から）
 */

import {
    ZONES, ZONE_KEYS, ENCLOSURES, SPECIES_KEYS,
    FOREST_POINTS, MEADOW_POINTS, LOVE_PAIR_POINTS, TRIO_POINTS, KING_POINTS, ISLAND_POINTS, RIVER_POINTS, TREX_BONUS
} from './dinos.js';

export const emptyPark = () => Object.fromEntries(ZONE_KEYS.map(k => [k, []]));

export const clonePark = park => Object.fromEntries(ZONE_KEYS.map(k => [k, [...park[k]]]));

// 公園全体（川も含む）にいる、その種類の数
export const countSpecies = (park, species) => ZONE_KEYS.reduce((sum, k) => sum + park[k].filter(d => d === species).length, 0);

export const dinoCount = park => ZONE_KEYS.reduce((sum, k) => sum + park[k].length, 0);

// 囲いの決まり（数と種類）で置けるか。ダイスの決まりは見ない
export function fitsZone(park, zone, dino) {
    const here = park[zone];
    if (here.length >= ZONES[zone].capacity) return false;
    if (zone === 'forest') return here.length === 0 || here[0] === dino;
    if (zone === 'meadow') return !here.includes(dino);
    return true;
}

// ダイスの面が、その囲いを許すか（川はダイスに関係なく置ける。ここでは囲いだけを見る）
export function dieAllows(park, zone, face) {
    if (zone === 'river') return false;
    const z = ZONES[zone];
    switch (face) {
        case 'woods': return z.area === 'woods';
        case 'grass': return z.area === 'grass';
        case 'toilet': return z.side === 'right';
        case 'cafe': return z.side === 'left';
        case 'empty': return park[zone].length === 0;
        case 'notrex': return !park[zone].includes('trex');
        default: return true;
    }
}

/**
 * その恐竜を置ける場所の一覧。exempt：ダイスを振った人（ダイスの決まりを受けない）
 * 川にはいつでも置ける
 */
export function legalZones(park, dino, face, exempt = false) {
    const zones = ENCLOSURES.filter(zone => fitsZone(park, zone, dino) && (exempt || !face || dieAllows(park, zone, face)));
    zones.push('river');
    return zones;
}

// 王の座：その恐竜の種類を、自分より多く持っている人がいなければ得点
function kingScore(parks, seat) {
    const king = parks[seat].king[0];
    if (!king) return 0;
    const mine = countSpecies(parks[seat], king);
    return parks.every((p, i) => i === seat || countSpecies(p, king) <= mine) ? KING_POINTS : 0;
}

function loveScore(dinos) {
    return SPECIES_KEYS.reduce((sum, s) => sum + Math.floor(dinos.filter(d => d === s).length / 2) * LOVE_PAIR_POINTS, 0);
}

/**
 * 得点の内訳。parks：全員の公園（王の座の判定に使う）
 */
export function scorePark(parks, seat) {
    const park = parks[seat];
    const island = park.island[0];
    const s = {
        forest: FOREST_POINTS[park.forest.length],
        meadow: MEADOW_POINTS[park.meadow.length],
        love: loveScore(park.love),
        trio: park.trio.length === 3 ? TRIO_POINTS : 0,
        king: kingScore(parks, seat),
        island: island && countSpecies(park, island) === 1 ? ISLAND_POINTS : 0,
        river: park.river.length * RIVER_POINTS,
        trex: ENCLOSURES.filter(k => park[k].includes('trex')).length * TREX_BONUS
    };
    s.total = Object.values(s).reduce((a, b) => a + b, 0);
    return s;
}

// その恐竜をその場所に置いたら、今の時点の点が何点増えるか（減ることもある）
export function placementGain(parks, seat, dino, zone) {
    const before = scorePark(parks, seat).total;
    const next = parks.map((p, i) => (i === seat ? clonePark(p) : p));
    next[seat][zone].push(dino);
    return scorePark(next, seat).total - before;
}

// 場所ごとの点（画面の表示用。ティラノのボーナスは、ティラノがいる囲いに 1 点ずつ足す）
export function zoneScores(parks, seat) {
    const s = scorePark(parks, seat);
    const park = parks[seat];
    return Object.fromEntries(ZONE_KEYS.map(k => [k, s[k] + (k !== 'river' && park[k].includes('trex') ? TREX_BONUS : 0)]));
}
