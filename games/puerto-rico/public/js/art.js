/**
 * 自作の絵（SVG の文字列）と記録の文。DOM に依存しない
 */

import { GOOD_NAMES, ROLE_NAMES, buildingOf } from './data.js';

export const GOOD_COLORS = { corn: '#f2cf3c', indigo: '#3a5fcd', sugar: '#f4f1e8', tobacco: '#9b6a3c', coffee: '#4a2c1d', quarry: '#9aa0a6' };
export const TILE_NAMES = { ...GOOD_NAMES, quarry: '石切り場' };
// 島のタイルに書く短い名前
export const TILE_SHORT = { corn: 'コーン', indigo: '藍', sugar: '砂糖', tobacco: 'タバコ', coffee: 'コーヒー', quarry: '石切場' };

// 樽の形の品の印
export const barrel = (good, size = 16) => `<svg class="barrel" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><path d="M5 3h10q2 7 0 14H5q-2-7 0-14z" fill="${GOOD_COLORS[good]}" stroke="#2b1a0e" stroke-width="1.4"/><path d="M4.2 7h11.6M4.2 13h11.6" stroke="#2b1a0e" stroke-width="1"/></svg>`;

export const coin = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#e8b84a" stroke="#7a5512" stroke-width="1.5"/><text x="10" y="14" text-anchor="middle" font-size="10" font-weight="800" fill="#7a5512">D</text></svg>';
export const vpIcon = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" fill="#c9443a" stroke="#5a1410" stroke-width="1.2" stroke-linejoin="round"/></svg>';
export const colonistIcon = (cls = '') => `<svg class="ic colonist ${cls}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6" r="3.6" fill="#7b4a2a"/><path d="M4 18c0-5 3-7.5 6-7.5s6 2.5 6 7.5z" fill="#7b4a2a"/></svg>`;

// 役割のアイコン
const ROLE_ICON = {
    settler: '<path d="M4 17h12M10 17V8M10 8c-3 0-5-2-5-5 3 0 5 2 5 5zM10 8c3 0 5-2 5-5-3 0-5 2-5 5z"/>',
    mayor: '<circle cx="10" cy="6" r="3"/><path d="M4 18c0-4 2.5-6.5 6-6.5s6 2.5 6 6.5M7 3l3-2 3 2"/>',
    builder: '<path d="M3 17h14M5 17V9l5-5 5 5v8M8 17v-4h4v4"/>',
    craftsman: '<path d="M4 16l6-6M10 10l3-3 3 3-3 3zM3 17l2-2"/><circle cx="6" cy="6" r="2"/>',
    trader: '<path d="M3 7h14l-1.5 9h-11zM7 7V5a3 3 0 0 1 6 0v2"/>',
    captain: '<path d="M3 13h14l-2 4H5zM10 3v10M10 4l5 5h-5"/>',
    prospector: '<path d="M4 16l8-8M12 8l2-4 2 2-4 2M3 17l2-1"/><circle cx="14" cy="15" r="2.5"/>'
};
export const roleIcon = key => `<svg class="role-icon ri-${key}" viewBox="0 0 20 20" aria-hidden="true">${ROLE_ICON[key]}</svg>`;

export function titleArt() {
    return `<svg viewBox="0 0 320 140" aria-hidden="true">
        <rect width="320" height="140" fill="#7cc7e8"/>
        <path d="M0 95q80-12 160 0t160 0V140H0z" fill="#2b7fb5"/>
        <path d="M40 98q60-50 140-30 50 12 90 30z" fill="#e8d18b"/>
        <path d="M70 80q40-30 90-22 40 6 70 22z" fill="#6aa84f"/>
        ${[[95, 68], [120, 62], [145, 60], [170, 63], [195, 70]].map(([x, y]) => `<path d="M${x} ${y}v-14M${x} ${y - 14}c-6-2-9 1-10 4M${x} ${y - 14}c6-2 9 1 10 4M${x} ${y - 14}c-3-5-1-8 2-9" stroke="#2f5d1e" stroke-width="2.4" fill="none" stroke-linecap="round"/>`).join('')}
        <path d="M230 112h50l-6 10h-38z" fill="#7a4a22"/><path d="M255 112V80M255 82l18 22h-18z" fill="#fff" stroke="#4a2c12" stroke-width="1.5"/>
        <circle cx="270" cy="28" r="14" fill="#ffd34d"/>
    </svg>`;
}

// ---------- 記録の文 ----------

const REASON = { prospector: '金鉱掘り', factory: '工場' };
const goodsText = goods => Object.entries(goods).map(([g, k]) => `${GOOD_NAMES[g]}${k}`).join('・');
const SHIP_TEXT = ship => (ship === 'wharf' ? '波止場' : `船${ship + 1}`);

export function describeEvent(e, view) {
    const name = s => (s === view.seat ? 'あなた' : view.players[s].name);
    switch (e.type) {
        case 'round': return `― ラウンド${e.round}（総督：${name(e.governor)}）―`;
        case 'role': return `${name(e.seat)}が${ROLE_NAMES[e.role]}を選んだ${e.money ? `（+${e.money}ドゥブロン）` : ''}`;
        case 'settle': return `${name(e.seat)}が${TILE_NAMES[e.plantation]}を取った${e.hospice ? '（入植者付き）' : ''}`;
        case 'hacienda': return `${name(e.seat)}がアシエンダで${TILE_NAMES[e.plantation]}を取った`;
        case 'mayor': return `入植者を配った：${e.given.map((k, s) => `${name(s)}${k}`).join('・')}（${name(e.seat)}は特権で+1）`;
        case 'colonistShip': return `入植者の船に${e.n}人`;
        case 'build': return `${name(e.seat)}が${buildingOf(e.building).name}を建てた（${e.cost}ドゥブロン）`;
        case 'produce': return Object.keys(e.goods).length ? `${name(e.seat)}が生産：${goodsText(e.goods)}` : null;
        case 'privilegeGood': return `${name(e.seat)}は特権で${GOOD_NAMES[e.good]}を1つ多く`;
        case 'money': return `${name(e.seat)} +${e.n}ドゥブロン（${REASON[e.reason]}）`;
        case 'sell': return `${name(e.seat)}が${GOOD_NAMES[e.good]}を売った（+${e.price}ドゥブロン）`;
        case 'tradingHouseClear': return '商館がいっぱいになり、空にした';
        case 'ship': return `${name(e.seat)}が${GOOD_NAMES[e.good]}${e.n}つを${SHIP_TEXT(e.ship)}に積んだ（+${e.vp}点）`;
        case 'spoil': return `${name(e.seat)}の品が腐った：${goodsText(e.goods)}`;
        case 'pass': return `${name(e.seat)}はパス`;
        case 'endTrigger': return { colonists: '入植者が足りず、船を満たせない。このラウンドで終わり', chips: '勝利点チップが尽きた。このラウンドで終わり', city: '都市の12マスが埋まった。このラウンドで終わり' }[e.reason];
        case 'end': return `ゲーム終了：${e.winners.map(name).join('・')}の勝ち`;
        default: return null;
    }
}
