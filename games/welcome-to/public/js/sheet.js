/**
 * 得点表（自分の街の紙）の決まり（DOM に依存しない）
 *
 * sheet = {
 *   houses: [通り][家] = { n, bis } か null
 *   fences: [通り][i] = 家 i と家 i+1 の間のフェンスがあるか（通りの両端には、はじめからフェンスがある）
 *   used:   [通り][家] = 都市計画に使った家か（その家並みは、もう計画に使えず、フェンスで分けられない）
 *   pools:  [通り][家] = プールを作ったか
 *   parks:  [通り] = 公園の数
 *   estates: [大きさ - 1] = 不動産屋で進めた数
 *   temps・bis・refusals：派遣・ビス・断りの数
 * }
 */

import {
    STREET_SIZES, STREETS, HOUSE_COUNT, MAX_NUMBER, POOL_SPOTS, PARK_SCORES, POOL_SCORES, BIS_PENALTY,
    REFUSAL_PENALTY, ESTATE_VALUES, MAX_ESTATE
} from './cards.js';

export function createSheet() {
    return {
        houses: STREET_SIZES.map(n => Array(n).fill(null)),
        fences: STREET_SIZES.map(n => Array(n - 1).fill(false)),
        used: STREET_SIZES.map(n => Array(n).fill(false)),
        pools: STREET_SIZES.map(n => Array(n).fill(false)),
        parks: [0, 0, 0],
        estates: [0, 0, 0, 0, 0, 0],
        temps: 0,
        bis: 0,
        refusals: 0
    };
}

export const cloneSheet = (sheet) => structuredClone(sheet);
export const isPoolSpot = (street, house) => POOL_SPOTS[street].includes(house);
export const builtCount = (sheet) => sheet.houses.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
export const isFull = (sheet) => builtCount(sheet) === HOUSE_COUNT;

// 家 house より左の一番大きい番号と、右の一番小さい番号
function neighbors(row, house) {
    let left = -1;
    let right = MAX_NUMBER + 1;
    for (let i = 0; i < house; i++) if (row[i]) left = Math.max(left, row[i].n);
    for (let i = row.length - 1; i > house; i--) if (row[i]) right = Math.min(right, row[i].n);
    return { left, right };
}

// 番号 n を、その家に書けるか（空いた家に、左から右へ大きくなるように。同じ番号は書けない）
export function canWrite(sheet, street, house, n) {
    const row = sheet.houses[street];
    if (!row || house < 0 || house >= row.length || row[house]) return false;
    if (!Number.isInteger(n) || n < 0 || n > MAX_NUMBER) return false;
    const { left, right } = neighbors(row, house);
    return n > left && n < right;
}

// 番号 n を書ける家の一覧
export function writableHouses(sheet, n) {
    const list = [];
    for (let s = 0; s < STREETS; s++) {
        for (let h = 0; h < STREET_SIZES[s]; h++) if (canWrite(sheet, s, h, n)) list.push({ street: s, house: h });
    }
    return list;
}

// ビスを書ける家：空いた家で、すぐ隣（フェンスで分かれていない）に建った家があるもの。番号は隣の家と同じ
// 両隣に家があれば、どちらの番号も写せる。{ street, house, n } の一覧
export function bisSpots(sheet) {
    const list = [];
    if (sheet.bis >= BIS_PENALTY.length - 1) return list;
    for (let s = 0; s < STREETS; s++) {
        const row = sheet.houses[s];
        for (let h = 0; h < row.length; h++) {
            if (row[h]) continue;
            const seen = new Set();
            if (h > 0 && row[h - 1] && !sheet.fences[s][h - 1]) seen.add(row[h - 1].n);
            if (h < row.length - 1 && row[h + 1] && !sheet.fences[s][h]) seen.add(row[h + 1].n);
            seen.forEach(n => list.push({ street: s, house: h, n }));
        }
    }
    return list;
}

