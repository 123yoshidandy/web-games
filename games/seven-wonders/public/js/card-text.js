/**
 * カード・不思議の段階の、短い説明と記号（DOM に依存しない。HTML の文字列を返す）
 */

import { cardOf, RESOURCE_NAMES, SCIENCE_NAMES } from './cards.js';

// 資源の一文字（小さい画面でも読めるように）
export const RESOURCE_CHAR = { W: '木', S: '石', C: '土', O: '鉱', G: '硝', L: '布', P: '紙' };
export const COLOR_HEX = { brown: '#8b5a2b', grey: '#7d8794', blue: '#2f6fb3', yellow: '#d9a520', red: '#c0392b', green: '#2e8b57', purple: '#7d4aa8' };

export const res = r => `<span class="res res-${r}" title="${RESOURCE_NAMES[r]}">${RESOURCE_CHAR[r]}</span>`;
export const coin = n => `<span class="coin" title="${n}コイン">${n}</span>`;
export const shield = n => `<span class="shield-mark" title="盾 ${n}">${'<i></i>'.repeat(n)}</span>`;
export const vp = n => `<span class="vp" title="${n}点">${n}</span>`;
export const sci = s => `<span class="sci sci-${s}" title="${SCIENCE_NAMES[s] ?? '好きな記号'}">${{ c: '◎', g: '⚙', t: '▤', any: '？' }[s]}</span>`;

const WHO = { self: '自分', neighbors: '両隣', all: '自分と両隣' };
const PER = { brown: '茶', grey: '灰', yellow: '黄', blue: '青', green: '緑', red: '赤', stages: '段階', defeats: '負け', brownGreyPurple: '茶・灰・紫' };

export function costHtml(card) {
    const parts = [];
    if (card.coins) parts.push(coin(card.coins));
    [...card.cost].forEach(r => parts.push(res(r)));
    return parts.join('') || '<span class="free">無料</span>';
}

// 効果の短い説明（HTML）
export function effectHtml(card) {
    if (card.produce) {
        return card.produce.map(options => options.map(res).join('<span class="or">/</span>')).join('');
    }
    const parts = [];
    if (card.vp) parts.push(vp(card.vp));
    if (card.shields) parts.push(shield(card.shields));
    if (card.science) parts.push(sci(card.science));
    if (card.trade) {
        if (card.trade.raw) parts.push(`<span class="tx">原材料を${card.trade.raw[0] === 'left' ? '左' : '右'}から${coin(1)}</span>`);
        if (card.trade.manufactured) parts.push(`<span class="tx">加工品を両隣から${coin(1)}</span>`);
    }
    if (card.gain) parts.push(card.gain.per ? `<span class="tx">${WHO[card.gain.who]}の${PER[card.gain.per]}1つに${coin(card.gain.coins)}</span>` : coin(card.gain.coins));
    if (card.points) parts.push(`<span class="tx">${WHO[card.points.who]}の${PER[card.points.per]}1つに${vp(card.points.vp)}</span>`);
    return parts.join('');
}

export function chainHtml(card) {
    return card.chain?.length ? card.chain.map(k => cardOf(`${k}#3`).name).join('・') : '';
}

const STAGE_EFFECT = {
    rawChoice: '原材料を1つ選んで生産', manufacturedChoice: '加工品を1つ選んで生産', science: '好きな科学の記号',
    freeBuild: '各時代に1回、無料で建てる', playLast: '7枚目も使える', buildDiscard: '捨て札から無料で建てる',
    tradeRaw: '原材料を両隣から1コイン', copyGuild: '隣のギルドを1つ写す'
};

export function stageHtml(stage) {
    const parts = [];
    if (stage.vp) parts.push(vp(stage.vp));
    if (stage.shields) parts.push(shield(stage.shields));
    if (stage.coins) parts.push(coin(stage.coins));
    if (stage.effect) parts.push(`<span class="tx">${STAGE_EFFECT[stage.effect]}</span>`);
    return parts.join('');
}

export const stageText = stage => [stage.vp ? `${stage.vp}点` : '', stage.shields ? `盾${stage.shields}` : '', stage.coins ? `${stage.coins}コイン` : '', stage.effect ? STAGE_EFFECT[stage.effect] : ''].filter(Boolean).join('・');
