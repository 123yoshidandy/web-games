/**
 * 得点の計算（動物の得点カード20枚・地形のつながり・最大のつながりのボーナス）
 * 点数表は、ルールブックのカードの絵と得点の例、有志の実装（TMahls/Cascadia・exp111/Cascadia・phyrwork/cascadai・davidxmoody/cascadia-ai）で照らし合わせた
 * 食い違う点と、資料で分からない点の決め方は README に書く
 *
 * 共通：群れは、となり合う同じ動物のまとまり。形を作るカード（ヘラジカ A・B・D、キツネ D、タカ D）は、
 * 1つのトークンを1つの形にしか数えず、いちばん点が高くなる分け方で数える
 */

import { HABITATS, ANIMALS } from './tiles.js';
import { key, parseKey, DIRS } from './hex.js';
import { largestCorridor } from './habitat.js';
import { tokenMap, cellsOf, groups, adjacentKeys, adjacentAnimals, lookup, lineBetween } from './score-tools.js';

export const CARD_IDS = ['A', 'B', 'C', 'D'];

export const TABLES = {
    bearA: [4, 11, 19, 27],           // ちょうど2頭の群れの数
    bearC: { 1: 2, 2: 5, 3: 8 },      // ＋1・2・3頭の群れのそろい1組につき 3
    bearD: { 2: 5, 3: 8, 4: 13 },
    elkLine: [2, 5, 9, 13],           // A：直線（4頭まで）
    elkShape: [2, 5, 9, 13],          // B：1頭・2頭・三角・ひし形
    elkHerd: [2, 4, 7, 10, 14, 18, 23, 28], // C：群れの大きさ
    elkRing: [2, 5, 8, 12, 16, 21],   // D：1つのマスを囲む弧
    salmonA: [2, 5, 8, 12, 16, 20, 25],
    salmonB: [2, 4, 9, 11, 17],
    salmonC: [0, 0, 10, 12, 15],
    hawkA: [2, 5, 8, 11, 14, 18, 22, 26],
    hawkB: [0, 5, 9, 12, 16, 20, 24, 28],
    hawkD: [4, 7, 9]                  // あいだの動物の種類の数
};

// ---- 形の分け方（総当たり。群れの中のマスをビットで表す） ----

// cells：群れのマスの key。shapes：形（key の配列）と点の組。いちばん高い合計
function bestPartition(cells, shapes) {
    if (cells.length > 30) return null;
    const index = new Map(cells.map((k, i) => [k, i]));
    // 形を、いちばん小さい番号のマスに登録する
    const lists = cells.map(() => []);
    shapes.forEach(({ keys, points }) => {
        if (!keys.every(k => index.has(k))) return;
        const mask = keys.reduce((m, k) => m | (1 << index.get(k)), 0);
        lists[31 - Math.clz32(mask & -mask)].push({ mask, points });
    });
    return searchMasks(cells.length, lists);
}

// lists[i]：マス i がいちばん小さい番号の形。重ならないように選んだ点の合計の最大（どの形にも入らないマスは0点）
function searchMasks(n, lists) {
    const memo = new Map();
    const dfs = (rest) => {
        if (rest === 0) return 0;
        if (memo.has(rest)) return memo.get(rest);
        const low = 31 - Math.clz32(rest & -rest);
        let best = dfs(rest & ~(1 << low));
        for (const s of lists[low]) {
            if ((s.mask & rest) !== s.mask) continue;
            const v = s.points + dfs(rest & ~s.mask);
            if (v > best) best = v;
        }
        memo.set(rest, best);
        return best;
    };
    return dfs(n === 0 ? 0 : 2 ** n - 1);
}

const neighborKey = (k, d) => {
    const [q, r] = parseKey(k);
    return key(q + DIRS[d][0], r + DIRS[d][1]);
};

