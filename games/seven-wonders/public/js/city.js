/**
 * 都市の計算（DOM に依存しない。ゲーム・CPU・画面・テストが同じものを使う）
 * 生産・隣から買える資源・交易の値段・払い方の候補・科学の点・最後の得点
 *
 * 引数の city：{ wonder, side, built: [カードの id], stages, coins, tokens: [軍事の点], defeats }
 */

import { cardOf, keyOf, WONDER_BY_KEY, RAW, MANUFACTURED, MILITARY_WIN } from './cards.js';

export const leftOf = (seat, n) => (seat + n - 1) % n;
export const rightOf = (seat, n) => (seat + 1) % n;

export const wonderOf = city => WONDER_BY_KEY[city.wonder];
export const stagesOf = city => wonderOf(city)[city.side];
export const builtStages = city => stagesOf(city).slice(0, city.stages);
export const hasEffect = (city, effect) => builtStages(city).some(s => s.effect === effect);
export const cardsOf = (city, color) => city.built.filter(id => cardOf(id).color === color);
export const hasBuilt = (city, key) => city.built.some(id => keyOf(id) === key);
export const hasSameName = (city, id) => city.built.some(b => cardOf(b).name === cardOf(id).name);

// 自分が使える生産（producer の配列）
export function producersOf(city) {
    const list = [[wonderOf(city).resource]];
    city.built.forEach(id => (cardOf(id).produce ?? []).forEach(p => list.push(p)));
    builtStages(city).forEach(s => {
        if (s.effect === 'rawChoice') list.push([...RAW]);
        if (s.effect === 'manufacturedChoice') list.push([...MANUFACTURED]);
    });
    return list;
}

// 隣に売れる生産（はじめの資源と、原材料・加工品のカード。商業のカードと不思議の段階は売れない）
export function sellableOf(city) {
    const list = [[wonderOf(city).resource]];
    city.built.forEach(id => {
        const c = cardOf(id);
        if (c.color === 'brown' || c.color === 'grey') c.produce.forEach(p => list.push(p));
    });
    return list;
}

// side（'left' / 'right'）の隣から resource を買う値段
export function tradePrice(city, side, resource) {
    const raw = RAW.includes(resource);
    for (const id of city.built) {
        const t = cardOf(id).trade;
        if (!t) continue;
        if (raw && t.raw?.includes(side)) return 1;
        if (!raw && t.manufactured?.includes(side)) return 1;
    }
    if (raw && hasEffect(city, 'tradeRaw')) return 1;
    return 2;
}

/**
 * cost（資源の文字列）を払う方法の候補：[{ left, right }]（隣に払うコイン）
 * ほかの候補より左右どちらも多く払うものは除く。払えなければ空
 */
