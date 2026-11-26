/**
 * CPU：置ける場所・向き・コマの置き方を全部試し、盤面の見込みの点の増え方で選ぶ
 * DOM に依存しない。ゲームの乱数は使わず、状態から作った別の乱数を使う（記録の再現がずれないように）
 *
 * 強すぎないように、人間らしい見落としを入れる（LEVELS）
 *   skipSpot     置ける場所の一部を見落とす割合
 *   noise        評価に足すゆらぎ（点）
 *   farmerChance その番に、草原にコマを置くことを考える割合
 *   fieldWeight  草原の見込みの重み（草原の得点は分かりにくいので、人間は軽く見がち）
 *   opponentWeight 相手の点が増えることをどれだけ嫌うか
 *   blocking     相手の都市や道に割り込む・邪魔する手を考えるか
 */

import { createRandom } from './random.js';
import { rotatedTile, oppositeSide, oppositeHalf } from './tiles.js';
import { majority, regionPoints } from './board.js';

export const LEVELS = {
    easy: { skipSpot: 0.35, noise: 3, farmerChance: 0.15, fieldWeight: 0.4, opponentWeight: 0.15 },
    normal: { skipSpot: 0.2, noise: 1.5, farmerChance: 0.5, fieldWeight: 0.7, opponentWeight: 0.45 },
    // 強さを測るための、見落としのない CPU（画面では使わない）
    strong: { skipSpot: 0, noise: 0, farmerChance: 1, fieldWeight: 1, opponentWeight: 0.8 },
    // 比べるための、でたらめに打つ CPU（画面では使わない）
    random: { skipSpot: 0, noise: 1000, farmerChance: 1, fieldWeight: 1, opponentWeight: 0 }
};

const TOTAL_TILES = 71;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// CPU の判断に使う乱数（ゲームの乱数とは別。同じ状態なら同じ手になる）
function cpuRandom(game, seat) {
    return createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 2654435761) ^ Math.imul(seat + 1, 40503)) >>> 0);
}

// 完成の見込み（開いている辺が多いほど、残りのタイルが少ないほど下がる）
function completionChance(open, remaining) {
    if (open === 0) return 1;
    return clamp(0.95 - 0.18 * (open - 1), 0.12, 0.95) * clamp(remaining / 30 + 0.2, 0, 1);
}

// 領域の、持ち主 1 人あたりの見込みの点
function regionValue(region, ctx) {
    const { remaining, cfg, board, cityCache } = ctx;
    if (region.kind === 'road') return region.cells.size;
    if (region.kind === 'city') {
        if (region.complete) return regionPoints(region);
        return (region.cells.size + region.shields) * (1 + completionChance(region.open, remaining));
    }
    if (region.kind === 'monastery') {
        if (region.complete) return 9;
        const missing = 8 - region.surround;
        return 1 + region.surround + missing * clamp(remaining / (missing * 5 + 10), 0, 0.9);
    }
    // 草原：完成した都市は 3 点、未完成の都市は見込みの分だけ
    let value = 0;
    const seen = new Set();
    region.cityNodes.forEach(({ cell, feature }) => {
        const key = `${cell.key}/${feature}`;
        let city = cityCache.get(key);
        if (!city) {
            city = board.region(cell.x, cell.y, feature);
            city.nodes.forEach(n => cityCache.set(n.key, city));
        }
        if (seen.has(city.id)) return;
        seen.add(city.id);
        value += 3 * (city.complete ? 1 : completionChance(city.open, remaining) * 0.6);
    });
    return value * cfg.fieldWeight;
}

// 席ごとの見込みの点（領域の一覧から。extra：コマを置く領域と席）
function valuesBySeat(regions, ctx, n, extra = null) {
    const values = new Array(n).fill(0);
    regions.forEach(region => {
        const meeples = extra && extra.regionId === region.id ? [...region.meeples, { seat: extra.seat }] : region.meeples;
        if (meeples.length === 0) return;
        const v = regionValue(region, ctx);
        majority(meeples).forEach(seat => { values[seat] += v; });
    });
    return values;
}

// (x, y) に接している、すでにある領域（置く前）
function regionsAround(board, x, y) {
    const regions = new Map();
    for (let side = 0; side < 4; side++) {
        const n = board.neighbor(x, y, side);
        if (!n) continue;
        const add = fi => {
            const r = board.region(n.x, n.y, fi);
            if (!regions.has(r.id)) regions.set(r.id, r);
        };
        const opposite = oppositeSide(side);
        if (n.shape.sideFeature[opposite] !== null) add(n.shape.sideFeature[opposite]);
        [2 * side, 2 * side + 1].forEach(h => {
            const fi = n.shape.halfFeature[oppositeHalf(h)];
            if (fi !== null) add(fi);
        });
    }
    monasteriesAround(board, x, y).forEach(r => regions.set(r.id, r));
    return [...regions.values()];
}

function monasteriesAround(board, x, y) {
    const result = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const c = board.get(x + dx, y + dy);
            if (!c) continue;
            c.shape.features.forEach((f, fi) => {
                if (f.kind === 'monastery') result.push(board.region(c.x, c.y, fi));
            });
        }
    }
    return result;
}

