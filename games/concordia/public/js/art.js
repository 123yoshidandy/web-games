/**
 * 図柄（自作の SVG）とカードの説明
 * 何度も使う図柄は symbol としてページに一度だけ入れ、use で使い回す
 */

import { CARD_TYPES, GOOD_NAMES, GOD_NAMES } from './cards.js';

export const GOOD_COLORS = { brick: '#b5533a', food: '#d8b13c', tool: '#7d8a96', wine: '#8a2f5a', cloth: '#4f78b5' };
export const GOD_COLORS = { vesta: '#b07cc6', jupiter: '#5f9bd6', saturnus: '#e2b73c', mercurius: '#9b7a4e', mars: '#e07a3a', minerva: '#8fb33c' };
export const PLAYER_COLORS = { red: '#d9473b', blue: '#3f7fdc', green: '#3fa35c', yellow: '#e9b92f', black: '#3a3a40' };

const SYMBOLS = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- 品（塗りは currentColor。地の色の上に白で描くときは color を白に） -->
    <symbol id="g-brick" viewBox="0 0 24 24"><g fill="currentColor"><rect x="2" y="13" width="9" height="6" rx="1"/><rect x="13" y="13" width="9" height="6" rx="1"/><rect x="7" y="6" width="10" height="6" rx="1"/></g></symbol>
    <symbol id="g-food" viewBox="0 0 24 24"><g fill="currentColor"><path d="M12 22V9"/><rect x="11.1" y="8" width="1.8" height="14" rx=".9"/><ellipse cx="12" cy="5" rx="2.2" ry="3.4"/><ellipse cx="8.4" cy="9.5" rx="2" ry="3.2" transform="rotate(-35 8.4 9.5)"/><ellipse cx="15.6" cy="9.5" rx="2" ry="3.2" transform="rotate(35 15.6 9.5)"/><ellipse cx="8.6" cy="15" rx="2" ry="3.2" transform="rotate(-35 8.6 15)"/><ellipse cx="15.4" cy="15" rx="2" ry="3.2" transform="rotate(35 15.4 15)"/></g></symbol>
    <symbol id="g-tool" viewBox="0 0 24 24"><g fill="currentColor"><rect x="10.8" y="8" width="2.6" height="14" rx="1.2" transform="rotate(-30 12 15)"/><path d="M4 7.5 9 3l10.5 3.6-1.8 3.4L12 8.6 7.6 11.2z"/></g></symbol>
    <symbol id="g-wine" viewBox="0 0 24 24"><g fill="currentColor"><path d="M9 2h6v2.2c0 .6.3 1 .7 1.3C18.4 7.3 19 10 19 13c0 4.4-2.8 8-7 9-4.2-1-7-4.6-7-9 0-3 .6-5.7 3.3-7.5.4-.3.7-.7.7-1.3z"/><path d="M5.2 7.4C3 8 2.6 10.6 4.6 12M18.8 7.4C21 8 21.4 10.6 19.4 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></g></symbol>
    <symbol id="g-cloth" viewBox="0 0 24 24"><g fill="currentColor"><path d="M3 7c0-1.7 1.3-3 3-3h12v13H6c-1.7 0-3 1.3-3 3z"/><path d="M3 20c0-1.7 1.3-3 3-3h12l3 4H6c-1.7 0-3-.3-3-1z" opacity=".75"/></g></symbol>
    <symbol id="g-any" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.3 9.4a2.8 2.8 0 1 1 3.6 2.7c-.6.2-.9.7-.9 1.3v.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/></symbol>
    <symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#e9c25a" stroke="#9c7426" stroke-width="1.6"/><circle cx="12" cy="12" r="6" fill="none" stroke="#9c7426" stroke-width="1.2"/></symbol>
    <!-- 植民者：陸は人、海は船 -->
    <symbol id="c-land" viewBox="0 0 24 24"><circle cx="12" cy="6" r="4.2"/><path d="M5 22c0-6 2.6-10 7-10s7 4 7 10z"/></symbol>
    <symbol id="c-sea" viewBox="0 0 24 24"><path d="M2.5 14h19l-3.2 6.5H5.7z"/><path d="M11 2.5v10H4.5z"/><path d="M12.6 4.5v8h6z" opacity=".85"/></symbol>
    <symbol id="i-house" viewBox="0 0 24 24"><path d="M3 11 12 3l9 8v10H3z"/></symbol>
    <symbol id="i-magnus" viewBox="0 0 24 24"><path d="M3 18 5 7l4.5 5L12 5l2.5 7L19 7l2 11z" fill="#f0c35a" stroke="#7a5615" stroke-width="1.3" stroke-linejoin="round"/></symbol>
    <!-- 線のアイコン -->
    <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/></symbol>
    <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.7 2.7c-.6.2-1 .8-1 1.4v.6"/><path d="M12 17.2v.1"/></symbol>
    <symbol id="i-log" viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/></symbol>
    <symbol id="i-cards" viewBox="0 0 24 24"><rect x="4" y="6" width="11" height="15" rx="2"/><path d="M9 3h9a2 2 0 0 1 2 2v12"/></symbol>
  </defs>
