/**
 * ルールの計算（状態を変えない）。ゲーム本体・ビュー・CPU・画面で共有する
 * state はゲームかビュー（players・regions・bands・current・acting・stage・step・turnInfo を持つ）
 */

import { RACES, AMAZON_BONUS, MAX_HEROES, MAX_CAMPS, MAX_FORTS, isWater } from './data.js';
import { getMap } from './map.js';

export const mapOf = (state) => getMap(state.players.length);

// 種族の部隊がいる領域
export const regionsOf = (state, race) => state.regions.flatMap((r, id) => (r.race === race ? [id] : []));

// 領域を持つ人（失われた部族と空き地は -1）
export function seatOf(state, id) {
    const race = state.regions[id].race;
    return race && race !== 'lost' ? state.bands[race]?.seat ?? -1 : -1;
}

// 衰退していない種族の特殊能力（衰退した種族は特殊能力を持たない）
export function powerOf(state, race) {
    const band = state.bands[race];
    return band && !band.declined ? band.power : null;
}

export const isActive = (state, race) => !!state.bands[race] && !state.bands[race].declined;

// 英雄・穴・竜のいる領域は、攻められず、種族や特殊能力の力も受けない
export const isImmune = (state, id) => {
    const r = state.regions[id];
    return r.hero || r.hole || r.dragon;
};

// 盤と手元にある部隊の数と、箱に残っている数
export function onBoard(state, race) {
    return state.regions.reduce((sum, r) => sum + (r.race === race ? r.count : 0), 0);
}
export const trayOf = (state, race) => Math.max(0, RACES[race].max - onBoard(state, race) - (state.bands[race]?.hand ?? 0));

// 守り：2 ＋ 部隊 ＋ 山 ＋ トロルの巣・砦・野営地
export function defenseOf(state, id) {
    const r = state.regions[id];
    const terrain = mapOf(state).regions[id].terrain;
    return 2 + r.count + (terrain === 'mountain' ? 1 : 0) + (r.lair ? 1 : 0) + (r.fort ? 1 : 0) + r.camps;
}

// 征服に要る部隊の数（種族と特殊能力で減り、少なくとも1）
export function conquestCost(state, race, id) {
    const info = mapOf(state).regions[id];
    let cost = defenseOf(state, id);
    if (isActive(state, race)) {
        const power = powerOf(state, race);
        if (power === 'commando') cost--;
        if (power === 'mounted' && (info.terrain === 'hill' || info.terrain === 'farm')) cost--;
        if (power === 'underworld' && info.special === 'cavern') cost--;
        if (race === 'tritons' && info.coastal) cost--;
        if (race === 'giants' && info.adj.some(a => state.regions[a].race === 'giants' && mapOf(state).regions[a].terrain === 'mountain')) cost--;
    }
    return Math.max(1, cost);
}

// 守りに関係なく、その種族がその領域を攻められるか（隣り合い・海・攻められない領域・和平）
export function canAttack(state, race, id) {
    const map = mapOf(state);
    const info = map.regions[id];
    const r = state.regions[id];
    const band = state.bands[race];
    if (!band || r.race === race) return false;
    const power = powerOf(state, race);
    if (isWater(info.terrain) && power !== 'seafaring') return false;
    if (r.race && r.race !== 'lost') {
        const other = state.bands[r.race];
        if (isImmune(state, id)) return false;
        // 自分の衰退していない種族は攻めない
        if (other.seat === band.seat && !other.declined) return false;
        // 外交：和平を結ばれた相手の、衰退していない種族は攻められない
        if (!other.declined && state.players[other.seat].peace === band.seat) return false;
    } else if (isImmune(state, id)) {
        return false;
    }
    const own = regionsOf(state, race);
    if (power === 'flying') return true;
    if (own.length === 0) return info.border || (race === 'halflings' && !band.declined);
    if (info.adj.some(a => state.regions[a].race === race)) return true;
    return power === 'underworld' && info.special === 'cavern' && own.some(a => map.regions[a].special === 'cavern');
}