// フェンスを立てられる場所（家 i と家 i+1 の間）：まだなく、同じ番号（ビス）の間でも、計画に使った家並みの中でもない
export function canFence(sheet, street, i) {
    const fences = sheet.fences[street];
    if (!fences || !Number.isInteger(i) || i < 0 || i >= fences.length || fences[i]) return false;
    const row = sheet.houses[street];
    if (row[i] && row[i + 1] && row[i].n === row[i + 1].n) return false;
    if (sheet.used[street][i] && sheet.used[street][i + 1]) return false;
    return true;
}

export function fenceSpots(sheet) {
    const list = [];
    for (let s = 0; s < STREETS; s++) {
        for (let i = 0; i < sheet.fences[s].length; i++) if (canFence(sheet, s, i)) list.push({ street: s, pos: i });
    }
    return list;
}

// フェンスで区切られた区画の一覧：{ street, start, size, built（建った家の数）, used }
export function segments(sheet) {
    const list = [];
    for (let s = 0; s < STREETS; s++) {
        const row = sheet.houses[s];
        let start = 0;
        for (let h = 0; h < row.length; h++) {
            if (h === row.length - 1 || sheet.fences[s][h]) {
                const size = h - start + 1;
                let built = 0;
                for (let k = start; k <= h; k++) if (row[k]) built++;
                list.push({ street: s, start, size, built, used: sheet.used[s][start] });
                start = h + 1;
            }
        }
    }
    return list;
}

// 完成した家並み（1〜6軒の区画で、全部の家が建ったもの）
export const completedEstates = (sheet) => segments(sheet).filter(seg => seg.size <= MAX_ESTATE && seg.built === seg.size);

// 家並み1つあたりの、いまの値
export const estateValue = (sheet, size) => {
    const values = ESTATE_VALUES[size - 1];
    return values[Math.min(sheet.estates[size - 1], values.length - 1)];
};
export const canRaiseEstate = (sheet, size) => Number.isInteger(size) && size >= 1 && size <= MAX_ESTATE
    && sheet.estates[size - 1] < ESTATE_VALUES[size - 1].length - 1;
export const canAddPark = (sheet, street) => sheet.parks[street] < PARK_SCORES[street].length - 1;

// 都市計画に使える家並みを選ぶ（足りなければ null）。まだ計画に使っていない家並みから、左上から順に選ぶ
export function planEstates(sheet, plan) {
    const free = completedEstates(sheet).filter(e => !e.used);
    const picked = [];
    for (const size of plan.sizes) {
        const i = free.findIndex(e => e.size === size);
        if (i < 0) return null;
        picked.push(free[i]);
        free.splice(i, 1);
    }
    return picked;
}

// ---- 書き込み（どれも、決まりに合うかを先に確かめてから呼ぶ） ----

export function writeHouse(sheet, street, house, n, { bis = false } = {}) {
    sheet.houses[street][house] = { n, bis };
}

export function markPlan(sheet, estates) {
    estates.forEach(e => {
        for (let k = e.start; k < e.start + e.size; k++) sheet.used[e.street][k] = true;
    });
}

// ---- 得点（計画と派遣は、ほかの人との比べ合いなので game.js で数える） ----

export function sheetScore(sheet) {
    const parks = sheet.parks.reduce((sum, c, s) => sum + PARK_SCORES[s][c], 0);
    const pools = POOL_SCORES[Math.min(sheet.pools.flat().filter(Boolean).length, POOL_SCORES.length - 1)];
    const estateCounts = [0, 0, 0, 0, 0, 0];
    completedEstates(sheet).forEach(e => { estateCounts[e.size - 1]++; });
    const estates = estateCounts.reduce((sum, c, i) => sum + c * estateValue(sheet, i + 1), 0);
    const bis = BIS_PENALTY[Math.min(sheet.bis, BIS_PENALTY.length - 1)];
    const refusals = REFUSAL_PENALTY[Math.min(sheet.refusals, REFUSAL_PENALTY.length - 1)];
    return { parks, pools, estates, estateCounts, bis, refusals };
}
