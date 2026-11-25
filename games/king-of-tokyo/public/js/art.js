/**
 * モンスターの顔とダイスの目の絵（自作の SVG）、記録の文。DOM に依存しない（文字列を返すだけ）
 */

import { MONSTERS, cardOf } from './cards.js';

const MONSTER_BY_KEY = Object.fromEntries(MONSTERS.map(m => [m.key, m]));
export const monsterOf = key => MONSTER_BY_KEY[key];

// モンスターの顔（丸い体に、モンスターごとの特徴を 1 つ）
const FEATURES = {
    king: '<path d="M14 22c4-5 16-5 20 0" stroke="#2b1a12" stroke-width="3" fill="none" stroke-linecap="round"/>',
    gigazaur: '<path d="M12 12l4-7 4 6 4-7 4 7 4-6 4 7" fill="#1e7a44" stroke="#123" stroke-width="1.5" stroke-linejoin="round"/>',
    mekaDragon: '<path d="M24 4v7M20 4h8" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><rect x="13" y="20" width="22" height="6" rx="3" fill="#cfd8dc"/>',
    cyberKitty: '<path d="M9 16 11 4l8 8M39 16 37 4l-8 8" fill="#e84393" stroke="#5a1037" stroke-width="2" stroke-linejoin="round"/>',
    spacePenguin: '<path d="M19 30l5 5 5-5z" fill="#f5b041" stroke="#5a3a0a" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="24" cy="31" rx="10" ry="9" fill="#ecf0f1" opacity=".9"/>',
    alienoid: '<path d="M16 10 12 2M32 10 36 2" stroke="#7a3d0a" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="2" r="2.5" fill="#f1c40f"/><circle cx="36" cy="2" r="2.5" fill="#f1c40f"/><circle cx="24" cy="15" r="3.5" fill="#fff" stroke="#222" stroke-width="1.5"/>'
};

export function monsterSvg(key, size = 36, cls = '') {
    const m = monsterOf(key);
    return `<svg class="monster ${cls}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">
        ${key === 'spacePenguin' ? '' : ''}<circle cx="24" cy="27" r="19" fill="${m.color}" stroke="#141020" stroke-width="2.5"/>
        ${FEATURES[key]}
        <circle cx="17" cy="25" r="4.2" fill="#fff" stroke="#141020" stroke-width="1.5"/><circle cx="31" cy="25" r="4.2" fill="#fff" stroke="#141020" stroke-width="1.5"/>
        <circle cx="18" cy="26" r="1.9" fill="#141020"/><circle cx="32" cy="26" r="1.9" fill="#141020"/>
        <path d="M17 36q7 5 14 0" stroke="#141020" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M20 36.5l1.5 2.5 1.5-2.2M25 36.6l1.5 2.4 1.4-2.3" fill="#fff" stroke="#141020" stroke-width=".8"/>
    </svg>`;
}

// ダイスの目
const FACE_ICON = {
    1: '<text x="24" y="33" class="die-num">1</text>',
    2: '<text x="24" y="33" class="die-num">2</text>',
    3: '<text x="24" y="33" class="die-num">3</text>',
    heart: '<path d="M24 37c-8-5.5-12-9.5-12-14a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 4.5-4 8.5-12 14z" fill="#e74c3c"/>',
    energy: '<path d="M27 8 14 27h9l-3 14 14-20h-9z" fill="#2ecc71" stroke="#145a32" stroke-width="1.2" stroke-linejoin="round"/>',
    claw: '<path d="M14 36c3-8 5-16 4-25M23 38c2-9 3-18 1-27M32 36c1-8 1-16-2-24" stroke="#141020" stroke-width="4.5" fill="none" stroke-linecap="round"/>'
};

export function dieSvg(face, size = 44, cls = '') {
    return `<svg class="die ${cls}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-label="${face}">
        <rect x="2" y="2" width="44" height="44" rx="9" class="die-face"/>${FACE_ICON[face] ?? ''}</svg>`;
}

