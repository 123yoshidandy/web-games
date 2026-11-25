/**
 * ティチューのカードと組
 * カードは 0〜55 の番号。0〜51 は4色×（2〜A）で、番号 = 色×13 + (数−2)。52 麻雀・53 犬・54 不死鳥・55 竜
 * 数は 2〜14（J=11・Q=12・K=13・A=14）。麻雀は 1
 *
 * 組（出せる形）
 * - single 1枚 / pair 同じ数の2枚 / triple 同じ数の3枚 / fullhouse 3枚組＋ペア / straight 5枚以上の連続した数 / pairs 連続した数のペアを2組以上
 * - bomb 爆弾：同じ数の4枚、または同じ色の5枚以上の階段。いつでも出せ、爆弾でない組すべてに勝つ。爆弾どうしは枚数、次に数で比べる
 * - 不死鳥：1枚出しでは直前のカードの 0.5 上（最初に出せば 1.5）。竜には勝てない。組の中では、2〜A の好きな数の代わり（爆弾には使えない）
 * - 竜：1枚出しでいちばん強い（爆弾にだけ負ける）。犬：最初に1枚だけで出し、味方に出す番を渡す
 */

export const MAHJONG = 52;
export const DOG = 53;
export const PHOENIX = 54;
export const DRAGON = 55;
export const SPECIALS = [MAHJONG, DOG, PHOENIX, DRAGON];
export const DECK_SIZE = 56;
export const SUIT_NAMES = ['翡翠', '剣', '宝塔', '星'];
export const RANK_LABELS = { 1: '1', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (rank) => RANK_LABELS[rank] ?? String(rank);
export const SPECIAL_NAMES = { [MAHJONG]: '麻雀', [DOG]: '犬', [PHOENIX]: '不死鳥', [DRAGON]: '竜' };

export const isSpecial = (card) => card >= 52;
export const suitOf = (card) => (card < 52 ? Math.floor(card / 13) : -1);
// 並べる順の強さ（手札の並び替えにも使う）。犬 0・麻雀 1・2〜A・不死鳥 15・竜 16
export function rankOf(card) {
    if (card < 52) return (card % 13) + 2;
    return { [MAHJONG]: 1, [DOG]: 0, [PHOENIX]: 15, [DRAGON]: 16 }[card];
}
export const cardOf = (suit, rank) => suit * 13 + (rank - 2);
export const sortCards = (cards) => [...cards].sort((a, b) => rankOf(a) - rankOf(b) || a - b);

export function cardPoints(card) {
    if (card === DRAGON) return 25;
    if (card === PHOENIX) return -25;
    if (card >= 52) return 0;
    const rank = rankOf(card);
    return rank === 5 ? 5 : rank === 10 || rank === 13 ? 10 : 0;
}
export const pointsOf = (cards) => cards.reduce((s, c) => s + cardPoints(c), 0);

export function cardName(card) {
    if (card >= 52) return SPECIAL_NAMES[card];
    return `${SUIT_NAMES[suitOf(card)]}の${rankLabel(rankOf(card))}`;
}

// ---- 組の判定 ----

// 不死鳥を含まないカード（数と色）を、組に分ける。組でなければ null
function classifyPlain(items) {
    const n = items.length;
    const ranks = items.map(x => x.rank).sort((a, b) => a - b);
    const counts = new Map();
    ranks.forEach(r => counts.set(r, (counts.get(r) ?? 0) + 1));
    const distinct = [...counts.keys()].sort((a, b) => a - b);
    const top = ranks[n - 1];
    if (distinct.length === 1 && !ranks.includes(1)) {
        if (n === 2) return { type: 'pair', rank: top, length: 1 };
        if (n === 3) return { type: 'triple', rank: top, length: 1 };
        if (n === 4 && !items.some(x => x.wild)) return { type: 'bomb', rank: top, length: 4 };
    }
    if (n === 5 && distinct.length === 2 && !ranks.includes(1)) {
        const [a, b] = distinct;
        const triple = counts.get(a) === 3 ? a : counts.get(b) === 3 ? b : null;
        if (triple !== null) return { type: 'fullhouse', rank: triple, length: 1 };
    }
    const consecutive = distinct.every((r, i) => i === 0 || r === distinct[i - 1] + 1);
    if (n >= 5 && distinct.length === n && consecutive) {
        const flush = !items.some(x => x.wild) && !ranks.includes(1) && items.every(x => x.suit === items[0].suit);
        return { type: flush ? 'bomb' : 'straight', rank: top, length: n };
    }
    if (n >= 4 && n % 2 === 0 && consecutive && !ranks.includes(1) && distinct.every(r => counts.get(r) === 2)) {
        return { type: 'pairs', rank: top, length: n / 2 };
    }
    return null;
}

const rankOrder = (combo) => (combo.type === 'bomb' ? combo.length * 100 + combo.rank : combo.rank);

// cards（番号の配列）を組に分ける。不死鳥は、組の中なら 2〜A のどれか（table に勝てる・いちばん強い数を選ぶ）
// table：場のいちばん上の組（なければ null）。組にならなければ null
export function classify(cards, table = null) {
    const n = cards.length;
    if (n === 0 || new Set(cards).size !== n) return null;
    if (n === 1) {
        const card = cards[0];
        if (card === DOG) return { type: 'dog', rank: 0, length: 1, cards: [...cards] };
        if (card === DRAGON) return { type: 'single', rank: 16, length: 1, cards: [...cards] };
        if (card === PHOENIX) {
            // 直前のカードの 0.5 上（最初なら 1.5）。竜には勝てない
            const base = table?.type === 'single' ? table.rank : 1;
            return { type: 'single', rank: base + 0.5, length: 1, cards: [...cards], phoenix: true };
        }
        return { type: 'single', rank: rankOf(card), length: 1, cards: [...cards] };
    }
    if (cards.some(c => c === DOG || c === DRAGON)) return null;
    const plain = cards.filter(c => c !== PHOENIX).map(c => ({ rank: rankOf(c), suit: suitOf(c) }));
    const wild = n - plain.length;
    let options = [];
    if (wild === 0) {
        const combo = classifyPlain(plain);
        if (combo) options.push(combo);
    } else {
        for (let v = 2; v <= 14; v++) {
            const combo = classifyPlain([...plain, { rank: v, suit: -1, wild: true }]);
            if (combo && combo.type !== 'bomb') options.push({ ...combo, phoenixAs: v });
        }
    }
    if (options.length === 0) return null;
    // 場に勝てる読み方があればその中で、なければ全体の中で、いちばん強い読み方
    const winning = table ? options.filter(o => beats(o, table)) : [];
    if (winning.length) options = winning;
    const best = options.reduce((a, b) => (rankOrder(b) > rankOrder(a) ? b : a));
    return { ...best, cards: [...cards] };
}

// combo が table に勝つか
export function beats(combo, table) {
    if (!table) return true; // 最初に出すなら、どの組でもよい
    if (combo.type === 'dog' || table.type === 'dog') return false;
    if (combo.type === 'bomb') {
        if (table.type !== 'bomb') return true;
        return combo.length > table.length || (combo.length === table.length && combo.rank > table.rank);
    }
    if (table.type === 'bomb') return false;
    if (combo.type !== table.type || combo.length !== table.length) return false;
    if (combo.type === 'single') {
        if (combo.phoenix) return table.rank < 16; // 不死鳥は竜にだけ負ける（値は直前の 0.5 上）
        return combo.rank > table.rank;
    }
    return combo.rank > table.rank;
}

// ---- 手札から出せる組を並べる ----

// 手札の中の、数ごとのカード（色の順）
function byRank(hand) {
    const map = new Map();
    for (const c of sortCards(hand)) {
        if (c >= 52 && c !== MAHJONG) continue;
        const r = rankOf(c);
        if (!map.has(r)) map.set(r, []);
        map.get(r).push(c);
    }
    return map;
}

// 手札から作れる組をすべて並べる（同じ形・同じ強さのものは、使うカードを1通りにまとめる。爆弾は別に数える）
// table があれば、それに勝つものだけ
export function enumerateCombos(hand, table = null) {
    const has = new Set(hand);
    const phoenix = has.has(PHOENIX);
    const ranks = byRank(hand);
    const cardsOf = (r) => ranks.get(r) ?? [];
    const out = [];
    const seen = new Set();
    const push = (cards) => {
        const combo = classify(cards, table);
        if (!combo) return;
        if (table && !beats(combo, table)) return;
        const key = `${combo.type}:${combo.length}:${combo.rank}:${cards.includes(PHOENIX) ? 'P' : ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(combo);
    };
    // 1枚
    for (const c of hand) push([c]);
    // ペア・3枚組（不死鳥で1枚補ってよい）
    for (const [r, cs] of ranks) {
        if (r === 1) continue;
        if (cs.length >= 2) push(cs.slice(0, 2));
        if (cs.length >= 1 && phoenix) push([cs[0], PHOENIX]);
        if (cs.length >= 3) push(cs.slice(0, 3));
        if (cs.length >= 2 && phoenix) push([...cs.slice(0, 2), PHOENIX]);
        if (cs.length === 4) push(cs);
    }
    // フルハウス
    for (const [t, ts] of ranks) {
        if (t === 1) continue;
        for (const [p, ps] of ranks) {
            if (p === 1 || p === t) continue;
            if (ts.length >= 3 && ps.length >= 2) push([...ts.slice(0, 3), ...ps.slice(0, 2)]);
            if (phoenix && ts.length >= 3 && ps.length === 1) push([...ts.slice(0, 3), ps[0], PHOENIX]);
            if (phoenix && ts.length === 2 && ps.length >= 2) push([...ts.slice(0, 2), PHOENIX, ...ps.slice(0, 2)]);
        }
    }
    // 連続したペア（不死鳥で1枚補ってよい）
    for (let start = 2; start <= 13; start++) {
        let missing = 0;
        const cards = [];
        for (let r = start; r <= 14; r++) {
            const cs = cardsOf(r);
            if (cs.length >= 2) cards.push(...cs.slice(0, 2));
            else if (cs.length === 1 && phoenix && missing === 0) {
                cards.push(cs[0], PHOENIX);
                missing = 1;
            } else break;
            if (r > start) push([...cards]);
        }
    }
    // 階段（麻雀は 1。不死鳥で1つの穴か端を補ってよい）
    for (let start = 1; start <= 10; start++) {
        let used = false;
        const cards = [];
        for (let r = start; r <= 14; r++) {
            const cs = cardsOf(r);
            if (cs.length) cards.push(cs[0]);
            else if (phoenix && !used && r !== 1) {
                cards.push(PHOENIX);
                used = true;
            } else break;
            if (cards.length >= 5) push([...cards]);
        }
    }
    // 爆弾：同じ色の階段
    for (let suit = 0; suit < 4; suit++) {
        for (let start = 2; start <= 10; start++) {
            const cards = [];
            for (let r = start; r <= 14 && has.has(cardOf(suit, r)); r++) {
                cards.push(cardOf(suit, r));
                if (cards.length >= 5) push([...cards]);
            }
        }
    }
    return out;
}

export const isBomb = (combo) => combo?.type === 'bomb';

export const COMBO_NAMES = { single: '1枚', pair: 'ペア', triple: '3枚組', fullhouse: 'フルハウス', straight: '階段', pairs: '連続ペア', bomb: '爆弾', dog: '犬' };

// 組の短い説明（例「ペア 7」「階段 3〜7」「爆弾 9×4」）
export function comboLabel(combo) {
    if (!combo) return '';
    if (combo.type === 'dog') return '犬';
    if (combo.type === 'single') {
        const c = combo.cards[0];
        return c >= 52 ? SPECIAL_NAMES[c] : `1枚 ${rankLabel(combo.rank)}`;
    }
    if (combo.type === 'straight' || (combo.type === 'bomb' && combo.length >= 5)) {
        return `${combo.type === 'bomb' ? '爆弾（同じ色の階段）' : '階段'} ${rankLabel(combo.rank - combo.length + 1)}〜${rankLabel(combo.rank)}`;
    }
    if (combo.type === 'pairs') return `連続ペア ${rankLabel(combo.rank - combo.length + 1)}〜${rankLabel(combo.rank)}`;
    if (combo.type === 'bomb') return `爆弾 ${rankLabel(combo.rank)}×4`;
    return `${COMBO_NAMES[combo.type]} ${rankLabel(combo.rank)}`;
}
