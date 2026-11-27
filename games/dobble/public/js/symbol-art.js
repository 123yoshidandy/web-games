/**
 * マークの絵（57 個。どれも 100×100 の枠の SVG）と、カードの描き方
 *
 * マークは symbol として一度だけページに入れ、カードごとに use で使い回す
 * カードの上のマークの並び・大きさ・向きは、カードの番号から作った乱数で決める（印刷されたカードと同じく、同じカードはいつも同じ絵）
 * ゲームのシードは使わないので、ビューにシードを入れずに、どの端末でも同じ絵になる
 */

import { CARDS, SYMBOL_NAMES } from './deck.js';
import { createRandom, shuffle } from './random.js';

const RED = '#e0413a';
const DEEP_RED = '#c62828';
const ORANGE = '#f08a24';
const YELLOW = '#f2c230';
const GOLD = '#c98a10';
const GREEN = '#3fa34d';
const DARK_GREEN = '#1f6b2c';
const TEAL = '#1f9e9a';
const SKY = '#4fb3e8';
const BLUE = '#2f6fd1';
const NAVY = '#23407a';
const PURPLE = '#8a4fc7';
const PINK = '#e5609a';
const BROWN = '#8a5a35';
const INK = '#2b2b2b';
const GRAY = '#7a8494';
const CREAM = '#f6ecd4';
const ICE = '#cfe8f7';

const round = (value) => Math.round(value * 10) / 10;
const polar = (cx, cy, r, deg) => [round(cx + r * Math.cos((deg * Math.PI) / 180)), round(cy + r * Math.sin((deg * Math.PI) / 180))];
const ring = (count, start, fn) => Array.from({ length: count }, (_, i) => fn(start + (360 / count) * i, i)).join('');

// 扇形（ボールの塗り分け）
const sector = (r, from, to, color) => {
    const [x1, y1] = polar(50, 50, r, from);
    const [x2, y2] = polar(50, 50, r, to);
    return `<path d="M50 50L${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}Z" fill="${color}"/>`;
};

// 星形の多角形
const starPoints = (cx, cy, outer, inner, points = 5) => Array.from({ length: points * 2 }, (_, i) => polar(cx, cy, i % 2 ? inner : outer, -90 + (180 / points) * i).join(',')).join(' ');

