/**
 * ギズモの効果を、短い日本語の文にする（DOM に依存しない）
 */

import { CARDS, COLOR_NAMES, TYPE_NAMES } from './cards.js';

const colorList = (colors) => colors.map(c => COLOR_NAMES[c]).join('か');

// きっかけ（「〜したら」）
export function triggerText(card) {
    const t = card.trigger;
    if (!t) return '';
    if (t.action === 'file') return '保管したら';
    if (t.action === 'pick') return `${colorList(t.colors)}を取ったら`;
    if (t.fromArchive) return '保管庫から建てたら';
    if (t.level) return `レベル${t.level}を建てたら`;
    return `${colorList(t.colors)}のギズモを建てたら`;
}

// 起きること
export function effectText(card) {
    const e = card.effect;
    if (!e) return '';
    switch (e.kind) {
        case 'draw': return `ランダムに${e.amount}個引く`;
        case 'pick': return e.amount === 1 ? '1個取る' : `${e.amount}回取る`;
        case 'vp': return `得点チップ+${e.amount}`;
        case 'file': return '保管する';
        case 'research': return '研究する';
        case 'freeBuild': return 'レベル1を無料で建てる';
        default: return '';
    }
}

export function upgradeText(card) {
    const up = card.upgrade;
    if (!up) return '';
    if (up.discount) return { level2: 'レベル2を1個安く建てる', archive: '保管庫から1個安く建てる', research: '研究から1個安く建てる' }[up.discount];
    if (up.block) return up.block === 'research' ? 'もう研究できない' : 'もう保管できない';
    if (up.score) return up.score === 'energy' ? '終わりに、残りのエネルギーの数が点' : '終わりに、得点チップと同じ点';
    const parts = [];
    if (up.storage) parts.push(`エネルギー+${up.storage}`);
    if (up.archive) parts.push(`保管庫+${up.archive}`);
    if (up.research) parts.push(`研究+${up.research}`);
    return parts.join('・');
}

export function convertText(card) {
    const steps = card.convert;
    if (!steps) return '';
    if (steps.length === 2 && steps[0].to === 'any' && steps[0].from === steps[1].from) return `${COLOR_NAMES[steps[0].from]}1〜2個を好きな色に`;
    return steps.map(s => {
        if (s.to === 'double') return `${COLOR_NAMES[s.from]}1個を${COLOR_NAMES[s.from]}2個に`;
        return s.from === null ? '1個を好きな色に' : `${COLOR_NAMES[s.from]}1個を好きな色に`;
    }).join('・');
}

// カードの効果の全文（建てるときに使う変換は「建てるとき」を付ける）
export function cardText(id) {
    const card = CARDS[id];
    if (card.trigger) return `${triggerText(card)}、${effectText(card)}`;
    if (card.convert) return `建てるとき、${convertText(card)}`;
    return upgradeText(card);
}

// 1行の見出し（種類・色・費用・点）
export function cardTitle(id) {
    const card = CARDS[id];
    if (card.level === 0) return '最初のギズモ';
    const color = card.color === 'any' ? '何色でも' : COLOR_NAMES[card.color];
    const points = card.points === null ? '点は終わりに' : `${card.points}点`;
    return `${TYPE_NAMES[card.type]}・レベル${card.level}・${color}${card.cost}個・${points}`;
}
