/**
 * ルールの判定（ゲームの本体と CPU の両方が使う。プレイヤーのデータ（ビューと同じ形）だけを見る）
 * プレイヤー：{ estate: [タイルの番号 か null]×37, storage: [タイルの番号], goods: { 目: 枚数 }, workers, silver }
 */

import { CELLS, REGIONS, TILES, STORAGE } from './data.js';

// その人が持つ知識タイルの番号
export const knowledgeOf = (player) => new Set(player.estate.filter(t => t !== null && TILES[t].kind === 'knowledge').map(t => TILES[t].knowledge));
export const hasKnowledge = (player, k) => player.estate.some(t => t !== null && TILES[t].knowledge === k);

// 目の距離（1と6はつながる）
export const dieDistance = (a, b) => {
    const d = Math.abs(a - b);
    return Math.min(d, 6 - d);
};

// 目 from を to にするのに要る労働者の数。purpose：'take'・'place'・'sell'・'workers'、kind：置くタイルの色
export function workersNeeded(player, from, to, purpose, kind = null) {
    const k = knowledgeOf(player);
    let free = 0;
    if (purpose === 'take' && k.has(12)) free = 1;
    if (purpose === 'place') {
        if (kind === 'building' && k.has(9)) free = 1;
        if ((kind === 'ship' || kind === 'animal') && k.has(10)) free = 1;
        if ((kind === 'castle' || kind === 'mine' || kind === 'knowledge') && k.has(11)) free = 1;
    }
    const left = Math.max(0, dieDistance(from, to) - free);
    return Math.ceil(left / (k.has(8) ? 2 : 1));
}

// そのマスに、そのタイルを置けるか（目は見ない）
export function placeProblem(player, tileId, cellId) {
    const tile = TILES[tileId];
    const cell = CELLS[cellId];
    if (!cell) return 'そのマスはありません';
    if (player.estate[cellId] !== null) return 'そのマスはもう埋まっています';
    if (tile.kind !== cell.kind) return '色が合いません';
    if (!cell.neighbors.some(n => player.estate[n] !== null)) return '置いたタイルのとなりにしか置けません';
    if (tile.kind === 'building' && !hasKnowledge(player, 1)) {
        const same = REGIONS[cell.region].cells.some(c => player.estate[c] !== null && TILES[player.estate[c]].building === tile.building);
        if (same) return '同じ都市に同じ建物は置けません';
    }
    return null;
}

// 目に関係なく置けるマス
export const placeableCells = (player, tileId) => CELLS.filter(c => !placeProblem(player, tileId, c.id)).map(c => c.id);

// 地域が埋まったか
export const regionFull = (player, regionId) => REGIONS[regionId].cells.every(c => player.estate[c] !== null);
// その色のマスがすべて埋まったか
export const kindFull = (player, kind) => CELLS.every(c => c.kind !== kind || player.estate[c.id] !== null);

// 船で取れる商品（3種類まで。持っている種類を先に、多い種類を先に取る）
export function goodsAfterShip(goods, incoming) {
    const result = { ...goods };
    const counts = {};
    incoming.forEach(g => { counts[g] = (counts[g] ?? 0) + 1; });
    const types = Object.keys(counts).map(Number).sort((a, b) => (result[b] ? 1 : 0) - (result[a] ? 1 : 0) || counts[b] - counts[a] || a - b);
    const taken = [];
    types.forEach(g => {
        const held = Object.keys(result).filter(x => result[x] > 0).length;
        if (result[g] > 0 || held < 3) {
            result[g] = (result[g] ?? 0) + counts[g];
            for (let i = 0; i < counts[g]; i++) taken.push(g);
        }
    });
    return { goods: result, taken };
}

export const storageFull = (player) => player.storage.length >= STORAGE;

// 家畜を置いたときの点（同じ牧草地の同じ家畜すべて。知識7なら1枚ごとに+1）
export function animalPoints(player, tileId, cellId) {
    const tile = TILES[tileId];
    const region = REGIONS[CELLS[cellId].region];
    const bonus = hasKnowledge(player, 7) ? 1 : 0;
    const others = region.cells.filter(c => c !== cellId && player.estate[c] !== null && TILES[player.estate[c]].animal === tile.animal);
    return [tileId, ...others.map(c => player.estate[c])].reduce((s, t) => s + TILES[t].count + bonus, 0);
}
