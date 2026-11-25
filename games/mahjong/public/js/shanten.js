/**
 * 向聴数と待ち
 * 向聴数は「あと何枚でテンパイか」。0 がテンパイ、-1 が和了の形
 * 一般形・七対子・国士無双のうち、一番小さいものを返す
 * 一般形は、色ごと（萬・筒・索・字）に「面子・搭子・雀頭」の取り方を全部求めて覚えておき、組み合わせて計算する
 */

import { KIND_COUNT, YAOCHU_KINDS } from './tiles.js';

const groupCache = new Map();

// 1つの色の枚数から、取れる [面子, 搭子, 雀頭(0/1)] の組を全部返す（劣るものは除く）
function groupOptions(counts, honor) {
    const key = counts.join('') + (honor ? 'z' : '');
    const hit = groupCache.get(key);
    if (hit) return hit;
    const found = new Map();
    const c = [...counts];
    const search = (i, m, t, p) => {
        while (i < c.length && c[i] === 0) i++;
        if (i >= c.length) {
            found.set(m * 100 + t * 10 + p, [m, t, p]);
            return;
        }
        if (c[i] >= 3) { c[i] -= 3; search(i, m + 1, t, p); c[i] += 3; }
        if (!honor && i + 2 < 9 && c[i + 1] > 0 && c[i + 2] > 0) {
            c[i]--; c[i + 1]--; c[i + 2]--;
            search(i, m + 1, t, p);
            c[i]++; c[i + 1]++; c[i + 2]++;
        }
        if (c[i] >= 2) {
            c[i] -= 2;
            if (!p) search(i, m, t, 1);
            search(i, m, t + 1, p);
            c[i] += 2;
        }
        if (!honor && i + 1 < 9 && c[i + 1] > 0) { c[i]--; c[i + 1]--; search(i, m, t + 1, p); c[i]++; c[i + 1]++; }
        if (!honor && i + 2 < 9 && c[i + 2] > 0) { c[i]--; c[i + 2]--; search(i, m, t + 1, p); c[i]++; c[i + 2]++; }
        c[i]--; search(i, m, t, p); c[i]++;
    };
    search(0, 0, 0, 0);
    // 面子・搭子・雀頭のどれも多いか同じものがあれば、劣るので除く
    const list = [...found.values()];
    const options = list.filter(a => !list.some(b => b !== a && b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2]
        && (b[0] > a[0] || b[1] > a[1] || b[2] > a[2])));
    if (groupCache.size > 50000) groupCache.clear();
    groupCache.set(key, options);
    return options;
}

// 一般形の向聴数。meldCount は鳴いた面子（暗槓も含む）の数
export function standardShanten(counts, meldCount = 0) {
    let states = [[0, 0, 0]];
    const groups = [[0, 9, false], [9, 18, false], [18, 27, false], [27, 34, true]];
    for (const [from, to, honor] of groups) {
        const part = counts.slice(from, to);
        if (part.every(n => n === 0)) continue;
        const options = groupOptions(part, honor);
        const next = new Map();
        states.forEach(([m, t, p]) => options.forEach(([m2, t2, p2]) => {
            if (p + p2 > 1) return;
            const key = (m + m2) * 1000 + (t + t2) * 10 + p + p2;
            next.set(key, [m + m2, t + t2, p + p2]);
        }));
        states = [...next.values()];
    }
    let best = 8;
    states.forEach(([m, t, p]) => {
        const sets = m + meldCount;
        const blocks = Math.min(t, Math.max(0, 4 - sets));
        best = Math.min(best, 8 - 2 * sets - blocks - p);
    });
    return best;
}

export function chiitoiShanten(counts) {
    let pairs = 0;
    let kinds = 0;
    counts.forEach(n => {
        if (n >= 1) kinds++;
        if (n >= 2) pairs++;
    });
    return 6 - pairs + Math.max(0, 7 - kinds);
}

export function kokushiShanten(counts) {
    let have = 0;
    let pair = false;
    YAOCHU_KINDS.forEach(k => {
        if (counts[k] >= 1) have++;
        if (counts[k] >= 2) pair = true;
    });
    return 13 - have - (pair ? 1 : 0);
}

// 向聴数（鳴いていれば一般形だけ）
export function shanten(counts, meldCount = 0) {
    const standard = standardShanten(counts, meldCount);
    if (meldCount > 0) return standard;
    return Math.min(standard, chiitoiShanten(counts), kokushiShanten(counts));
}

const waitsCache = new Map();

// 13枚（鳴いた分を除く）の待ちの種類。手の中に4枚ある種類は待ちにならない
// heldCounts を渡すと、手の中と鳴いた牌を合わせて4枚見えている種類も除く（空の待ち）
export function waitsOf(counts, meldCount = 0, heldCounts = counts) {
    const total = counts.reduce((s, n) => s + n, 0);
    if (total % 3 !== 1) return [];
    const key = counts.join('') + meldCount;
    let waits = waitsCache.get(key);
    if (!waits) {
        waits = [];
        if (shanten(counts, meldCount) === 0) {
            const c = [...counts];
            for (let k = 0; k < KIND_COUNT; k++) {
                if (c[k] >= 4) continue;
                c[k]++;
                if (shanten(c, meldCount) === -1) waits.push(k);
                c[k]--;
            }
        }
        if (waitsCache.size > 20000) waitsCache.clear();
        waitsCache.set(key, waits);
    }
    return waits.filter(k => heldCounts[k] < 4);
}