</svg>`;

export function insertSymbols(container) {
    container.innerHTML = SYMBOLS;
}

export const goodIcon = (good, cls = 'gi') => `<svg class="${cls} g-${good}" aria-label="${GOOD_NAMES[good] ?? '好きな品'}"><use href="#g-${good}"/></svg>`;

// カードの効果の短い説明
export function cardText(typeId) {
    const t = CARD_TYPES[typeId];
    switch (t.kind) {
        case 'tribune': return '捨て札を全部手札に戻す。戻した枚数（護民官を含む）が3枚を超えた分、1枚につき1セステルティウス。食料1と道具1で、植民者を1人ローマに置ける';
        case 'architect': return '盤上の自分の植民者の数だけ歩数を割り振って動かし（陸は茶色の陸路、海は青の海路）、そのあと植民者のいる道の両端の都市に家を建てる';
        case 'prefect': return '品の面の州を1つ選んで生産させる（ボーナスの品を受け取り、州の家すべてが持ち主に品を出す）。または、お金の面のコインの分を受け取り、全部の州を品の面に戻す';
        case 'mercator': return `${t.money}セステルティウスを受け取り、2種類までの品を売り買いする`;
        case 'senator': return '市場から2枚まで買う（カードの費用＋置き場所の追加の費用）';
        case 'consul': return '市場から1枚買う（カードの費用だけ）';
        case 'diplomat': return 'ほかの人の捨て札のいちばん上のカードの効果を行う（外交官はまねられない）';
        case 'colonist': return '食料1と道具1で、ローマか自分の家がある都市に植民者を置く（何人でも）。または、5＋盤上の自分の植民者の数だけセステルティウスを受け取る';
        case 'craftsman': return `${GOOD_NAMES[t.good]}の都市の自分の家が、それぞれ${GOOD_NAMES[t.good]}を1つ生産する`;
        default: return '';
    }
}

// 神の得点の説明
export function godText(typeId) {
    const t = CARD_TYPES[typeId];
    switch (t.god) {
        case 'vesta': return 'お金と品の値の合計 10 につき 1 点';
        case 'jupiter': return 'れんが以外の都市の家 1 軒につき 1 点（最大 15）';
        case 'saturnus': return '家のある州 1 つにつき 1 点（最大 12）';
        case 'mercurius': return '家で生産する品の種類 1 つにつき 2 点（最大 10）';
        case 'mars': return '盤上の植民者 1 人につき 2 点（最大 12）';
        case 'minerva': return `${GOOD_NAMES[t.good]}の都市の家 1 軒につき ${t.minerva} 点`;
        default: return '';
    }
}

export { GOD_NAMES };
