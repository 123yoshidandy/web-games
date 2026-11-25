/**
 * 盤面だけを見て決まるルール（移動・支配・資源・得点・目標・建物の得点）
 * ゲームの状態とビューのどちらにも使えるように、次の形の S を受け取る
 *   S.players[seat]：{ faction, mechs: [4つの真偽], popularity, power, coins, cardCount, upgrades, recruits }
 *   S.units：[{ id, seat, kind: 'char'|'mech'|'worker', hex }]
 *   S.structures：[{ seat, type, hex }]
 *   S.res：領地ごとの { oil, metal, food, wood }
 *   S.encounters：遭遇の印が残っている領地
 */

import { MAP, FACTIONS, RESOURCES, isRiver, TERRAINS } from './data.js';

export const WORKERS_MAX = 8;
export const POWER_MAX = 16;
export const POPULARITY_MAX = 18;

export const hexOf = (id) => MAP.hexes[id];
export const isBoard = (id) => id >= 0 && id < MAP.boardCount;
export const isFighter = (unit) => unit.kind !== 'worker';

export const unitsAt = (S, hex) => S.units.filter(u => u.hex === hex);
export const structureAt = (S, hex) => S.structures.find(s => s.hex === hex) ?? null;
export const workersOnBoard = (S, seat) => S.units.filter(u => u.seat === seat && u.kind === 'worker').length;
export const enemyUnitsAt = (S, seat, hex) => S.units.filter(u => u.hex === hex && u.seat !== seat);

export function hasAbility(S, seat, key) {
    const p = S.players[seat];
    const index = FACTIONS[p.faction].mechs.indexOf(key);
    return index >= 0 && !!p.mechs[index];
}

// その領地を支配している席（ユニットがいればユニットの持ち主、いなければ建物の持ち主）。戦闘の途中で2人いるときは null
export function controllerOf(S, hex) {
    if (!isBoard(hex) || hexOf(hex).terrain === 'lake') return null;
    const seats = new Set(unitsAt(S, hex).map(u => u.seat));
    if (seats.size === 1) return [...seats][0];
    if (seats.size > 1) return null;
    return structureAt(S, hex)?.seat ?? null;
}

export function controlledHexes(S, seat) {
    const list = [];
    for (let h = 0; h < MAP.boardCount; h++) if (controllerOf(S, h) === seat) list.push(h);
    return list;
}

export function resourceTotals(S, seat) {
    const total = { oil: 0, metal: 0, food: 0, wood: 0 };
    controlledHexes(S, seat).forEach(h => RESOURCES.forEach(r => { total[r] += S.res[h][r]; }));
    return total;
}

// 自分にとってトンネルになる領地か（トンネル・自分の鉱山・地下道の山）
function isTunnelFor(S, seat, hex, fighter) {
    if (!isBoard(hex)) return false;
    if (hexOf(hex).tunnel) return true;
    if (S.structures.some(s => s.seat === seat && s.type === 'mine' && s.hex === hex)) return true;
    return fighter && hexOf(hex).terrain === 'mountain' && hasAbility(S, seat, 'underpass') && controllerOf(S, hex) === seat;
}

// 1歩で行ける領地（川・湖・トンネル・勢力とメックの能力を考える。敵のユニットの有無は見ない）
export function stepTargets(S, seat, kind, from) {
    const fighter = kind !== 'worker';
    const faction = FACTIONS[S.players[seat].faction];
    const here = hexOf(from);
    const out = new Set();
    const canEnterLake = fighter && (hasAbility(S, seat, 'seaworthy') || hasAbility(S, seat, 'submerge'));
    const add = (to) => {
        if (to === from) return;
        const t = hexOf(to).terrain;
        if (t === 'home') return;
        if (t === 'lake' && !canEnterLake) return;
        out.add(to);
    };
    if (here.terrain === 'home') {
        here.adj.forEach(add);
    } else {
        here.adj.forEach(to => {
            if (isRiver(from, to)) {
                const ok = fighter
                    ? hasAbility(S, seat, 'riverwalk') && faction.riverwalk.includes(hexOf(to).terrain)
                    : S.players[seat].faction === 'nordic';
                if (!ok) return;
            }
            add(to);
        });
        if (isTunnelFor(S, seat, from, fighter)) {
            for (let h = 0; h < MAP.boardCount; h++) if (isTunnelFor(S, seat, h, fighter)) add(h);
        }
        if (fighter && here.terrain === 'lake' && hasAbility(S, seat, 'submerge')) {
            for (let h = 0; h < MAP.boardCount; h++) if (hexOf(h).terrain === 'lake') add(h);
        }
        if (fighter && hasAbility(S, seat, 'township')) {
            const ownVillage = (h) => hexOf(h).terrain === 'village' && controllerOf(S, h) === seat;
            if (from === MAP.factory) {
                for (let h = 0; h < MAP.boardCount; h++) if (ownVillage(h)) add(h);
            } else if (ownVillage(from)) add(MAP.factory);
        }
    }
    // 旅路：どこからでも、空いた本拠地と自分の本拠地へ
    if (fighter && hasAbility(S, seat, 'wayfare')) {
        const used = new Set(S.players.map(p => p.faction));
        Object.entries(MAP.homes).forEach(([key, id]) => {
            if (id !== from && (key === S.players[seat].faction || !used.has(key))) out.add(id);
        });
    }
    return [...out];
}