export function paymentOptions(cities, seat, cost) {
    if (!cost) return [{ left: 0, right: 0 }];
    const n = cities.length;
    const city = cities[seat];
    const own = producersOf(city);
    const sides = { left: sellableOf(cities[leftOf(seat, n)]), right: sellableOf(cities[rightOf(seat, n)]) };
    // 加工品・選べない生産が少ない資源から先に割り当てる（探索を早く絞る）
    const units = [...cost].sort((a, b) => MANUFACTURED.includes(b) - MANUFACTURED.includes(a));
    const pairs = new Map();
    const seen = new Set();
    const usedOwn = new Array(own.length).fill(false);
    const used = { left: new Array(sides.left.length).fill(false), right: new Array(sides.right.length).fill(false) };
    const prices = {
        left: Object.fromEntries([...RAW, ...MANUFACTURED].map(r => [r, tradePrice(city, 'left', r)])),
        right: Object.fromEntries([...RAW, ...MANUFACTURED].map(r => [r, tradePrice(city, 'right', r)]))
    };
    const dfs = (i, left, right) => {
        const key = `${i}|${usedOwn.map(Number).join('')}|${used.left.map(Number).join('')}|${used.right.map(Number).join('')}|${left}|${right}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (i === units.length) {
            pairs.set(`${left},${right}`, { left, right });
            return;
        }
        const r = units[i];
        // 同じ選び方の生産は、最初の 1 つだけ試す（同じ結果になるので）
        const tried = new Set();
        own.forEach((p, k) => {
            const sig = p.join('');
            if (usedOwn[k] || !p.includes(r) || tried.has(sig)) return;
            tried.add(sig);
            usedOwn[k] = true;
            dfs(i + 1, left, right);
            usedOwn[k] = false;
        });
        ['left', 'right'].forEach(side => {
            const triedSide = new Set();
            sides[side].forEach((p, k) => {
                const sig = p.join('');
                if (used[side][k] || !p.includes(r) || triedSide.has(sig)) return;
                triedSide.add(sig);
                used[side][k] = true;
                if (side === 'left') dfs(i + 1, left + prices.left[r], right);
                else dfs(i + 1, left, right + prices.right[r]);
                used[side][k] = false;
            });
        });
    };
    dfs(0, 0, 0);
    const all = [...pairs.values()];
    return all.filter(a => !all.some(b => b !== a && b.left <= a.left && b.right <= a.right && (b.left < a.left || b.right < a.right)))
        .sort((a, b) => a.left + a.right - (b.left + b.right) || a.left - b.left);
}

// 科学の点：同じ記号の数の 2 乗の合計 ＋ 3 種そろうごとに 7 点（好きな記号は、一番点が高くなるように選ぶ）
export function sciencePoints(counts, wild = 0) {
    const score = ([c, g, t]) => c * c + g * g + t * t + 7 * Math.min(c, g, t);
    if (wild === 0) return score(counts);
    let best = 0;
    for (let k = 0; k < 3; k++) {
        const next = [...counts];
        next[k]++;
        best = Math.max(best, sciencePoints(next, wild - 1));
    }
    return best;
}

export function scienceOf(city) {
    const counts = [0, 0, 0];
    let wild = 0;
    city.built.forEach(id => {
        const s = cardOf(id).science;
        if (s === 'any') wild++;
        else if (s) counts['cgt'.indexOf(s)]++;
    });
    builtStages(city).forEach(s => { if (s.effect === 'science') wild++; });
    return { counts, wild };
}

export const shieldsOf = city => city.built.reduce((sum, id) => sum + (cardOf(id).shields ?? 0), 0)
    + builtStages(city).reduce((sum, s) => sum + (s.shields ?? 0), 0);

// 数える対象（per）の数
function countFor(cities, seat, per, who) {
    const n = cities.length;
    const seats = who === 'self' ? [seat] : who === 'neighbors' ? [leftOf(seat, n), rightOf(seat, n)] : [seat, leftOf(seat, n), rightOf(seat, n)];
    return seats.reduce((sum, s) => {
        const city = cities[s];
        if (per === 'stages') return sum + city.stages;
        if (per === 'defeats') return sum + city.defeats;
        if (per === 'brownGreyPurple') return sum + city.built.filter(id => ['brown', 'grey', 'purple'].includes(cardOf(id).color)).length;
        return sum + cardsOf(city, per).length;
    }, 0);
}

// 建てたときにもらうコイン（酒場・ぶどう園・港など）
export function gainOf(cities, seat, id) {
    const g = cardOf(id).gain;
    if (!g) return 0;
    if (g.per) return g.coins * countFor(cities, seat, g.per, g.who);
    return g.coins;
}

// ギルド・商業のカードの終わりの点
function pointsOf(cities, seat, id) {
    const p = cardOf(id).points;
    return p ? p.vp * countFor(cities, seat, p.per, p.who) : 0;
}

/**
 * 最後の得点の内訳：military 軍事・treasury お金・wonder 不思議・civilian 市民・science 科学・commercial 商業・guilds ギルド
 */
export function scoreOf(cities, seat) {
    const city = cities[seat];
    const base = {
        military: city.tokens.reduce((a, b) => a + b, 0) - city.defeats,
        treasury: Math.floor(city.coins / 3),
        wonder: builtStages(city).reduce((sum, s) => sum + (s.vp ?? 0), 0),
        civilian: cardsOf(city, 'blue').reduce((sum, id) => sum + cardOf(id).vp, 0),
        commercial: cardsOf(city, 'yellow').reduce((sum, id) => sum + pointsOf(cities, seat, id), 0),
        guilds: cardsOf(city, 'purple').reduce((sum, id) => sum + pointsOf(cities, seat, id), 0)
    };
    const sci = scienceOf(city);
    base.science = sciencePoints(sci.counts, sci.wild);
    // オリンピア B：隣のギルドを 1 つ写す（一番点が高くなるもの）
    if (hasEffect(city, 'copyGuild')) {
        const n = cities.length;
        const guilds = [...cardsOf(cities[leftOf(seat, n)], 'purple'), ...cardsOf(cities[rightOf(seat, n)], 'purple')]
            .filter(id => !hasBuilt(city, keyOf(id)));
        let best = { guilds: 0, science: 0, copied: null };
        guilds.forEach(id => {
            const gain = cardOf(id).science === 'any'
                ? { guilds: 0, science: sciencePoints(sci.counts, sci.wild + 1) - base.science }
                : { guilds: pointsOf(cities, seat, id), science: 0 };
            if (gain.guilds + gain.science > best.guilds + best.science) best = { ...gain, copied: keyOf(id) };
        });
        base.guilds += best.guilds;
        base.science += best.science;
        base.copiedGuild = best.copied;
    }
    base.total = base.military + base.treasury + base.wonder + base.civilian + base.science + base.commercial + base.guilds;
    return base;
}

// 時代の終わりの軍事：両隣と盾の数を比べ、勝てば時代の点、負ければ -1
export function militaryResults(cities, age) {
    const n = cities.length;
    return cities.map((city, seat) => {
        const mine = shieldsOf(city);
        return [leftOf(seat, n), rightOf(seat, n)].map(other => {
            const theirs = shieldsOf(cities[other]);
            return { against: other, result: mine > theirs ? 'win' : mine < theirs ? 'lose' : 'tie', points: mine > theirs ? MILITARY_WIN[age] : mine < theirs ? -1 : 0 };
        });
    });
}
