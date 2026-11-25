/**
 * 自作の絵（SVG の文字列）と記録の文。DOM に依存しない
 */

import { cardOf, GOOD_NAMES } from './cards.js';
import { ACTION_NAMES, PHASE_NAMES } from './game.js';

export const GOOD_COLORS = { novelty: '#62b6ef', rare: '#b07a45', gene: '#4cbf6b', alien: '#efcf3f' };

// 段階のアイコン（探索＝望遠鏡の目、開発＝歯車、入植＝旗、消費＝矢印の輪、生産＝箱）
const PHASE_ICON = {
    explore: '<circle cx="12" cy="12" r="5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
    develop: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6"/>',
    settle: '<circle cx="12" cy="15" r="6"/><path d="M12 9V3l5 2-5 2"/>',
    consume: '<path d="M5 12a7 7 0 0 1 12-5l2 2M19 12a7 7 0 0 1-12 5l-2-2"/><path d="M19 4v5h-5M5 20v-5h5"/>',
    produce: '<path d="M4 8l8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/>'
};
export const ACTION_PHASE = { explore5: 'explore', explore1: 'explore', develop: 'develop', develop2: 'develop', settle: 'settle', settle2: 'settle', trade: 'consume', vp2: 'consume', produce: 'produce' };
export const ACTION_SHORT = { explore5: '探索+5', explore1: '探索+1+1', develop: '開発', develop2: '開発(2)', settle: '入植', settle2: '入植(2)', trade: '交易', vp2: '2倍', produce: '生産' };
export const ACTION_BONUS = {
    explore5: '5枚多く引く', explore1: '1枚多く引き、1枚多く残す', develop: '開発の費用-1', develop2: '開発の費用-1',
    settle: '世界を置いたら1枚引く', settle2: '世界を置いたら1枚引く', trade: '先に商品を1つ売る', vp2: '消費の勝利点が2倍', produce: 'ウィンドフォールの世界に商品を1つ'
};

export const phaseIcon = (phase, cls = '') => `<svg class="phase-icon ${cls} ph-${phase}" viewBox="0 0 24 24" aria-hidden="true">${PHASE_ICON[phase]}</svg>`;
export const actionIcon = action => phaseIcon(ACTION_PHASE[action]);

export const goodDot = kind => `<span class="good-dot" style="--g:${GOOD_COLORS[kind]}" title="${GOOD_NAMES[kind]}"></span>`;
export const chipIcon = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" fill="#f2c94c" stroke="#7a5b0c" stroke-width="1.5"/><path d="M12 7l4.3 2.5v5L12 17l-4.3-2.5v-5z" fill="none" stroke="#7a5b0c" stroke-width="1.2"/></svg>';
export const swordIcon = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6L9 21l-6-6z" fill="#e05a5a" stroke="#5a1414" stroke-width="1.4" stroke-linejoin="round"/></svg>';

export function titleArt() {
    return `<svg viewBox="0 0 320 150" aria-hidden="true">
        <defs><radialGradient id="pl1" cx=".35" cy=".35"><stop offset="0" stop-color="#9fd8ff"/><stop offset="1" stop-color="#1f5a9a"/></radialGradient>
        <radialGradient id="pl2" cx=".35" cy=".35"><stop offset="0" stop-color="#ffd89a"/><stop offset="1" stop-color="#9a5a1f"/></radialGradient>
        <radialGradient id="pl3" cx=".35" cy=".35"><stop offset="0" stop-color="#b6f5b0"/><stop offset="1" stop-color="#2a7a3a"/></radialGradient></defs>
        <g fill="#fff">${[[20, 20], [60, 110], [110, 30], [150, 130], [200, 15], [240, 100], [290, 40], [300, 130], [80, 60], [180, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2"/>`).join('')}</g>
        <circle cx="70" cy="85" r="34" fill="url(#pl1)"/><ellipse cx="70" cy="85" rx="52" ry="10" fill="none" stroke="#9fd8ff" stroke-width="2" opacity=".6"/>
        <circle cx="200" cy="60" r="22" fill="url(#pl2)"/>
        <circle cx="265" cy="110" r="14" fill="url(#pl3)"/>
        <path d="M120 120l40-22 6 6-40 22z" fill="#d0d6ff"/><path d="M118 124l-12 6 4-10z" fill="#ff8a3d"/>
    </svg>`;
}

// ---------- 記録の文 ----------

const reasonText = r => (r === 'settleBonus' ? '入植のボーナス' : r && cardOf(r) ? cardOf(r).name : '');

export function describeEvent(e, view) {
    const name = s => (s === view.seat ? 'あなた' : view.players[s].name);
    const card = id => `「${cardOf(id).name}」`;
    switch (e.type) {
        case 'round': return `― ラウンド${e.round} ―`;
        case 'reveal': return e.actions.map((a, i) => `${name(i)}：${a.map(x => ACTION_NAMES[x]).join('・')}`).join('　');
        case 'phase': return `【${PHASE_NAMES[e.phase]}】`;
        case 'explore': return `${name(e.seat)}は${e.draw}枚引いて${e.keep}枚残す`;
        case 'develop': return `${name(e.seat)}が${card(e.card)}を開発（${e.paid}枚払う）`;
        case 'settle': return `${name(e.seat)}が${card(e.card)}に入植（${e.military ? '軍事力で' : `${e.paid}枚払う`}${e.used.length ? `、${e.used.map(card).join('')}を使う` : ''}）`;
        case 'draw': return `${name(e.seat)}が${e.n}枚引く（${reasonText(e.reason)}）`;
        case 'trade': return `${name(e.seat)}が${card(e.world)}の${GOOD_NAMES[cardOf(e.world).good]}を売って${e.n}枚`;
        case 'consume': return `${name(e.seat)}が${card(e.card)}で商品を${e.goods.length}つ消費`;
        case 'consumeDiscard': return `${name(e.seat)}が${card(e.card)}で手札を${e.n}枚捨てる`;
        case 'vp': return `${name(e.seat)} +${e.n}点（${reasonText(e.reason)}）`;
        case 'lucky': return `${name(e.seat)}は${e.number}と言って${card(e.card)}（費用${cardOf(e.card).cost}）をめくり、${e.hit ? '手札に入れた' : '外れた'}`;
        case 'produce': return `${name(e.seat)}が${e.worlds.length}つ生産`;
        case 'windfall': return `${name(e.seat)}が${card(e.world)}に商品を置く`;
        case 'handLimit': return `${name(e.seat)}が手札の上限で${e.n}枚捨てる`;
        case 'reshuffle': return '捨て札を混ぜて山札にした';
        case 'end': return `ゲーム終了：${e.winners.map(name).join('・')}の勝ち`;
        default: return null;
    }
}