// 直線（向き 0〜2 の軸。1〜4頭）
function lineShapes(cells, table) {
    const set = new Set(cells);
    const out = cells.map(k => ({ keys: [k], points: table[0] }));
    cells.forEach(k => {
        for (let d = 0; d < 3; d++) {
            const keys = [k];
            let c = k;
            for (let n = 2; n <= table.length; n++) {
                c = neighborKey(c, d);
                if (!set.has(c)) break;
                keys.push(c);
                out.push({ keys: [...keys], points: table[n - 1] });
            }
        }
    });
    return out;
}

// 1頭・2頭・三角・ひし形（三角2つが辺を共有する形）
function formationShapes(cells, table) {
    const set = new Set(cells);
    const out = cells.map(k => ({ keys: [k], points: table[0] }));
    const seen = new Set();
    const add = (keys, points) => {
        const id = [...keys].sort().join('|');
        if (seen.has(id)) return;
        seen.add(id);
        out.push({ keys, points });
    };
    cells.forEach(a => {
        adjacentKeys(a).filter(b => set.has(b)).forEach(b => {
            add([a, b], table[1]);
            const common = adjacentKeys(a).filter(c => c !== b && adjacentKeys(b).includes(c));
            const inside = common.filter(c => set.has(c));
            inside.forEach(c => add([a, b, c], table[2]));
            if (inside.length === 2) add([a, b, ...inside], table[3]);
        });
    });
    return out;
}

// 1つのマス（中身は何でもよい）を囲む6マスのうちの何頭か（1〜6頭。欠けた輪や、間が空いた輪でもよい。作者の回答による）
function ringShapes(cells, table) {
    const set = new Set(cells);
    const out = cells.map(k => ({ keys: [k], points: table[0] }));
    const seen = new Set();
    const centers = new Set(cells.flatMap(k => adjacentKeys(k)));
    centers.forEach(c => {
        const ring = DIRS.map((_, d) => neighborKey(c, d)).filter(k => set.has(k));
        for (let mask = 1; mask < 1 << ring.length; mask++) {
            const keys = ring.filter((_, i) => mask & (1 << i));
            if (keys.length < 2) continue;
            const id = [...keys].sort().join('|');
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({ keys, points: table[keys.length - 1] });
        }
    });
    return out;
}

// 距離2以内でつながるまとまり（間が空いた輪は、となり合わないヘラジカをまたぐため）
function nearGroups(cells) {
    const set = new Set(cells);
    const seen = new Set();
    const out = [];
    cells.forEach(start => {
        if (seen.has(start)) return;
        const group = [];
        const queue = [start];
        seen.add(start);
        while (queue.length) {
            const k = queue.pop();
            group.push(k);
            new Set(adjacentKeys(k).flatMap(n => [n, ...adjacentKeys(n)])).forEach(n => {
                if (set.has(n) && !seen.has(n)) {
                    seen.add(n);
                    queue.push(n);
                }
            });
        }
        out.push(group);
    });
    return out;
}

// ---- 動物ごと ----

function bear(tokens, card) {
    const sizes = groups(tokens, 'bear').map(g => g.length);
    const count = (n) => sizes.filter(s => s === n).length;
    if (card === 'A') return lookup(TABLES.bearA, count(2));
    if (card === 'B') return 10 * count(3);
    if (card === 'C') {
        const base = sizes.reduce((s, n) => s + (TABLES.bearC[n] ?? 0), 0);
        // 1・2・3頭の群れのそろい1組につき3（そろいが2組なら2回。作者の回答による）
        return base + 3 * Math.min(count(1), count(2), count(3));
    }
    return sizes.reduce((s, n) => s + (TABLES.bearD[n] ?? 0), 0);
}

function elk(tokens, card) {
    if (card === 'D') {
        return nearGroups(cellsOf(tokens, 'elk')).reduce((sum, g) => sum + (bestPartition(g, ringShapes(g, TABLES.elkRing)) ?? g.length * 2), 0);
    }
    return groups(tokens, 'elk').reduce((sum, g) => {
        if (card === 'C') {
            const t = TABLES.elkHerd;
            // 8頭を超える群れは、8頭ずつに分けて数える（作者の回答による）
            return sum + Math.floor(g.length / t.length) * t.at(-1) + lookup(t, g.length % t.length);
        }
        const shapes = card === 'A' ? lineShapes(g, TABLES.elkLine) : formationShapes(g, TABLES.elkShape);
        return sum + (bestPartition(g, shapes) ?? g.length * 2);
    }, 0);
}

