/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * ペンギン・魚・氷は symbol としてページに一度だけ入れ、use で使い回す
 * ペンギンのマフラーと足もとの輪は、プレイヤーの色（currentColor）
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

export const PLAYER_COLORS = ['#e4553f', '#3f7fe0', '#e9b52a', '#3caa5c'];
export const PLAYER_COLOR_NAMES = ['赤', '青', '黄', '緑'];

// 六角の氷の大きさ（盤の座標の単位）。横は W、縦は W×2/√3
export const HEX_W = 40;
export const HEX_H = HEX_W * 2 / Math.sqrt(3);

// とがった頂点が上の六角形の頂点（中心が 0,0、scale で大きさを変える）
export function hexPoints(scale = 1) {
    const r = (HEX_H / 2) * scale;
    return Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * (60 * i - 90);
        return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
}

const INK = '#1f2a3a';

// ペンギン（viewBox -20 -30 40 40。足もとが 0,6 あたり）
const PENGUIN = `
    <ellipse cx="0" cy="7" rx="13" ry="4.5" fill="currentColor" opacity=".9"/>
    <ellipse cx="0" cy="7" rx="13" ry="4.5" fill="none" stroke="#fff" stroke-width="1.2" opacity=".7"/>
    <path d="M-6 5.5l-3 2.2h6zM6 5.5l3 2.2h-6z" fill="#f3a03a" stroke="#c46f17" stroke-width=".7" stroke-linejoin="round"/>
    <path d="M-10.5 -6c-3 3-4 7-3 10 2-1 3.5-4 4-7zM10.5 -6c3 3 4 7 3 10-2-1-3.5-4-4-7z" fill="#2b3a55" stroke="${INK}" stroke-width=".8"/>
    <ellipse cx="0" cy="-8" rx="11" ry="14" fill="#2f3f5c" stroke="${INK}" stroke-width="1"/>
    <ellipse cx="0" cy="-3.5" rx="7.6" ry="9" fill="#fbf8f0"/>
    <ellipse cx="-4" cy="-16" rx="4.2" ry="4" fill="#fbf8f0"/>
    <ellipse cx="4" cy="-16" rx="4.2" ry="4" fill="#fbf8f0"/>
    <circle cx="-3.6" cy="-15.4" r="2.1" fill="${INK}"/><circle cx="-3" cy="-16.2" r=".8" fill="#fff"/>
    <circle cx="3.6" cy="-15.4" r="2.1" fill="${INK}"/><circle cx="4.2" cy="-16.2" r=".8" fill="#fff"/>
    <ellipse cx="-6.6" cy="-11.4" rx="1.8" ry="1.1" fill="#ff9a9a" opacity=".8"/>
    <ellipse cx="6.6" cy="-11.4" rx="1.8" ry="1.1" fill="#ff9a9a" opacity=".8"/>
    <path d="M-2.6 -12.2h5.2l-2.6 3.2z" fill="#f3a03a" stroke="#c46f17" stroke-width=".7" stroke-linejoin="round"/>
    <path d="M-9.6 -7.2c6 2.4 13.2 2.4 19.2 0v3c-6 2.4-13.2 2.4-19.2 0z" fill="currentColor" stroke="${INK}" stroke-width=".7"/>
    <path d="M4.5 -4.6l2 7 3-1-1.6-6.6z" fill="currentColor" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
    <ellipse cx="-5" cy="-19" rx="3" ry="1.6" fill="#fff" opacity=".25"/>`;

// 魚（viewBox -8 -5 16 10）
const FISH = `
    <path d="M-6.5 0c2-3.6 6.4-4.4 9.6-1.6L6.8 -3.4l-.6 3.4.6 3.4-3.7-2C-.1 4.4-4.5 3.6-6.5 0z" fill="#f08a4b" stroke="#b9541e" stroke-width=".8" stroke-linejoin="round"/>
    <circle cx="-3.4" cy="-.6" r=".9" fill="${INK}"/>
    <path d="M-.6 -2.2c.8 1.2.8 3.2 0 4.4" fill="none" stroke="#b9541e" stroke-width=".6"/>`;

// 線のアイコン（24×24）
const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>'
};

export function symbolsSvg() {
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
        <symbol id="penguin" viewBox="-20 -30 40 40" overflow="visible">${PENGUIN}</symbol>
        <symbol id="fish" viewBox="-8 -5 16 10" overflow="visible">${FISH}</symbol>
        <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f4fbff"/><stop offset=".55" stop-color="#cfe9f7"/><stop offset="1" stop-color="#a9d3ec"/>
        </linearGradient>
        ${icons}</defs></svg>`;
}

// 単独で使う本体（アイコンの画像を作るときに使う）
export const penguinBody = PENGUIN;
export const fishBody = FISH;

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 魚の並べ方（1〜3匹）。氷の中心からの位置
const FISH_SPOTS = {
    1: [[0, 0]],
    2: [[-4, -5], [4, 5]],
    3: [[0, -8], [-6, 3], [6, 9]]
};

// 氷1枚（中心 0,0）。魚の数だけ魚を描く
export function iceTile(fish) {
    const fishes = (FISH_SPOTS[fish] ?? []).map(([x, y]) => `<use href="#fish" x="${x - 8}" y="${y - 5}" width="16" height="10"/>`).join('');
    return `<polygon class="ice" points="${hexPoints(0.93)}"/>
        <polygon class="ice-shine" points="${hexPoints(0.78)}"/>${fishes}`;
}

// ペンギン1羽（足もとが 0,0 になるように置く）
export const penguinUse = (scale = 1) => `<use href="#penguin" x="${-20 * scale}" y="${-36 * scale}" width="${40 * scale}" height="${40 * scale}"/>`;

// 小さなペンギン（名前の横などに置く単独の SVG）
export const penguinIcon = (color, cls = '') => `<svg class="pg-icon ${cls}" viewBox="-14 -24 28 32" style="color:${color}" aria-hidden="true"><use href="#penguin" x="-20" y="-30" width="40" height="40"/></svg>`;

// 魚の小さな絵（点数の横に置く）
export const fishIcon = () => '<svg class="fish-icon" viewBox="-8 -5 16 10" aria-hidden="true"><use href="#fish" x="-8" y="-5" width="16" height="10"/></svg>';