// 征服に使える部隊の数（まだ部隊を手に戻していなければ、戻したあとの数）
export function readyHand(state, race = state.acting) {
    const band = state.bands[race];
    if (!band) return 0;
    if (state.step?.ready || state.acting !== race) return band.hand;
    const spare = state.regions.reduce((sum, r) => sum + (r.race === race ? r.count - 1 : 0), 0);
    const bonus = race === 'amazons' && !band.declined ? Math.min(AMAZON_BONUS, trayOf(state, race)) : 0;
    return band.hand + spare + bonus;
}

const inConquest = (state) => state.phase !== 'end' && state.stage === 'conquer' && !!state.acting;

// 征服できる領域：{ id, cost, need（実際に置く数）, final（サイコロに賭ける最後の征服）}
export function conquestTargets(state) {
    if (!inConquest(state) || state.step.final) return [];
    const race = state.acting;
    const hand = readyHand(state, race);
    if (hand < 1) return [];
    const berserk = powerOf(state, race) === 'berserk';
    if (berserk && state.step.roll === null) return [];
    const list = [];
    state.regions.forEach((_, id) => {
        if (!canAttack(state, race, id)) return;
        const cost = conquestCost(state, race, id);
        if (berserk) {
            const need = Math.max(1, cost - state.step.roll);
            if (need <= hand) list.push({ id, cost, need, final: false });
        } else if (cost <= hand) {
            list.push({ id, cost, need: cost, final: false });
        } else if (cost - hand <= 3) {
            list.push({ id, cost, need: hand, final: true });
        }
    });
    return list;
}

export function canRoll(state) {
    return inConquest(state) && powerOf(state, state.acting) === 'berserk' && state.step.roll === null && !state.step.final && readyHand(state) >= 1;
}

export function dragonTargets(state) {
    if (!inConquest(state) || state.step.final || state.step.dragonUsed) return [];
    const race = state.acting;
    if (powerOf(state, race) !== 'dragon' || readyHand(state, race) < 1) return [];
    return state.regions.map((_, id) => id).filter(id => canAttack(state, race, id));
}

// 魔術師：相手1人につき番に1回、隣の1体だけの（衰退していない）部隊を置き換える
export function sorceryTargets(state) {
    if (!inConquest(state) || state.step.final) return [];
    const race = state.acting;
    if (race !== 'sorcerers' || !isActive(state, race) || trayOf(state, race) < 1) return [];
    const map = mapOf(state);
    const seat = state.bands[race].seat;
    return state.regions.map((_, id) => id).filter(id => {
        const r = state.regions[id];
        if (!r.race || r.race === 'lost' || r.count !== 1 || isImmune(state, id)) return false;
        const other = state.bands[r.race];
        if (other.declined || other.seat === seat || state.step.sorcered.includes(other.seat)) return false;
        if (state.players[other.seat].peace === seat || isWater(map.regions[id].terrain)) return false;
        return map.regions[id].adj.some(a => state.regions[a].race === race);
    });
}

// 放棄：この番の最初の征服の前なら、自分の領域を空けて部隊を手に戻せる
export function canAbandon(state, id) {
    return inConquest(state) && state.regions[id].race === state.acting && state.step.conquered.length === 0 && !state.step.final;
}

// 衰退：征服の代わりに、番の初めに選ぶ
export function canDecline(state) {
    if (!inConquest(state)) return false;
    const p = state.players[state.current];
    return state.acting === p.active && !state.step.ready;
}

// ---- 再配置 ----

const inRedeploy = (state) => state.phase !== 'end' && state.stage === 'redeploy';

export function redeployChecks(state, id) {
    if (!inRedeploy(state) || state.regions[id]?.race !== state.acting) return null;
    const race = state.acting;
    const band = state.bands[race];
    const r = state.regions[id];
    const power = powerOf(state, race);
    const mine = regionsOf(state, race);
    const heroes = mine.filter(a => state.regions[a].hero).length;
    const camps = mine.reduce((s, a) => s + state.regions[a].camps, 0);
    const forts = mine.filter(a => state.regions[a].fort).length;
    return {
        place: band.hand > 0,
        lift: r.count >= 2,
        hero: power === 'heroic' && (r.hero || heroes < MAX_HEROES),
        camp: power === 'bivouacking' && camps < MAX_CAMPS,
        uncamp: power === 'bivouacking' && r.camps > 0,
        fort: power === 'fortified' && (state.step.fortRegion === id || (!r.fort && (forts - (state.step.fortRegion !== null ? 1 : 0)) < MAX_FORTS))
    };
}

