/**
 * カードの効果の日本語の説明。力のコードから組み立てる（DOM に依存しない）
 * fullText：選んだカードの全文（行の配列）／ shortText：小さな札に出す短い形（行の配列）
 */

import { cardOf, CARD_BY_KEY, GOOD_NAMES } from './cards.js';

const GOOD_CODE = { NOVELTY: 'novelty', RARE: 'rare', GENE: 'gene', ALIEN: 'alien' };
const G = k => GOOD_NAMES[k];
const has = (p, c) => p.code.includes(c);
const signed = v => (v >= 0 ? `+${v}` : `${v}`);
const goodOfCode = (p, prefix) => {
    const hit = Object.entries(GOOD_CODE).find(([c]) => has(p, `${prefix}${c}`));
    return hit ? hit[1] : null;
};

function qualifier(p) {
    if (has(p, 'RARE')) return '希少品の世界に';
    if (has(p, 'ALIEN')) return '異星の世界に';
    if (has(p, 'AGAINST_REBEL')) return '反乱軍の軍事の世界に';
    return '';
}

function consumeText(p) {
    const kind = goodOfCode(p, 'CONSUME_');
    const goods = kind ? `${G(kind)}` : '商品';
    const rewards = [];
    if (has(p, 'GET_VP')) rewards.push(`${p.value}点`);
    if (has(p, 'GET_CARD')) rewards.push(`${p.value}枚`);
    if (has(p, 'GET_2_CARD')) rewards.push('2枚');
    const reward = rewards.join('と');
    if (has(p, 'CONSUME_TWO')) return `${goods}2つで${reward}`;
    if (has(p, 'CONSUME_3_DIFF')) return `違う種類の商品3つで${reward}`;
    if (has(p, 'CONSUME_ALL')) return `商品を全部使い、個数-1の点`;
    const times = p.times ?? 1;
    return times > 1 ? `${goods}を${times}つまで、1つにつき${reward}` : `${goods}1つで${reward}`;
}

// 力 1 つの全文
export function powerText(p) {
    const v = p.value;
    switch (p.phase) {
        case 1:
            if (has(p, 'DRAW')) return `探索：${v}枚多く引く`;
            if (has(p, 'KEEP')) return `探索：${v}枚多く残す`;
            break;
        case 2:
            if (has(p, 'REDUCE')) return `開発：費用-${v}`;
            if (has(p, 'DRAW_AFTER')) return `開発：開発を置いたら${v}枚引く`;
            if (has(p, 'DRAW')) return `開発：段階の初めに${v}枚引く`;
            break;
        case 3:
            if (has(p, 'DISCARD') && has(p, 'EXTRA_MILITARY')) return `入植：これを場から捨てると、この段階の軍事力+${v}`;
            if (has(p, 'DISCARD') && has(p, 'REDUCE_ZERO')) return '入植：これを場から捨てると、軍事でない世界（異星を除く）を費用0で置ける';
            if (has(p, 'PAY_MILITARY')) return `入植：軍事の世界（異星を除く）を、費用-${v}の手札で払って置ける`;
            if (has(p, 'EXTRA_MILITARY')) return `入植：${qualifier(p)}軍事力${signed(v)}`;
            if (has(p, 'REDUCE')) return `入植：${qualifier(p) || '軍事でない世界に'}費用-${v}`;
            if (has(p, 'DRAW_AFTER')) return `入植：世界を置いたら${v}枚引く`;
            break;
        case 4: {
            if (has(p, 'TRADE_ACTION')) return has(p, 'TRADE_NO_BONUS') ? '消費：商品を1つ売る（交易の力なし）' : '消費：商品を1つ売る（交易の力つき）';
            if (has(p, 'TRADE_ANY')) return `交易：売るとき+${v}枚`;
            if (has(p, 'TRADE_THIS')) return `交易：この世界の商品を売るとき+${v}枚`;
            const trade = goodOfCode(p, 'TRADE_');
            if (trade) return `交易：${G(trade)}を売るとき+${v}枚`;
            if (has(p, 'DISCARD_HAND')) return `消費：手札を${p.times}枚まで捨て、1枚につき${v}点`;
            if (has(p, 'DRAW_LUCKY')) return '消費：数を言って1枚めくり、費用が同じなら手札に';
            if (p.code.length === 1 && has(p, 'DRAW')) return `消費：${v}枚引く`;
            return `消費：${consumeText(p)}`;
        }
        case 5: {
            if (has(p, 'PRODUCE')) return '生産：この世界に商品を生産';
            if (has(p, 'WINDFALL_ANY')) return '生産：ウィンドフォールの世界に商品を1つ';
            const wf = goodOfCode(p, 'WINDFALL_');
            if (wf) return `生産：${G(wf)}のウィンドフォールの世界に商品を1つ`;
            if (has(p, 'DRAW_IF')) return `生産：この世界が生産したら${v}枚引く`;
            if (has(p, 'DRAW_DIFFERENT')) return `生産：生産した商品の種類ごとに${v}枚`;
            if (has(p, 'DRAW_EACH_NOVELTY')) return `生産：新奇品を生産するごとに${v}枚`;
            if (has(p, 'DRAW_EACH_ALIEN')) return `生産：異星の品を生産するごとに${v}枚`;
            if (has(p, 'DRAW_MOST_RARE')) return `生産：希少品をほかの全員より多く生産したら${v}枚`;
            if (has(p, 'DRAW_WORLD_GENE')) return `生産：遺伝子の世界1つにつき${v}枚`;
            if (has(p, 'DRAW')) return `生産：${v}枚引く`;
            break;
        }
        default:
            break;
    }
    return p.code.join('+');
}