// 57 個のマーク（番号は deck.js の SYMBOL_NAMES と同じ並び）
export const SYMBOL_SVGS = [
    // 0 太陽
    `<g stroke="${ORANGE}" stroke-width="7" stroke-linecap="round">${ring(8, 0, a => { const [x1, y1] = polar(50, 50, 32, a); const [x2, y2] = polar(50, 50, 45, a); return `<path d="M${x1} ${y1}L${x2} ${y2}"/>`; })}</g><circle cx="50" cy="50" r="23" fill="${YELLOW}" stroke="${ORANGE}" stroke-width="5"/>`,
    // 1 月
    `<path d="M60 6A44 44 0 1 0 94 70 34 34 0 0 1 60 6Z" fill="${YELLOW}" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/>`,
    // 2 星
    `<polygon points="${starPoints(50, 54, 46, 19)}" fill="${PURPLE}" stroke="#5e2f96" stroke-width="3" stroke-linejoin="round"/>`,
    // 3 ハート
    `<path d="M50 90C20 68 6 52 6 33 6 19 17 9 30 9c9 0 16 5 20 12 4-7 11-12 20-12 13 0 24 10 24 24 0 19-14 35-44 57Z" fill="${PINK}"/>`,
    // 4 雪の結晶
    `<g stroke="${SKY}" stroke-width="7" stroke-linecap="round" fill="none">${ring(6, 0, a => `<path transform="rotate(${a} 50 50)" d="M50 50V7M39 17l11 11 11-11"/>`)}</g>`,
    // 5 雲
    `<g fill="#7fb2e5"><circle cx="30" cy="60" r="19"/><circle cx="53" cy="45" r="25"/><circle cx="74" cy="61" r="18"/><rect x="30" y="55" width="44" height="24"/></g>`,
    // 6 かみなり
    `<polygon points="58,4 16,58 46,58 36,96 84,38 54,38 66,4" fill="${YELLOW}" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/>`,
    // 7 しずく
    `<path d="M50 5C50 5 17 46 17 64a33 33 0 0 0 66 0C83 46 50 5 50 5Z" fill="${BLUE}"/><path d="M32 64a18 18 0 0 0 10 17" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    // 8 ほのお
    `<path d="M50 4c4 18 30 28 30 56a30 30 0 0 1-60 0c0-14 8-23 15-29 0 10 4 17 10 19C44 36 40 20 50 4Z" fill="${RED}"/><path d="M50 52c3 10 15 14 15 28a15 15 0 0 1-30 0c0-10 8-16 15-28Z" fill="${YELLOW}"/>`,
    // 9 葉っぱ
    `<path d="M10 90C10 40 40 10 92 8c0 52-30 82-82 82Z" fill="${GREEN}"/><path d="M12 88 70 30M36 64h18M50 50V32" stroke="${DARK_GREEN}" stroke-width="4" stroke-linecap="round"/>`,
    // 10 花
    `<g fill="${ORANGE}">${ring(5, -90, a => { const [x, y] = polar(50, 50, 26, a); return `<circle cx="${x}" cy="${y}" r="18"/>`; })}</g><circle cx="50" cy="50" r="14" fill="${YELLOW}" stroke="${GOLD}" stroke-width="3"/>`,
    // 11 木
    `<rect x="42" y="70" width="16" height="24" fill="${BROWN}"/><path d="M50 4 80 44H20Z" fill="#2e8a3e"/><path d="M50 24 90 74H10Z" fill="#2e8a3e"/>`,
    // 12 キノコ
    `<path d="M36 50h28l5 40H31Z" fill="${CREAM}" stroke="#b89a6a" stroke-width="3"/><path d="M6 54a44 42 0 0 1 88 0Z" fill="${RED}"/><circle cx="32" cy="36" r="7" fill="#fff"/><circle cx="60" cy="26" r="8" fill="#fff"/><circle cx="76" cy="44" r="5" fill="#fff"/>`,
    // 13 りんご
    `<path d="M50 30c-8-7-38-9-38 22 0 22 16 42 27 42 5 0 8-3 11-3s6 3 11 3c11 0 27-20 27-42 0-31-30-29-38-22Z" fill="${DEEP_RED}"/><path d="M50 30C50 20 53 12 58 7" stroke="#6b4423" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M55 18c8-10 22-10 27-6-6 9-19 11-27 6Z" fill="${GREEN}"/>`,
    // 14 さくらんぼ
    `<path d="M30 62C34 40 46 22 62 10M70 66C68 44 64 26 62 10" stroke="${GREEN}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M62 10c10-4 22 0 26 8-10 4-20 2-26-8Z" fill="${GREEN}"/><circle cx="28" cy="74" r="17" fill="${DEEP_RED}"/><circle cx="70" cy="78" r="17" fill="${DEEP_RED}"/><circle cx="22" cy="68" r="4" fill="#fff" opacity=".7"/>`,
    // 15 にんじん
    `<path d="M26 14 14 4M30 12 30 0M34 14 46 4" stroke="${GREEN}" stroke-width="7" stroke-linecap="round" transform="translate(0 8)"/><path d="M18 34a14 14 0 0 1 20-14l56 72-72-42a14 14 0 0 1-4-16Z" fill="${ORANGE}"/><path d="M40 40l8-4M54 58l8-4M30 46l6 6" stroke="#c0650e" stroke-width="3" stroke-linecap="round"/>`,
    // 16 魚
    `<polygon points="70,50 96,28 96,72" fill="${TEAL}"/><ellipse cx="42" cy="50" rx="36" ry="24" fill="${TEAL}"/><circle cx="24" cy="44" r="6" fill="#fff"/><circle cx="23" cy="44" r="3" fill="${INK}"/><path d="M48 32q10 18 0 36" stroke="#127370" stroke-width="4" fill="none"/>`,
    // 17 鳥
    `<polygon points="74,40 96,48 74,56" fill="${ORANGE}"/><circle cx="56" cy="44" r="22" fill="${BLUE}"/><path d="M8 58c14 0 22-8 40-8 18 0 28 10 28 22 0 12-12 20-30 20C26 92 14 78 8 58Z" fill="${BLUE}"/><path d="M28 64c10 10 22 12 32 6" stroke="#1d4f9e" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="62" cy="40" r="5" fill="#fff"/><circle cx="63" cy="40" r="2.5" fill="${INK}"/>`,
    // 18 ねこ
    `<path d="M16 46 20 6 46 30ZM84 46 80 6 54 30Z" fill="${GRAY}"/><circle cx="50" cy="58" r="36" fill="${GRAY}"/><ellipse cx="36" cy="52" rx="6" ry="8" fill="${YELLOW}"/><ellipse cx="64" cy="52" rx="6" ry="8" fill="${YELLOW}"/><path d="M45 66h10l-5 6Z" fill="${PINK}"/><path d="M50 72v4M30 70H12M30 76 14 82M70 70h18M70 76l16 6" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
    // 19 かぎ
    `<circle cx="26" cy="50" r="17" fill="none" stroke="${GOLD}" stroke-width="10"/><path d="M42 44h52v12H42ZM74 56h9v15h-9ZM86 56h8v10h-8Z" fill="${GOLD}"/>`,
    // 20 錠前
    `<path d="M30 46V32a20 20 0 0 1 40 0v14" stroke="${GRAY}" stroke-width="10" fill="none"/><rect x="16" y="44" width="68" height="50" rx="9" fill="${NAVY}"/><circle cx="50" cy="64" r="7" fill="#fff"/><path d="M47 66h6l2 14h-10Z" fill="#fff"/>`,
    // 21 家
    `<rect x="20" y="44" width="60" height="50" fill="${YELLOW}" stroke="${GOLD}" stroke-width="3"/><path d="M50 6 96 48H4Z" fill="${RED}" stroke-linejoin="round"/><rect x="42" y="64" width="16" height="30" fill="${BROWN}"/><rect x="26" y="54" width="12" height="12" fill="${ICE}"/><rect x="62" y="54" width="12" height="12" fill="${ICE}"/>`,
    // 22 ベル
    `<circle cx="50" cy="84" r="9" fill="${GOLD}"/><path d="M50 8c-19 0-27 17-27 35 0 19-8 27-15 34h84c-7-7-15-15-15-34 0-18-8-35-27-35Z" fill="${YELLOW}" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="8" r="5" fill="${GOLD}"/>`,
    // 23 かさ
    `<path d="M50 50v32a9 9 0 0 1-18 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M4 52a46 42 0 0 1 92 0c-7-7-16-7-23 0-7-7-16-7-23 0-7-7-16-7-23 0-7-7-16-7-23 0Z" fill="${PURPLE}"/><path d="M50 10C40 22 38 40 40 52M50 10c10 12 12 30 10 42" stroke="#6a35a3" stroke-width="3" fill="none"/>`,
    // 24 王冠
    `<path d="M8 28 30 54 50 16 70 54 92 28 84 82H16Z" fill="${YELLOW}" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/><circle cx="50" cy="66" r="7" fill="${RED}"/><circle cx="30" cy="70" r="5" fill="${BLUE}"/><circle cx="70" cy="70" r="5" fill="${BLUE}"/>`,
    // 25 宝石
    `<path d="M26 14h48l20 24-44 54L6 38Z" fill="${SKY}" stroke="#1f7fa8" stroke-width="4" stroke-linejoin="round"/><path d="M6 38h88M38 14 30 38l20 54 20-54-8-24M30 38 50 14 70 38" stroke="#1f7fa8" stroke-width="3" fill="none" stroke-linejoin="round"/>`,
    // 26 爆弾
    `<path d="M60 30q12-20 28-14" stroke="${BROWN}" stroke-width="5" fill="none" stroke-linecap="round"/><polygon points="${starPoints(88, 15, 11, 5, 6)}" fill="${ORANGE}"/><rect x="50" y="24" width="18" height="14" rx="3" transform="rotate(40 59 31)" fill="${GRAY}"/><circle cx="44" cy="60" r="33" fill="${INK}"/><path d="M26 52a20 20 0 0 1 14-16" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>`,
    // 27 いかり
    `<g stroke="${NAVY}" stroke-width="8" fill="none" stroke-linecap="round"><circle cx="50" cy="14" r="9"/><path d="M50 23v68M30 38h40M12 58c4 22 20 33 38 33s34-11 38-33"/></g><path d="M4 62 12 50 20 62ZM80 62l8-12 8 12Z" fill="${NAVY}"/>`,
    // 28 時計
    `<circle cx="50" cy="50" r="42" fill="#fff3c4" stroke="${INK}" stroke-width="7"/><g stroke="${INK}" stroke-width="4" stroke-linecap="round">${ring(12, 0, a => { const [x1, y1] = polar(50, 50, 31, a); const [x2, y2] = polar(50, 50, 36, a); return `<path d="M${x1} ${y1}L${x2} ${y2}"/>`; })}</g><path d="M50 50V24M50 50l18 12" stroke="${RED}" stroke-width="6" stroke-linecap="round"/>`,
    // 29 電球
    `<rect x="37" y="76" width="26" height="8" rx="2" fill="${GRAY}"/><rect x="40" y="86" width="20" height="8" rx="3" fill="${GRAY}"/><path d="M50 4a31 31 0 0 0-19 55c4 4 6 9 6 15h26c0-6 2-11 6-15A31 31 0 0 0 50 4Z" fill="${YELLOW}" stroke="${GOLD}" stroke-width="4"/><path d="M42 70V52l8 6 8-6v18" stroke="${GOLD}" stroke-width="3" fill="none"/>`,
    // 30 めがね
    `<path d="M10 46 4 32M90 46l6-14M44 50q6-8 12 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="27" cy="54" r="18" fill="${ICE}" stroke="${INK}" stroke-width="7"/><circle cx="73" cy="54" r="18" fill="${ICE}" stroke="${INK}" stroke-width="7"/>`,
    // 31 音符
    `<path d="M36 76V20l46-12v56" stroke="${INK}" stroke-width="7" fill="none" stroke-linejoin="round"/><path d="M36 30 82 18" stroke="${INK}" stroke-width="12"/><ellipse cx="25" cy="78" rx="14" ry="11" fill="${INK}"/><ellipse cx="71" cy="66" rx="14" ry="11" fill="${INK}"/>`,
    // 32 旗
    `<path d="M20 6v88" stroke="${GRAY}" stroke-width="7" stroke-linecap="round"/><path d="M24 10h62L72 30l14 20H24Z" fill="${RED}"/>`,
    // 33 ロケット
    `<path d="M40 72h20L50 96Z" fill="${ORANGE}"/><path d="M34 50 16 74l18-2ZM66 50l18 24-18-2Z" fill="${RED}"/><path d="M50 4c18 14 22 40 16 68H34C28 44 32 18 50 4Z" fill="#dfe4ec" stroke="${GRAY}" stroke-width="3"/><circle cx="50" cy="36" r="9" fill="${BLUE}" stroke="${GRAY}" stroke-width="3"/>`,
    // 34 車
    `<path d="M6 70V54l14-5 13-18h34l13 18 14 5v16Z" fill="${RED}"/><path d="M36 36h12v13H27ZM54 36h11l9 13H54Z" fill="${ICE}"/><circle cx="27" cy="72" r="11" fill="${INK}"/><circle cx="73" cy="72" r="11" fill="${INK}"/><circle cx="27" cy="72" r="4" fill="${GRAY}"/><circle cx="73" cy="72" r="4" fill="${GRAY}"/>`,
    // 35 はさみ
    `<path d="M38 64 74 8M62 64 26 8" stroke="${GRAY}" stroke-width="8" stroke-linecap="round"/><circle cx="50" cy="44" r="4" fill="${INK}"/><circle cx="30" cy="78" r="13" fill="none" stroke="${RED}" stroke-width="8"/><circle cx="70" cy="78" r="13" fill="none" stroke="${RED}" stroke-width="8"/>`,
    // 36 えんぴつ
    `<g transform="rotate(45 50 50)"><rect x="40" y="4" width="20" height="66" fill="${YELLOW}" stroke="${GOLD}" stroke-width="3"/><path d="M40 70h20L50 94Z" fill="#f3d9b1" stroke="${GOLD}" stroke-width="2"/><path d="M46 84h8l-4 10Z" fill="${INK}"/><rect x="40" y="4" width="20" height="11" fill="${PINK}"/></g>`,
    // 37 マグカップ
    `<path d="M30 20q-6-8 0-16M46 20q-6-8 0-16" stroke="${GRAY}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M68 40h8a13 13 0 0 1 0 26h-8" stroke="${TEAL}" stroke-width="8" fill="none"/><path d="M12 28h58v44a18 18 0 0 1-18 18H30a18 18 0 0 1-18-18Z" fill="${TEAL}"/>`,
    // 38 ろうそく
    `<path d="M50 6c9 11 11 19 11 24a11 11 0 0 1-22 0c0-5 2-13 11-24Z" fill="${ORANGE}"/><path d="M50 22c4 5 5 9 5 11a5 5 0 0 1-10 0c0-2 1-6 5-11Z" fill="${YELLOW}"/><path d="M50 40v6" stroke="${INK}" stroke-width="3"/><rect x="35" y="46" width="30" height="48" rx="3" fill="${PINK}"/><path d="M58 46v16" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/>`,
    // 39 骨
    `<g transform="rotate(-35 50 50)"><g stroke="#a08a5a" stroke-width="7"><rect x="22" y="42" width="56" height="16"/><circle cx="20" cy="40" r="11"/><circle cx="20" cy="60" r="11"/><circle cx="80" cy="40" r="11"/><circle cx="80" cy="60" r="11"/></g><g fill="${CREAM}"><rect x="22" y="42" width="56" height="16"/><circle cx="20" cy="40" r="11"/><circle cx="20" cy="60" r="11"/><circle cx="80" cy="40" r="11"/><circle cx="80" cy="60" r="11"/></g></g>`,
    // 40 足あと
    `<g fill="${BROWN}"><ellipse cx="50" cy="68" rx="22" ry="19"/><ellipse cx="20" cy="42" rx="10" ry="12"/><ellipse cx="38" cy="22" rx="10" ry="12"/><ellipse cx="62" cy="22" rx="10" ry="12"/><ellipse cx="80" cy="42" rx="10" ry="12"/></g>`,
    // 41 目
    `<path d="M4 50Q50 2 96 50 50 98 4 50Z" fill="#fff" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><circle cx="50" cy="50" r="19" fill="${TEAL}"/><circle cx="50" cy="50" r="9" fill="${INK}"/><circle cx="56" cy="44" r="4" fill="#fff"/>`,
    // 42 サイコロ
    `<rect x="10" y="10" width="80" height="80" rx="15" fill="#fff" stroke="${INK}" stroke-width="6"/><g fill="${RED}"><circle cx="31" cy="31" r="8"/><circle cx="69" cy="31" r="8"/><circle cx="50" cy="50" r="8"/><circle cx="31" cy="69" r="8"/><circle cx="69" cy="69" r="8"/></g>`,
    // 43 スペード
    `<path d="M50 6C40 26 10 40 10 60c0 14 10 22 22 22 7 0 12-3 15-8l-6 22h18l-6-22c3 5 8 8 15 8 12 0 22-8 22-22 0-20-30-34-40-54Z" fill="${INK}"/>`,
    // 44 クローバー
    `<path d="M50 56q2 24 12 38" stroke="${DARK_GREEN}" stroke-width="7" fill="none" stroke-linecap="round"/><g fill="${GREEN}"><circle cx="50" cy="28" r="19"/><circle cx="28" cy="56" r="19"/><circle cx="72" cy="56" r="19"/><circle cx="50" cy="48" r="12"/></g>`,
    // 45 おばけ
    `<path d="M18 92V44a32 32 0 0 1 64 0v48l-11-10-10 10-11-10-10 10-11-10Z" fill="#eef0f7" stroke="${GRAY}" stroke-width="5" stroke-linejoin="round"/><ellipse cx="39" cy="44" rx="6" ry="8" fill="${INK}"/><ellipse cx="61" cy="44" rx="6" ry="8" fill="${INK}"/><ellipse cx="50" cy="62" rx="6" ry="5" fill="${INK}"/>`,
    // 46 雪だるま
    `<g stroke="#4f7fb8" stroke-width="7"><circle cx="50" cy="68" r="26"/><circle cx="50" cy="30" r="18"/></g><g fill="#fff"><circle cx="50" cy="68" r="26"/><circle cx="50" cy="30" r="18"/></g><path d="M34 12h32v6H34ZM40 0h20v14H40Z" fill="${INK}" transform="translate(0 2)"/><circle cx="44" cy="28" r="3" fill="${INK}"/><circle cx="56" cy="28" r="3" fill="${INK}"/><path d="M50 32l12 4-12 2Z" fill="${ORANGE}"/><circle cx="50" cy="60" r="3.5" fill="${RED}"/><circle cx="50" cy="72" r="3.5" fill="${RED}"/>`,
    // 47 かなづち
    `<g transform="rotate(-40 50 50)"><rect x="43" y="34" width="14" height="62" rx="5" fill="${BROWN}"/><rect x="20" y="10" width="60" height="26" rx="5" fill="${GRAY}"/><rect x="20" y="10" width="10" height="26" fill="#5c6573"/></g>`,
    // 48 虫めがね
    `<path d="M62 62l28 28" stroke="${NAVY}" stroke-width="13" stroke-linecap="round"/><circle cx="40" cy="40" r="28" fill="${ICE}" stroke="${NAVY}" stroke-width="9"/><path d="M26 36a15 15 0 0 1 12-12" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    // 49 ボール
    `<circle cx="50" cy="50" r="43" fill="#fff"/>${sector(43, -90, -30, RED)}${sector(43, 30, 90, BLUE)}${sector(43, 150, 210, YELLOW)}<circle cx="50" cy="50" r="43" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="50" cy="50" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/>`,
    // 50 アイス
    `<path d="M28 48h44L50 96Z" fill="#e0a860"/><path d="M34 58 60 76M40 74l20-14M30 52l30 20" stroke="#b87a34" stroke-width="2.5"/><circle cx="36" cy="40" r="16" fill="${PINK}"/><circle cx="64" cy="40" r="16" fill="${CREAM}"/><circle cx="50" cy="22" r="16" fill="${BROWN}"/>`,
    // 51 陰陽
    `<circle cx="50" cy="50" r="43" fill="#fff" stroke="${INK}" stroke-width="5"/><path d="M50 7a43 43 0 0 1 0 86 21.5 21.5 0 0 1 0-43 21.5 21.5 0 0 0 0-43Z" fill="${INK}"/><circle cx="50" cy="28.5" r="7" fill="#fff"/><circle cx="50" cy="71.5" r="7" fill="${INK}"/>`,
    // 52 サボテン
    `<path d="M40 60H30a9 9 0 0 1-9-9V34M60 48h10a9 9 0 0 0 9-9V24" stroke="${GREEN}" stroke-width="13" fill="none" stroke-linecap="round"/><rect x="38" y="8" width="24" height="80" rx="12" fill="${GREEN}"/><path d="M50 20v58" stroke="${DARK_GREEN}" stroke-width="3"/><path d="M22 94h56" stroke="${BROWN}" stroke-width="7" stroke-linecap="round"/>`,
    // 53 風船
    `<path d="M50 78q-10 8 0 20" stroke="${GRAY}" stroke-width="3" fill="none"/><path d="M46 80h8l-4-7Z" fill="#c2457a"/><ellipse cx="50" cy="40" rx="30" ry="35" fill="${PINK}"/><path d="M34 28a16 18 0 0 1 10-12" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>`,
    // 54 的
    `<circle cx="50" cy="50" r="44" fill="${RED}"/><circle cx="50" cy="50" r="32" fill="#fff"/><circle cx="50" cy="50" r="20" fill="${RED}"/><circle cx="50" cy="50" r="8" fill="#fff"/>`,
    // 55 砂時計
    `<path d="M24 14h52c0 26-20 30-20 36s20 10 20 36H24c0-26 20-30 20-36s-20-10-20-36Z" fill="${ICE}" stroke="${BROWN}" stroke-width="4"/><path d="M33 84h34c-4-12-15-17-17-23-2 6-13 11-17 23ZM36 26h28c-3 8-10 12-14 16-4-4-11-8-14-16Z" fill="${YELLOW}"/><rect x="14" y="6" width="72" height="9" rx="3" fill="${BROWN}"/><rect x="14" y="85" width="72" height="9" rx="3" fill="${BROWN}"/>`,
    // 56 てんとう虫
    `<path d="M30 14 20 4M70 14l10-10" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="24" r="15" fill="${INK}"/><circle cx="50" cy="58" r="37" fill="${RED}"/><path d="M50 22v73" stroke="${INK}" stroke-width="4"/><g fill="${INK}"><circle cx="32" cy="44" r="7"/><circle cx="68" cy="44" r="7"/><circle cx="28" cy="68" r="6"/><circle cx="72" cy="68" r="6"/><circle cx="40" cy="84" r="5"/><circle cx="60" cy="84" r="5"/></g>`
];

// ページに一度だけ入れる symbol の定義
export function symbolDefs() {
    return `<defs>${SYMBOL_SVGS.map((body, i) => `<symbol id="sym-${i}" viewBox="0 0 100 100">${body}</symbol>`).join('')}</defs>`;
}

// 2つの数を混ぜて 32 ビットにする
function mix(a, b) {
    let h = Math.imul((a ^ 0x2545F491) >>> 0, 0x9E3779B1) ^ b;
    h = Math.imul(h ^ (h >>> 15), 0x85EBCA77);
    return (h ^ (h >>> 13)) >>> 0;
}

// カードの上の並び（カードの番号だけで決まる）。座標はカードの中心が 0、半径 100
// 真ん中に1つ、まわりに7つ。大きさは 0.64〜1 倍、向きは自由、まわりの7つは少し内外にずれる
const layouts = new Map();
export function cardLayout(card) {
    if (layouts.has(card)) return layouts.get(card);
    const random = createRandom(mix(card + 1, 0x5EED));
    const symbols = shuffle([...CARDS[card]], random);
    const offset = random() * 360;
    const layout = symbols.map((symbol, i) => {
        const center = i === 0;
        const max = center ? 36 : 27;
        const scale = 0.64 + random() * 0.36;
        const size = round(max * 2 * scale);
        const radius = center ? 0 : 62 + (random() - 0.5) * 8;
        const [x, y] = center ? [0, 0] : polar(0, 0, radius, offset + (360 / 7) * (i - 1));
        return { symbol, x, y, size, rotate: Math.floor(random() * 360) };
    });
    layouts.set(card, layout);
    return layout;
}

// カードの中身（svg の文字列）。highlight：ヒントで光らせるマーク、wrong：まちがえたマーク、got：当たったマーク
export function cardSvg(card, { highlight = null, wrong = null, got = null } = {}) {
    if (card === null || card === undefined) return '<svg class="card-art" viewBox="-100 -100 200 200" aria-hidden="true"><circle r="96" class="card-face empty"/></svg>';
    const marks = cardLayout(card).map(({ symbol, x, y, size, rotate }) => {
        const classes = ['sym'];
        if (symbol === highlight) classes.push('recommended');
        if (symbol === wrong) classes.push('wrong');
        if (symbol === got) classes.push('got');
        const half = size / 2;
        return `<g class="${classes.join(' ')}" data-symbol="${symbol}" transform="translate(${x} ${y}) rotate(${rotate})" role="button" aria-label="${SYMBOL_NAMES[symbol]}">`
            + `<circle class="hit" r="${round(half * 1.08)}"/><use href="#sym-${symbol}" x="${-half}" y="${-half}" width="${size}" height="${size}"/></g>`;
    }).join('');
    return `<svg class="card-art" viewBox="-100 -100 200 200"><circle r="96" class="card-face"/>${marks}</svg>`;
}

// 読み上げ用のカードの名前（マークを並べる）
export const cardLabel = (card) => (card === null || card === undefined ? 'なし' : CARDS[card].map(symbol => SYMBOL_NAMES[symbol]).join('・'));