// サケの列：どのサケも、となりのサケが2匹以下の群れ。3匹以上のサケと接するサケは外し（外して新たにそうなったものも外す）、
// 残りを列として数える（作者の回答による。ルールブックの文面では、その群れ全体が列にならない。README を参照）
function salmonRuns(tokens) {
    const set = new Set(cellsOf(tokens, 'salmon'));
    for (;;) {
        const bad = [...set].filter(k => adjacentKeys(k).filter(n => set.has(n)).length > 2);
        if (!bad.length) break;
        bad.forEach(k => set.delete(k));
    }
    const kept = {};
    set.forEach(k => { kept[k] = 'salmon'; });
    return groups(kept, 'salmon');
}

function salmon(tokens, card) {
    return salmonRuns(tokens).reduce((sum, g) => {
        const n = g.length;
        if (card === 'A') return sum + lookup(TABLES.salmonA, n);
        if (card === 'B') return sum + lookup(TABLES.salmonB, n);
        if (card === 'C') return sum + lookup(TABLES.salmonC, n);
        if (n < 3) return sum;
        // D：サケの数＋列のとなりにあるトークン（サケ以外。1つのマスは1回）
        const set = new Set(g);
        const near = new Set(g.flatMap(k => adjacentKeys(k)).filter(k => !set.has(k) && tokens[k] && tokens[k] !== 'salmon'));
        return sum + n + near.size;
    }, 0);
}

// タカどうしの視線：同じ直線の上にあり、となりではなく、あいだにタカがいない
function sightLines(tokens) {
    const hawks = cellsOf(tokens, 'hawk');
    const lines = [];
    for (let i = 0; i < hawks.length; i++) {
        for (let j = i + 1; j < hawks.length; j++) {
            const line = lineBetween(hawks[i], hawks[j]);
            if (!line || line.length < 2) continue;
            if (line.between.some(k => tokens[k] === 'hawk')) continue;
            lines.push({ a: i, b: j, between: line.between });
        }
    }
    return { hawks, lines };
}

function hawk(tokens, card) {
    const hawks = cellsOf(tokens, 'hawk');
    const lonely = hawks.filter(k => !adjacentAnimals(tokens, k).includes('hawk'));
    if (card === 'A') return lookup(TABLES.hawkA, lonely.length);
    const { lines } = sightLines(tokens);
    if (card === 'B') {
        const seen = new Set(lines.flatMap(l => [hawks[l.a], hawks[l.b]]));
        return lookup(TABLES.hawkB, lonely.filter(k => seen.has(k)).length);
    }
    if (card === 'C') return 3 * lines.length;
    // D：視線の通る2羽の組（1羽は1組だけ）。あいだの動物（タカ以外）の種類の数で点
    const value = lines.map(l => lookup(TABLES.hawkD, new Set(l.between.map(k => tokens[k]).filter(a => a && a !== 'hawk')).size));
    return bestMatching(hawks.length, lines.map((l, i) => ({ a: l.a, b: l.b, points: value[i] })));
}

// 2つずつの組（1つは1組だけ）の点の合計がいちばん高い選び方
function bestMatching(n, pairs) {
    if (n > 30) return 0;
    const lists = Array.from({ length: n }, () => []);
    pairs.forEach(p => {
        if (p.points > 0) lists[Math.min(p.a, p.b)].push({ mask: (1 << p.a) | (1 << p.b), points: p.points });
    });
    return searchMasks(n, lists);
}

// 動物ごとの数（同じ動物を2つ以上数えた種類が「組」）
const countTypes = (animals) => {
    const counts = {};
    animals.forEach(a => { counts[a] = (counts[a] ?? 0) + 1; });
    return counts;
};