export function canFinishRedeploy(state) {
    if (!inRedeploy(state)) return false;
    const race = state.acting;
    return state.bands[race].hand === 0 || regionsOf(state, race).length === 0;
}

// 外交で和平を結べる相手（この番に攻めておらず、衰退していない種族を持つ人）
export function peaceOptions(state) {
    if (!inRedeploy(state) || powerOf(state, state.acting) !== 'diplomat') return [];
    return state.players.filter(p => p.id !== state.current && p.active && !state.turnInfo.attacked.includes(p.id)).map(p => p.id);
}

export const canStoutDecline = (state) => inRedeploy(state) && powerOf(state, state.acting) === 'stout' && state.players[state.current].active === state.acting;

// ---- 得点 ----

// 手番の終わりにもらうコイン：{ total, parts: [{ label, coins }] }
export function turnIncome(state, seat) {
    const map = mapOf(state);
    const p = state.players[seat];
    const races = [p.active, ...p.declined].filter(Boolean);
    const parts = [];
    const owned = state.regions.flatMap((r, id) => (races.includes(r.race) ? [id] : []));
    parts.push({ label: '領域', coins: owned.length });
    const count = (race, test) => state.regions.filter((r, id) => r.race === race && test(map.regions[id], r)).length;
    for (const race of races) {
        if (race === 'dwarves') parts.push({ label: 'ドワーフ（鉱山）', coins: count(race, info => info.special === 'mine') });
    }
    const active = p.active;
    if (active) {
        const band = state.bands[active];
        const nonEmpty = state.turnInfo && state.current === seat ? state.turnInfo.nonEmpty : 0;
        if (active === 'humans') parts.push({ label: '人間（農地）', coins: count(active, info => info.terrain === 'farm') });
        if (active === 'wizards') parts.push({ label: '魔法使い（魔法の源）', coins: count(active, info => info.special === 'magic') });
        if (active === 'orcs') parts.push({ label: 'オーク', coins: nonEmpty });
        const power = band.power;
        if (power === 'forest') parts.push({ label: '森', coins: count(active, info => info.terrain === 'forest') });
        if (power === 'hill') parts.push({ label: '丘', coins: count(active, info => info.terrain === 'hill') });
        if (power === 'swamp') parts.push({ label: '沼', coins: count(active, info => info.terrain === 'swamp') });
        if (power === 'merchant') parts.push({ label: '商人', coins: count(active, () => true) });
        if (power === 'alchemist') parts.push({ label: '錬金術', coins: 2 });
        if (power === 'fortified') parts.push({ label: '砦', coins: count(active, (_, r) => r.fort) });
        if (power === 'pillaging') parts.push({ label: '略奪', coins: nonEmpty });
        if (power === 'wealthy' && !band.wealthyPaid) parts.push({ label: '裕福', coins: 7 });
    }
    const list = parts.filter((part, i) => i === 0 || part.coins > 0);
    return { total: list.reduce((s, part) => s + part.coins, 0), parts: list };
}

// 手番の人から見た脅威：隣の、ほかの人の衰退していない種族の部隊の数など（再配置の目安）
export function threatOf(state, race, id) {
    if (isImmune(state, id)) return 0;
    const map = mapOf(state);
    const seat = state.bands[race].seat;
    let threat = map.regions[id].border ? 0.6 : 0;
    for (const a of map.regions[id].adj) {
        const r = state.regions[a];
        if (r.race === race) continue;
        if (r.race && r.race !== 'lost') {
            const other = state.bands[r.race];
            if (other.seat !== seat) threat += other.declined ? 0.4 : 1 + r.count;
        } else if (!isWater(map.regions[a].terrain)) {
            threat += 0.3;
        }
    }
    return threat;
}

export const MAXES = { heroes: MAX_HEROES, camps: MAX_CAMPS, forts: MAX_FORTS };