// 置いたタイルの要素の領域（置いたあと）
function regionsOfTile(board, x, y) {
    const regions = new Map();
    const featureRegion = [];
    board.get(x, y).shape.features.forEach((f, fi) => {
        const r = board.region(x, y, fi);
        if (!regions.has(r.id)) regions.set(r.id, r);
        featureRegion[fi] = regions.get(r.id);
    });
    monasteriesAround(board, x, y).forEach(r => { if (!regions.has(r.id)) regions.set(r.id, r); });
    return { regions: [...regions.values()], featureRegion };
}

// コマを置く手間（コマが減るほど重く、草原は戻ってこないので、早い時期ほど重い）
function meepleCost(kind, meeplesLeft, remaining, completesNow) {
    if (completesNow) return 0;
    let cost = 1 + Math.max(0, 4 - meeplesLeft) * 0.9;
    if (kind === 'field') cost += 3 * (remaining / TOTAL_TILES);
    if (kind === 'city' || kind === 'road') cost += 0.6 * (1 - remaining / TOTAL_TILES); // 終わり近くは完成しにくい
    return cost;
}

/**
 * 手の候補と評価を全部返す（テストと強さの測定に使う）
 * 戻り値：[{ command, value }]
 */
export function scoreCandidates(game, seat, cfg = LEVELS.normal, random = cpuRandom(game, seat)) {
    const { board } = game;
    const n = game.players.length;
    const remaining = game.bag.length;
    const meeplesLeft = game.players[seat].meeples;
    const considerFarmers = random() < cfg.farmerChance;
    const placements = board.placements(game.tile);
    // 見落とし：置ける場所（マス）の一部を見ない。全部を見落とすことはない
    const spots = [...new Set(placements.map(p => `${p.x},${p.y}`))];
    const skipped = new Set(spots.filter(() => random() < cfg.skipSpot));
    if (skipped.size === spots.length) skipped.delete(spots[Math.floor(random() * spots.length)]);

    const candidates = [];
    placements.forEach(({ x, y, rot }) => {
        if (skipped.has(`${x},${y}`)) return;
        const before = regionsAround(board, x, y);
        const ctxBefore = { remaining, cfg, board, cityCache: new Map() };
        const valuesBefore = valuesBySeat(before, ctxBefore, n);
        board.place(x, y, game.tile, rot);
        try {
            const { regions, featureRegion } = regionsOfTile(board, x, y);
            const ctx = { remaining: remaining - 1, cfg, board, cityCache: new Map() };
            const options = [null];
            if (meeplesLeft > 0) {
                rotatedTile(game.tile, rot).features.forEach((f, fi) => {
                    if (featureRegion[fi].meeples.length > 0) return;
                    if (f.kind === 'field' && !considerFarmers) return;
                    options.push(fi);
                });
            }
            options.forEach(fi => {
                const region = fi === null ? null : featureRegion[fi];
                const after = valuesBySeat(regions, ctx, n, region ? { regionId: region.id, seat } : null);
                const delta = after.map((v, s) => v - valuesBefore[s]);
                const others = delta.filter((_, s) => s !== seat);
                const otherGain = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
                let value = delta[seat] - cfg.opponentWeight * otherGain;
                if (region) value -= meepleCost(region.kind, meeplesLeft, remaining, region.complete);
                // 自分のコマが戻る（完成した）なら、少し得
                regions.forEach(r => {
                    if (r.complete && r.meeples.some(m => m.seat === seat)) value += 0.5;
                });
                if (cfg.noise > 0) value += (random() * 2 - 1) * cfg.noise;
                candidates.push({ command: { type: 'play', x, y, rot, meeple: fi }, value });
            });
        } finally {
            board.remove(x, y);
        }
    });
    return candidates;
}

// ヒント：人の番に、CPU（ふつう）が選ぶ置き方。CPU と同じく、引いたタイルと公開の盤から決める。手は打たない
export function suggest(game, seat) {
    if (game.isOver() || game.phase !== 'play' || game.current !== seat) return null;
    return chooseCommand(game, seat, 'normal');
}

export function chooseCommand(game, seat, level = 'normal') {
    const cfg = LEVELS[level] ?? LEVELS.normal;
    const candidates = scoreCandidates(game, seat, cfg);
    let best = null;
    candidates.forEach(c => { if (!best || c.value > best.value) best = c; });
    return best?.command ?? null;
}

// CPU の番なら 1 手打つ。打てたら true
export function runCpuStep(game, levelOf = () => 'normal') {
    if (game.phase !== 'play') return false;
    const seat = game.current;
    if (!game.players[seat].isCPU) return false;
    const command = chooseCommand(game, seat, levelOf(seat));
    if (command && game.applyCommand(seat, command)) return true;
    // 想定外の断りでも止めない：コマを置かずに、最初に置ける場所へ置く
    const fallback = game.board.placements(game.tile)[0];
    return !!fallback && game.applyCommand(seat, { type: 'play', ...fallback, meeple: null });
}

export const isCpuTurn = game => game.phase === 'play' && game.players[game.current].isCPU;