function fox(tokens, card) {
    const foxes = cellsOf(tokens, 'fox');
    if (card === 'D') {
        // キツネの組（となり合う2匹。1匹は1組だけ）：組のまわりの8マスで、キツネ以外の動物の組（2つ以上）の種類の数
        const pairs = [];
        for (let i = 0; i < foxes.length; i++) {
            for (let j = i + 1; j < foxes.length; j++) {
                if (!adjacentKeys(foxes[i]).includes(foxes[j])) continue;
                const around = new Set([...adjacentKeys(foxes[i]), ...adjacentKeys(foxes[j])]);
                around.delete(foxes[i]);
                around.delete(foxes[j]);
                const counts = countTypes([...around].map(k => tokens[k]).filter(a => a && a !== 'fox'));
                const kinds = Object.values(counts).filter(c => c >= 2).length;
                pairs.push({ a: i, b: j, points: kinds ? 2 * kinds + 3 : 0 });
            }
        }
        return bestMatching(foxes.length, pairs);
    }
    return foxes.reduce((sum, k) => {
        const near = adjacentAnimals(tokens, k);
        if (card === 'A') return sum + new Set(near).size;
        const counts = countTypes(near.filter(a => a !== 'fox'));
        if (card === 'B') {
            const kinds = Object.values(counts).filter(c => c >= 2).length;
            return sum + (kinds ? 2 * kinds + 1 : 0);
        }
        return sum + Math.max(0, ...Object.values(counts));
    }, 0);
}

const SCORERS = { bear, elk, salmon, hawk, fox };

// その動物の点（tokens：key → 動物）
export function scoreAnimal(tokens, animal, card) {
    return SCORERS[animal](tokens, card);
}

// 1人の地の点（ボーナスと自然トークンは含まない）
export function scoreEnv(env, cards) {
    const tokens = tokenMap(env);
    const wildlife = {};
    ANIMALS.forEach(a => { wildlife[a] = scoreAnimal(tokens, a, cards[a]); });
    const habitat = {};
    HABITATS.forEach(h => { habitat[h] = largestCorridor(env, h); });
    const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
    return { wildlife, habitat, total: sum(wildlife) + sum(habitat) };
}

/**
 * 最大のつながりのボーナス（sizes：各人のその地形のいちばん大きいつながり）
 * 1人：7以上なら2点。2人：大きい方に2点、同じなら1点ずつ
 * 3〜4人：いちばん大きい人に3点、2番目に1点。いちばんが2人なら2点ずつ、3人以上なら1点ずつで、2番目はなし。2番目が並んだら0点
 */
export function habitatBonus(sizes, n = sizes.length) {
    if (n === 1) return sizes.map(s => (s >= 7 ? 2 : 0));
    const top = Math.max(...sizes);
    const first = sizes.map((s, i) => (s === top ? i : -1)).filter(i => i >= 0);
    const out = sizes.map(() => 0);
    if (top <= 0) return out;
    if (n === 2) {
        first.forEach(i => { out[i] = first.length > 1 ? 1 : 2; });
        return out;
    }
    if (first.length === 1) {
        out[first[0]] = 3;
        const rest = sizes.filter((_, i) => i !== first[0]);
        const second = Math.max(...rest);
        const seconds = sizes.map((s, i) => (i !== first[0] && s === second ? i : -1)).filter(i => i >= 0);
        if (second > 0 && seconds.length === 1) out[seconds[0]] = 1;
    } else {
        first.forEach(i => { out[i] = first.length === 2 ? 2 : 1; });
    }
    return out;
}

// 全員の点（envs：各人の地、natures：各人の残った自然トークン）
export function scoreGame(envs, cards, natures) {
    const base = envs.map(env => scoreEnv(env, cards));
    const n = envs.length;
    const bonus = base.map(() => ({}));
    HABITATS.forEach(h => {
        habitatBonus(base.map(b => b.habitat[h]), n).forEach((v, i) => { bonus[i][h] = v; });
    });
    return {
        players: base.map((b, i) => {
            const bonusTotal = Object.values(bonus[i]).reduce((s, v) => s + v, 0);
            return { wildlife: b.wildlife, habitat: b.habitat, bonus: bonus[i], nature: natures[i], total: b.total + bonusTotal + natures[i] };
        })
    };
}
