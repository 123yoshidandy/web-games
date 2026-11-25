/**
 * 組の強さ（DOM に依存しない）
 * 強さは「種類 × 1000 ＋ 数の合計」。種類は上から 5 同色の連番・4 同じ数・3 同色・2 連番・1 合計
 * 目隠し鬼の石では、合計だけで比べる
 *
 * bestFormation は、置いてあるカードに、残りの枠を「まだ場に出ていないカード」で埋めたときに作れる、いちばん強い組を返す
 * 総当たりせず、種類ごとに上から「作れるか」と「合計の最大」を求める。埋められなければ -1
 * 主張の証明（相手がこれ以上の組を作れないこと）と、CPU の見込みの両方に使う
 */

export const COLORS = 6;
export const VALUES = 9;
export const KINDS = { colorRun: 5, same: 4, color: 3, run: 2, sum: 1 };
export const KIND_NAMES = { 5: '同色の連番', 4: '同じ数', 3: '同色', 2: '連番', 1: '合計' };

export const clanId = (c, v) => c * VALUES + (v - 1);
export const colorOf = (id) => Math.floor(id / VALUES);
export const valueOf = (id) => (id % VALUES) + 1;

// まだ出ていない、組に使えるジョーカーなど（出すときに色と数を決める）
// joker：どの色・数にもなる / spy：どの色の7にもなる / shield：どの色の1〜3にもなる
const WILD_VALUES = { joker: [1, 2, 3, 4, 5, 6, 7, 8, 9], spy: [7], shield: [1, 2, 3] };
const maxWild = (name) => Math.max(...WILD_VALUES[name]);

export const kindOf = (strength) => Math.floor(strength / 1000);

// cards：置いてあるカード [{ c, v }]。size：枠の数（3、泥んこ合戦なら4）
// pool：{ clan: Set（まだ出ていない氏族カードの番号）, wilds: ['joker', ...] }。blind：目隠し鬼
export function bestFormation(cards, size, pool = { clan: new Set(), wilds: [] }, blind = false) {
    const need = size - cards.length;
    if (need < 0) return -1;
    const sumFixed = cards.reduce((s, x) => s + x.v, 0);
    const wilds = pool.wilds ?? [];
    // 合計を大きくする埋め方（色を限るなら c）
    const topFill = (c = null) => {
        const values = [];
        pool.clan.forEach(id => { if (c === null || colorOf(id) === c) values.push(valueOf(id)); });
        wilds.forEach(name => values.push(maxWild(name)));
        if (values.length < need) return null;
        values.sort((a, b) => b - a);
        return values.slice(0, need).reduce((s, v) => s + v, 0);
    };
    if (blind) {
        const fill = topFill();
        return fill === null ? -1 : KINDS.sum * 1000 + sumFixed + fill;
    }
    const sameColor = (c) => cards.every(x => x.c === c);

    // 連番（色を限るなら c）：上の数から順に、埋められるかを見る
    const bestRun = (c) => {
        for (let start = VALUES - size + 1; start >= 1; start--) {
            const set = Array.from({ length: size }, (_, i) => start + i);
            const values = cards.map(x => x.v);
            if (values.some(v => !set.includes(v)) || new Set(values).size !== values.length) continue;
            const missing = set.filter(v => !values.includes(v));
            if (canFill(missing.map(v => ({ c, v })), pool.clan, wilds)) return set.reduce((s, v) => s + v, 0);
        }
        return null;
    };

    let best = -1;
    // 同色の連番
    for (let c = 0; c < COLORS; c++) {
        if (!sameColor(c)) continue;
        const sum = bestRun(c);
        if (sum !== null) best = Math.max(best, KINDS.colorRun * 1000 + sum);
    }
    if (best >= 0) return best;
    // 同じ数
    for (let x = VALUES; x >= 1; x--) {
        if (!cards.every(card => card.v === x)) continue;
        let fillers = 0;
        pool.clan.forEach(id => { if (valueOf(id) === x) fillers++; });
        fillers += wilds.filter(name => WILD_VALUES[name].includes(x)).length;
        if (fillers >= need) return KINDS.same * 1000 + size * x;
    }
    // 同色
    for (let c = 0; c < COLORS; c++) {
        if (!sameColor(c)) continue;
        const fill = topFill(c);
        if (fill !== null) best = Math.max(best, KINDS.color * 1000 + sumFixed + fill);
    }
    if (best >= 0) return best;
    // 連番
    const run = bestRun(null);
    if (run !== null) return KINDS.run * 1000 + run;
    // 合計
    const fill = topFill();
    return fill === null ? -1 : KINDS.sum * 1000 + sumFixed + fill;
}

// 決まった色・数の枠を、まだ出ていない氏族カードかジョーカーなどで、すべて埋められるか
function canFill(slots, clan, wilds) {
    const used = new Set();
    const usedWild = new Set();
    const fill = (i) => {
        if (i === slots.length) return true;
        const { c, v } = slots[i];
        const ids = c === null ? Array.from({ length: COLORS }, (_, k) => clanId(k, v)) : [clanId(c, v)];
        for (const id of ids) {
            if (clan.has(id) && !used.has(id)) {
                used.add(id);
                if (fill(i + 1)) return true;
                used.delete(id);
            }
        }
        for (let w = 0; w < wilds.length; w++) {
            if (usedWild.has(w) || !WILD_VALUES[wilds[w]].includes(v)) continue;
            usedWild.add(w);
            if (fill(i + 1)) return true;
            usedWild.delete(w);
        }
        return false;
    };
    return fill(0);
}

export function describe(strength) {
    if (strength < 0) return '';
    return `${KIND_NAMES[kindOf(strength)]} ${strength % 1000}`;
}