// そのユニットが動ける先と歩数（range は1か2）。敵のいる領地と、指導者にとっての遭遇の印では止まる。労働者は敵のいる領地に入れない
export function reachable(S, unit, range = 1) {
    const result = new Map();
    let frontier = [unit.hex];
    for (let step = 1; step <= range; step++) {
        const next = [];
        frontier.forEach(from => {
            stepTargets(S, unit.seat, unit.kind, from).forEach(to => {
                if (result.has(to) || to === unit.hex) return;
                const enemies = enemyUnitsAt(S, unit.seat, to);
                if (unit.kind === 'worker' && enemies.length > 0) return;
                result.set(to, step);
                const stop = enemies.length > 0
                    || (unit.kind === 'char' && S.encounters.includes(to))
                    || hexOf(to).terrain === 'home';
                if (!stop) next.push(to);
            });
        });
        frontier = next;
    }
    return result;
}

// ---- 得点 ----

export function tierOf(popularity) {
    if (popularity >= 13) return { star: 5, territory: 4, resource: 3, name: '13〜18' };
    if (popularity >= 7) return { star: 4, territory: 3, resource: 2, name: '7〜12' };
    return { star: 3, territory: 2, resource: 1, name: '0〜6' };
}

// 工場は3つ分の領地として数える
export const territoryCount = (S, seat) => controlledHexes(S, seat).reduce((n, h) => n + (h === MAP.factory ? 3 : 1), 0);

// 建物の得点のタイル（ゲームごとに1つ）
const BONUS_POINTS = [0, 2, 4, 6, 9];
export const STRUCTURE_BONUSES = [
    { name: 'トンネルに隣り合う建物', test: (h) => hexOf(h).adj.some(a => isBoard(a) && hexOf(a).tunnel) },
    { name: '湖に隣り合う建物', test: (h) => hexOf(h).adj.some(a => isBoard(a) && hexOf(a).terrain === 'lake') },
    { name: '遭遇の印（初めの位置）に隣り合う建物', test: (h) => hexOf(h).adj.some(a => isBoard(a) && hexOf(a).encounter) },
    { name: 'トンネルの上の建物', test: (h) => hexOf(h).tunnel },
    { name: '農場かツンドラの上の建物', test: (h) => ['farm', 'tundra'].includes(hexOf(h).terrain) }
];
export function structureBonusOf(S, seat, bonusIndex) {
    const count = S.structures.filter(s => s.seat === seat && STRUCTURE_BONUSES[bonusIndex].test(s.hex)).length;
    return { count, points: BONUS_POINTS[Math.min(count, 4)] };
}

export function scoreOf(S, seat, bonusIndex) {
    const p = S.players[seat];
    const tier = tierOf(p.popularity);
    const res = resourceTotals(S, seat);
    const resources = RESOURCES.reduce((n, r) => n + res[r], 0);
    const territories = territoryCount(S, seat);
    const bonus = structureBonusOf(S, seat, bonusIndex);
    const parts = {
        coins: p.coins,
        stars: p.starCount * tier.star,
        territories: territories * tier.territory,
        resources: Math.floor(resources / 2) * tier.resource,
        bonus: bonus.points
    };
    return { seat, ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0), counts: { stars: p.starCount, territories, resources, bonus: bonus.count } };
}

// ---- 目標カード ----
const controlsTerrain = (S, seat, terrain) => controlledHexes(S, seat).filter(h => hexOf(h).terrain === terrain).length;
export const OBJECTIVES = [
    { text: '自分の領地に食料が8つ以上ある', test: (S, s) => resourceTotals(S, s).food >= 8 },
    { text: '自分の領地に木材と金属が4つずつ以上ある', test: (S, s) => { const r = resourceTotals(S, s); return r.wood >= 4 && r.metal >= 4; } },
    { text: '自分の領地に石油が6つ以上ある', test: (S, s) => resourceTotals(S, s).oil >= 6 },
    { text: '自分の領地に4種類の資源が3つずつ以上ある', test: (S, s) => { const r = resourceTotals(S, s); return RESOURCES.every(k => r[k] >= 3); } },
    { text: '村を3つ以上支配している', test: (S, s) => controlsTerrain(S, s, 'village') >= 3 },
    { text: '山を3つ以上支配している', test: (S, s) => controlsTerrain(S, s, 'mountain') >= 3 },
    { text: 'トンネルのある領地を3つ以上支配している', test: (S, s) => controlledHexes(S, s).filter(h => hexOf(h).tunnel).length >= 3 },
    { text: '湖に隣り合う領地を5つ以上支配している', test: (S, s) => controlledHexes(S, s).filter(h => hexOf(h).adj.some(a => hexOf(a).terrain === 'lake')).length >= 5 },
    { text: '工場を支配し、メックを2体以上出している', test: (S, s) => controllerOf(S, MAP.factory) === s && S.players[s].mechs.filter(Boolean).length >= 2 },
    { text: '人気が13以上で、力が10以上', test: (S, s) => S.players[s].popularity >= 13 && S.players[s].power >= 10 },
    { text: '戦闘カードを5枚以上持ち、力が8以上', test: (S, s) => S.players[s].cardCount >= 5 && S.players[s].power >= 8 },
    { text: '金を16以上持っている', test: (S, s) => S.players[s].coins >= 16 },
    { text: '8つ以上の領地を支配している', test: (S, s) => territoryCount(S, s) >= 8 }
];

export const terrainName = (hex) => TERRAINS[hexOf(hex).terrain].name;