// 小さな札用の短い形
export function powerShort(p) {
    const v = p.value;
    const kind = k => ({ novelty: '新奇', rare: '希少', gene: '遺伝子', alien: '異星' }[k]);
    switch (p.phase) {
        case 1: return has(p, 'KEEP') ? `探:残+${v}` : `探:引+${v}`;
        case 2: return has(p, 'REDUCE') ? `開:-${v}` : `開:引+${v}`;
        case 3:
            if (has(p, 'DISCARD') && has(p, 'EXTRA_MILITARY')) return `入:捨て軍+${v}`;
            if (has(p, 'REDUCE_ZERO')) return '入:捨て0で置く';
            if (has(p, 'PAY_MILITARY')) return '入:軍事を払う';
            if (has(p, 'EXTRA_MILITARY')) return `軍${signed(v)}${has(p, 'RARE') ? '(希少)' : has(p, 'ALIEN') ? '(異星)' : has(p, 'AGAINST_REBEL') ? '(反乱)' : ''}`;
            if (has(p, 'REDUCE')) return `入:-${v}${has(p, 'RARE') ? '(希少)' : has(p, 'ALIEN') ? '(異星)' : ''}`;
            return `入:引+${v}`;
        case 4: {
            if (has(p, 'TRADE_ACTION')) return '消:売る';
            const trade = goodOfCode(p, 'TRADE_');
            if (has(p, 'TRADE_ANY') || has(p, 'TRADE_THIS') || trade) return `交:+${v}${trade ? `(${kind(trade)})` : ''}`;
            if (has(p, 'DISCARD_HAND')) return `消:手札→点`;
            if (has(p, 'DRAW_LUCKY')) return '消:賭け';
            if (p.code.length === 1 && has(p, 'DRAW')) return `消:引+${v}`;
            const c = goodOfCode(p, 'CONSUME_');
            const n = has(p, 'CONSUME_TWO') ? 2 : has(p, 'CONSUME_3_DIFF') ? 3 : has(p, 'CONSUME_ALL') ? '全' : (p.times ?? 1);
            const reward = [has(p, 'GET_VP') ? `${p.value}点` : '', has(p, 'GET_CARD') ? `${p.value}枚` : '', has(p, 'GET_2_CARD') ? '2枚' : ''].filter(Boolean).join('');
            return `消:${c ? kind(c) : ''}${n}→${has(p, 'CONSUME_ALL') ? '点' : reward}`;
        }
        case 5: {
            if (has(p, 'PRODUCE')) return '生産';
            const wf = goodOfCode(p, 'WINDFALL_');
            if (wf || has(p, 'WINDFALL_ANY')) return `生:WF${wf ? `(${kind(wf)})` : ''}`;
            return `生:引+${v}`;
        }
        default: return '';
    }
}

const BONUS_TEXT = {
    NOVELTY_PRODUCTION: '新奇品の生産の世界', RARE_PRODUCTION: '希少品の生産の世界', GENE_PRODUCTION: '遺伝子の生産の世界', ALIEN_PRODUCTION: '異星の品の生産の世界',
    NOVELTY_WINDFALL: '新奇品のウィンドフォールの世界', RARE_WINDFALL: '希少品のウィンドフォールの世界', GENE_WINDFALL: '遺伝子のウィンドフォールの世界', ALIEN_WINDFALL: '異星の品のウィンドフォールの世界',
    MILITARY: '軍事の世界', REBEL_MILITARY: '反乱軍の軍事の世界', ALIEN_FLAG: '異星のカード', DEVEL_EXPLORE: '探索の力のある開発', WORLD_EXPLORE: '探索の力のある世界',
    DEVEL_TRADE: '交易の力のある開発', WORLD_TRADE: '交易の力のある世界', DEVEL_CONSUME: '消費の力のある開発', WORLD_CONSUME: '消費の力のある世界',
    SIX_DEVEL: '6コストの開発（これを含む）', DEVEL: 'ほかの開発', WORLD: 'ほかの世界'
};

export function bonusText(c) {
    if (!c.bonus) return [];
    const lines = c.bonus.map(b => {
        if (b.type === 'THREE_VP') return `勝利点チップ3つにつき${b.value}点`;
        if (b.type === 'TOTAL_MILITARY') return `軍事力（種類を限らない分）1につき${b.value}点`;
        if (b.type === 'NAME') return `「${CARD_BY_KEY[b.name].name}」${b.value}点`;
        return `${BONUS_TEXT[b.type]}1枚につき${b.value}点`;
    });
    return ['ゲームの終わりに（1枚につき、先に当てはまった1つだけ）：', ...lines];
}

export function kindText(c) {
    if (c.type === 'dev') return `開発・費用${c.cost}`;
    const parts = [];
    if (c.flags?.includes('military')) parts.push(`軍事の世界・防御${c.cost}`);
    else parts.push(`世界・費用${c.cost}`);
    if (c.good) parts.push(`${G(c.good)}${c.flags?.includes('windfall') ? '（ウィンドフォール）' : ''}`);
    if (c.flags?.includes('start')) parts.push('開始の世界');
    return parts.join('・');
}

export function fullText(id) {
    const c = cardOf(id);
    const lines = (c.powers ?? []).map(powerText);
    if (c.flags?.includes('windfall')) lines.push('ウィンドフォール：置いたときに商品が載る。生産の段階では、ほかの力でだけ商品が載る');
    return [...lines, ...bonusText(c)];
}

export function shortText(id) {
    const c = cardOf(id);
    const list = (c.powers ?? []).map(powerShort);
    if (c.bonus) list.push('得点+');
    return list;
}
