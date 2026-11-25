/**
 * カードの効果の文（詳細・遊び方）と、カードの面に出す短い印
 * 印：交易（金の丸）・戦闘（赤）・権威（緑）・引く（青）は数だけ。ほかの効果は1文字（文は詳細で見る）
 */

import { CARDS, FACTIONS } from './cards.js';

const TEXT = {
    trade: n => `交易+${n}`,
    combat: n => `戦闘+${n}`,
    authority: n => `権威+${n}`,
    draw: n => `${n}枚引く`,
    oppDiscard: () => '相手は1枚捨てる',
    scrapRow: () => '交易の列の1枚を廃棄してよい',
    scrapHandOrDiscard: () => '手札か捨て札の1枚を廃棄してよい',
    destroyBase: () => '相手の基地1つを破壊してよい',
    topdeckNext: () => 'この手番に次に獲得する艦を山札の上に置く',
    drawIfBases: v => `基地が${v.bases}つ以上なら${v.draw}枚引く`,
    copyShip: () => 'この手番に出したほかの艦1枚の効果を写す（その勢力にもなる）',
    allyAll: () => 'すべての勢力の同盟として数える',
    freeShipTop: () => '交易の列の艦1枚をただで獲得し、山札の上に置く',
    drawPerBlob: () => 'この手番に出したブロブのカード1枚につき1枚引く',
    fleetHq: () => 'このあと出す艦すべてに戦闘+1',
    drawThenScrapHand: () => '1枚引き、手札1枚を廃棄する',
    brainWorld: () => '手札か捨て札の2枚まで廃棄し、その数だけ引く',
    recycle: n => `手札を${n}枚まで捨て、その数だけ引く`
};

// 1文字の印（title に文を入れる）
const MARK = {
    oppDiscard: '捨', scrapRow: '列', scrapHandOrDiscard: '廃', destroyBase: '破', topdeckNext: '上',
    drawIfBases: '基', copyShip: '写', allyAll: '全', freeShipTop: '得', drawPerBlob: '泡',
    fleetHq: '艦', drawThenScrapHand: '廃', brainWorld: '廃', recycle: '換'
};

const NUMBER_KINDS = { trade: 't', combat: 'c', authority: 'a', draw: 'd' };

function oneText(e) {
    if (e.or) return e.or.map(list => list.map(oneText).join('・')).join('か、');
    const [kind, value] = Object.entries(e)[0];
    return TEXT[kind](value);
}

export const effectsText = (effects) => effects.map(oneText).join('・');

function oneChip(e) {
    if (e.or) return e.or.map(list => list.map(oneChip).join('')).join('<i class="or">/</i>');
    const [kind, value] = Object.entries(e)[0];
    if (NUMBER_KINDS[kind]) return `<b class="fx-${NUMBER_KINDS[kind]}">${kind === 'draw' ? `+${value}` : value}</b>`;
    return `<b class="fx-x" title="${TEXT[kind](value)}">${MARK[kind]}</b>`;
}

export const effectsChips = (effects) => effects.map(oneChip).join('');

// 詳細と遊び方の文：[{ label, text }]
export function cardLines(key) {
    const c = CARDS[key];
    const lines = [];
    if (c.primary.length) lines.push({ label: '', text: effectsText(c.primary) });
    if (c.ally.length) lines.push({ label: `同盟（${FACTIONS[c.faction].name}）`, text: effectsText(c.ally) });
    if (c.scrap.length) lines.push({ label: '廃棄', text: effectsText(c.scrap) });
    return lines;
}

export const typeName = (key) => ({ ship: '艦', base: '基地', outpost: '前哨' })[CARDS[key].type];