export const icon = {
    vp: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="#f4d03f" stroke="#7d6608" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    hp: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-6-4-9-7.2-9-11a4.6 4.6 0 0 1 9-1.6A4.6 4.6 0 0 1 21 10c0 3.8-3 7-9 11z" fill="#e74c3c" stroke="#7b241c" stroke-width="1.2"/></svg>',
    energy: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2 5 14h6l-2 8 10-13h-6z" fill="#2ecc71" stroke="#145a32" stroke-width="1.2" stroke-linejoin="round"/></svg>'
};

// ---------- 記録の文 ----------

const REASON = {
    startInTokyo: '東京で番を始めた', enterTokyo: '東京に入った', dice1: '1・1・1', dice2: '2・2・2', dice3: '3・3・3', dice: 'ダイス',
    attack: '攻撃', poison: '毒', eaterOfTheDead: '死肉喰らい', healingRay: '癒しの光線'
};
const reasonText = r => REASON[r] ?? (r && cardOf(r) ? cardOf(r).name : r ?? '');
const FACE_TEXT = { 1: '1', 2: '2', 3: '3', heart: 'ハート', energy: 'エネルギー', claw: '攻撃' };

export function describeEvent(e, view) {
    const name = s => (s === view.seat ? 'あなた' : view.players[s].name);
    switch (e.type) {
        case 'turn': return `${name(e.seat)}の番`;
        case 'resolveDice': return `${name(e.seat)}の出目：${e.dice.map(f => FACE_TEXT[f]).join('・')}`;
        case 'vp': return e.n > 0 ? `${name(e.seat)} +${e.n}勝利点（${reasonText(e.reason)}）` : `${name(e.seat)} ${e.n}勝利点（${reasonText(e.reason)}）`;
        case 'energy': return e.n > 0 ? `${name(e.seat)} +${e.n}エネルギー（${reasonText(e.reason)}）` : `${name(e.seat)} ${e.n}エネルギー（${reasonText(e.reason)}）`;
        case 'heal': return `${name(e.seat)} +${e.n}体力（${reasonText(e.reason)}）`;
        case 'damage': return `${name(e.seat)} -${e.n}体力（${reasonText(e.reason)}）`;
        case 'attack': return `${name(e.seat)}の攻撃 ${e.claws}：${e.targets.map(name).join('・') || '当たる相手なし'}`;
        case 'blocked': return `${name(e.seat)}は体力を失わなかった（${reasonText(e.reason)}）`;
        case 'knockOut': return `${name(e.seat)}の体力が0になった`;
        case 'reborn': return `${name(e.seat)}は子どもとして体力10で続ける`;
        case 'enterTokyo': return `${name(e.seat)}が${e.where === 'bay' ? '東京湾' : '東京'}に入った`;
        case 'leaveTokyo': return `${name(e.seat)}が東京を出た`;
        case 'stay': return `${name(e.seat)}は東京に残った`;
        case 'buy': return `${name(e.seat)}が「${cardOf(e.card).name}」を買った`;
        case 'buyFrom': return `${name(e.seat)}が${name(e.from)}から「${cardOf(e.card).name}」を買った`;
        case 'sweep': return `${name(e.seat)}が場のカードを流した`;
        case 'discardCard': return `${name(e.seat)}の「${cardOf(e.card).name}」を捨てた`;
        case 'wings': return `${name(e.seat)}は翼を使った`;
        case 'probe': return `${name(e.seat)}の念力探査：${name(e.target)}のダイスを振り直し→${FACE_TEXT[e.face]}`;
        case 'change': return `${name(e.seat)}がダイスを${FACE_TEXT[e.face]}に変えた（${cardOf(e.card).name}）`;
        case 'extraTurn': return `${name(e.seat)}はもう1回手番（${reasonText(e.reason)}）`;
        case 'rapidHeal': return `${name(e.seat)}は急速回復を使った`;
        case 'token': return `${name(e.seat)}に${e.token === 'poison' ? '毒' : '縮小'}が${e.n}つ`;
        case 'mimic': return `${name(e.seat)}が「${cardOf(e.target.card).name}」をものまね`;
        case 'end': return e.winner === null ? '全員の体力が0になった' : `${name(e.winner)}の勝ち（${e.reason === 'points' ? '20勝利点' : '最後の1体'}）`;
        default: return null;
    }
}
