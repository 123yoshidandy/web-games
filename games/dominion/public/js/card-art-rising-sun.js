/** 拡張「旭日」のカードイラスト（viewBox 0 0 48 32） */

import { svg, ground } from './card-art-helpers.js';

// 和の色合い（朱・藍・墨・金・桜・松の緑・藁の黄）
const SKY = '#cfe7f7';
const SKY_DUSK = '#f3d9b5';
const SKY_NIGHT = '#24304f';
const SHU = '#d9452b';
const SHU_DARK = '#9e2a1a';
const INDIGO = '#2b4a7a';
const INDIGO_DARK = '#1c3256';
const INDIGO_LIGHT = '#6f8fbf';
const SUMI = '#2b2724';
const ROOF = '#3f4552';
const KIN = '#e9b93a';
const KIN_LIGHT = '#f2d47a';
const KIN_SHADE = '#e2c063';
const KIN_EDGE = '#a8761a';
const SAKURA = '#f4b6c2';
const SAKURA_DARK = '#d9849a';
const MATSU = '#3f6b3a';
const MATSU_DARK = '#2b4d29';
const GRASS = '#86bf5e';
const GRASS_DARK = '#5b9440';
const PADDY = '#9fcf6e';
const WATER = '#5dade2';
const WATER_DARK = '#3b8cc4';
const FOAM = '#e8f4fb';
const SAND = '#e6c88e';
const EARTH = '#7a5a3a';
const EARTH_DARK = '#3a2a1c';
const WOOD = '#8d5a2b';
const WOOD_LIGHT = '#b9824a';
const WOOD_EDGE = '#5d3a1a';
const THATCH = '#c9a55e';
const THATCH_EDGE = '#8a6a2c';
const STRAW = '#e2c97e';
const STRAW_LIGHT = '#f0dda4';
const STRAW_EDGE = '#a8884a';
const TATAMI = '#d8cf8f';
const TATAMI_EDGE = '#9e9655';
const STONE = '#b9b3a6';
const STONE_LIGHT = '#d6d0c2';
const STONE_EDGE = '#7a7468';
const STEEL = '#c3ccd3';
const STEEL_EDGE = '#6b7b86';
const COPPER = '#c98a4a';
const COPPER_EDGE = '#7a4a22';
const WASHI = '#f6efdc';
const PLASTER = '#f1e8d2';
const PURPLE = '#6c3f8f';
const SKIN = '#f0c8a0';
const SKIN_PALE = '#f6e3d6';
const INK = '#3e2f2a';
const FISH = '#a9bccb';
const FOX = '#f6f2ea';
const FOX_EDGE = '#b9b0a0';
const FOXFIRE = '#9fe3ff';
const TANUKI = '#8a6a4a';
const TANUKI_LIGHT = '#d9c09a';
const TANUKI_DARK = '#4a3626';
const SNAKE = '#4f8a5a';
const SNAKE_LIGHT = '#a7d39a';
const FIRE_CORE = '#ffe08a';

// 空・室内の壁・畳
const sky = (color = SKY) => `<rect x="0" y="0" width="48" height="27" fill="${color}"/>`;
const wall = (color = WASHI) => `<rect x="0" y="0" width="48" height="27" fill="${color}"/>`;
const tatami = () => `${ground(TATAMI)}<path d="M0 27 h48 M18 27 v5 M34 27 v5" stroke="${TATAMI_EDGE}" stroke-width="0.5"/>`;

// 白い雲
const cloud = (x, y, s = 1) => `
    <g fill="#fff" opacity="0.9">
        <ellipse cx="${x}" cy="${y}" rx="${4 * s}" ry="${1.6 * s}"/>
        <circle cx="${x - 1.2 * s}" cy="${y - 1 * s}" r="${1.6 * s}"/>
        <circle cx="${x + 1.2 * s}" cy="${y - 1.2 * s}" r="${2 * s}"/>
    </g>`;

const stars = (points) => points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.5" fill="#fff6c9"/>`).join('');

// 光のきらめき
const sparkle = (x, y, r = 2, color = '#fff6c9') =>
    `<path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3}z" fill="${color}"/>`;

// 舞う桜の花びら
const petals = (points) => points.map(([x, y]) =>
    `<ellipse cx="${x}" cy="${y}" rx="0.8" ry="0.5" fill="${SAKURA}" transform="rotate(30 ${x} ${y})"/>`).join('');

// 立っている人（x は体の中心）
const person = (x, cloth, { skin = SKIN, hair = '', scale = 1 } = {}) => `
    <g transform="translate(${x} 27) scale(${scale}) translate(${-x} -27)">
        <path d="M${x - 2} 23 v4 M${x + 2} 23 v4" stroke="${INK}" stroke-width="1.6"/>
        <path d="M${x - 4} 23 L${x - 3} 14.5 h6 L${x + 4} 23 z" fill="${cloth}"/>
        <path d="M${x - 1.4} 14.5 L${x} 17 L${x + 1.4} 14.5" stroke="${WASHI}" stroke-width="0.6" fill="none"/>
        <circle cx="${x}" cy="11" r="3" fill="${skin}"/>
        ${hair}
    </g>`;

// 長い衣の人
const robed = (x, cloth, { skin = SKIN, hair = '' } = {}) => `
    <path d="M${x - 5} 27 L${x - 3} 14.5 h6 L${x + 5} 27 z" fill="${cloth}"/>
    <path d="M${x - 1.4} 14.5 L${x} 17.4 L${x + 1.4} 14.5" stroke="${WASHI}" stroke-width="0.7" fill="none"/>
    <circle cx="${x}" cy="11" r="3" fill="${skin}"/>
    ${hair}`;

const arm = (x1, y1, x2, y2, color = SKIN) =>
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`;

// 髷・鉢巻き・笠・烏帽子
const mage = (x, color = SUMI) =>
    `<path d="M${x - 3} 10.5 q3 -5 6 0" fill="${color}"/><path d="M${x - 0.4} 8 q0.6 -2 2.4 -2.2" stroke="${color}" stroke-width="1" fill="none"/>`;
const hachimaki = (x) =>
    `<path d="M${x - 3} 9.8 h6" stroke="#fff" stroke-width="1"/><path d="M${x + 3} 9.8 l1.4 -1 M${x + 3} 9.8 l1.6 0.6" stroke="#fff" stroke-width="0.6"/>`;
const kasa = (x, y = 9.4, w = 11) =>
    `<path d="M${x - w / 2} ${y} L${x} ${y - 4} L${x + w / 2} ${y}z" fill="${STRAW}" stroke="${STRAW_EDGE}" stroke-width="0.4"/><path d="M${x} ${y - 4} V${y}" stroke="${STRAW_EDGE}" stroke-width="0.3"/>`;
const eboshi = (x) =>
    `<path d="M${x - 2.6} 9 q-0.6 -5.6 2 -7 q3 0.4 3.2 7z" fill="${SUMI}"/>`;

// 小判・銭
const koban = (x, y, s = 1) => `
    <ellipse cx="${x}" cy="${y}" rx="${1.5 * s}" ry="${2.3 * s}" fill="${KIN}" stroke="${KIN_EDGE}" stroke-width="0.4"/>
    <path d="M${x - 0.8 * s} ${y - 0.9 * s} h${1.6 * s} M${x - 0.8 * s} ${y} h${1.6 * s} M${x - 0.8 * s} ${y + 0.9 * s} h${1.6 * s}" stroke="${KIN_EDGE}" stroke-width="0.25"/>`;
const zeni = (x, y, r = 1.6) => `
    <circle cx="${x}" cy="${y}" r="${r}" fill="${COPPER}" stroke="${COPPER_EDGE}" stroke-width="0.4"/>
    <rect x="${x - r * 0.3}" y="${y - r * 0.3}" width="${r * 0.6}" height="${r * 0.6}" fill="${COPPER_EDGE}"/>`;

// 米俵（x は中心、y は底）
const tawara = (x, y, w = 9, h = 5) => `
    <rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="${h / 2}" fill="${STRAW}" stroke="${STRAW_EDGE}" stroke-width="0.5"/>
    <path d="M${x - w / 4} ${y - h} v${h} M${x} ${y - h} v${h} M${x + w / 4} ${y - h} v${h}" stroke="${STRAW_EDGE}" stroke-width="0.6"/>
    <ellipse cx="${x - w / 2 + h * 0.28}" cy="${y - h / 2}" rx="${h * 0.24}" ry="${h * 0.42}" fill="${STRAW_LIGHT}" stroke="${STRAW_EDGE}" stroke-width="0.3"/>`;

// 稲穂（根元 x,y から上へ、lean で穂の垂れる向き）
const riceEar = (x, y, h = 12, lean = 1) => {
    const ex = x + lean * 3;
    const ey = y - h;
    const grains = [0, 1, 2, 3, 4].map(k =>
        `<ellipse cx="${ex + lean * k * 0.8}" cy="${ey + k * 1.3}" rx="0.6" ry="1" fill="${KIN}" stroke="${KIN_EDGE}" stroke-width="0.2" transform="rotate(${-lean * 30} ${ex + lean * k * 0.8} ${ey + k * 1.3})"/>`).join('');
    return `<path d="M${x} ${y} q0 ${-h * 0.7} ${lean * 3} ${-h}" stroke="${GRASS_DARK}" stroke-width="0.6" fill="none"/>${grains}`;
};

// 鳥居（x は中心、y は柱の根元）
const torii = (x, y = 27, w = 12, h = 12, color = SHU) => `
    <rect x="${x - w / 2 + 1}" y="${y - h + 1}" width="1.3" height="${h - 1}" fill="${color}"/>
    <rect x="${x + w / 2 - 2.3}" y="${y - h + 1}" width="1.3" height="${h - 1}" fill="${color}"/>
    <rect x="${x - w / 2}" y="${y - h + 3}" width="${w}" height="1" fill="${color}"/>
    <rect x="${x - w / 2 - 0.4}" y="${y - h + 0.8}" width="${w + 0.8}" height="0.9" fill="${color}"/>
    <path d="M${x - w / 2 - 1.5} ${y - h - 0.6} q${w / 2 + 1.5} 1.4 ${w + 3} 0 l-0.4 1.6 q-${w / 2 + 1.1} 1 -${w + 2.2} 0z" fill="${SUMI}"/>`;

// 小さな祠（x は中心、y は台の底）
const hokora = (x, y = 27, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})">
        <rect x="-5" y="-2" width="10" height="2" fill="${STONE}" stroke="${STONE_EDGE}" stroke-width="0.4"/>
        <rect x="-3.6" y="-9" width="7.2" height="7" fill="${WOOD_LIGHT}" stroke="${WOOD_EDGE}" stroke-width="0.4"/>
        <rect x="-1.8" y="-7.4" width="3.6" height="5.4" fill="${WOOD_EDGE}"/>
        <path d="M-3.6 -8.2 h7.2" stroke="${STRAW}" stroke-width="0.7"/>
        <path d="M-1.6 -8 l0.6 1 l-0.6 0.6 M1.6 -8 l0.6 1 l-0.6 0.6" stroke="#fff" stroke-width="0.4" fill="none"/>
        <path d="M-6 -8.6 q6 -1.6 12 0 l-2 -3.4 h-8z" fill="${ROOF}"/>
        <path d="M-4.4 -12.6 l1.6 1.6 M4.4 -12.6 l-1.6 1.6" stroke="${ROOF}" stroke-width="0.6"/>
    </g>`;

// 提灯（x,y は中心）
const chochin = (x, y, s = 1, color = SHU, glow = true) => `
    <g transform="translate(${x} ${y}) scale(${s})">
        ${glow ? `<circle r="5.6" fill="${FIRE_CORE}" opacity="0.18"/>` : ''}
        <path d="M0 -4.2 v-2" stroke="${SUMI}" stroke-width="0.4"/>
        <ellipse cx="0" cy="0" rx="2.4" ry="3.4" fill="${color}"/>
        <path d="M-2.3 -1.2 h4.6 M-2.4 0.4 h4.8 M-2.2 1.8 h4.4" stroke="${SHU_DARK}" stroke-width="0.3"/>
        <rect x="-1.4" y="-4.2" width="2.8" height="1" fill="${SUMI}"/>
        <rect x="-1.4" y="3.2" width="2.8" height="1" fill="${SUMI}"/>
    </g>`;

// 松（x は根元）
const pine = (x, y = 27, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})">
        <path d="M0 0 q-1 -5 1 -9 q1 -3 -1 -6" stroke="${WOOD_EDGE}" stroke-width="1.4" fill="none"/>
        <ellipse cx="-2.4" cy="-9" rx="4" ry="1.6" fill="${MATSU}"/>
        <ellipse cx="3" cy="-12" rx="3.6" ry="1.5" fill="${MATSU}"/>
        <ellipse cx="-0.6" cy="-15.4" rx="3.4" ry="1.5" fill="${MATSU_DARK}"/>
    </g>`;

// 茅葺きの家（x は左端、y は土台）
const minka = (x, w, h, y = 27) => `
    <rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${PLASTER}" stroke="${WOOD_EDGE}" stroke-width="0.5"/>
    <path d="M${x + w * 0.3} ${y - h} v${h} M${x + w * 0.7} ${y - h} v${h}" stroke="${WOOD_EDGE}" stroke-width="0.5"/>
    <rect x="${x + w / 2 - 1.2}" y="${y - h * 0.7}" width="2.4" height="${h * 0.7}" fill="${WOOD_EDGE}"/>
    <path d="M${x - 2} ${y - h} L${x + w * 0.2} ${y - h - w * 0.5} h${w * 0.6} L${x + w + 2} ${y - h}z" fill="${THATCH}" stroke="${THATCH_EDGE}" stroke-width="0.5"/>
    <path d="M${x + w * 0.2} ${y - h - w * 0.5} h${w * 0.6}" stroke="${SUMI}" stroke-width="1"/>`;

// 川（y から下）
const river = (y = 22, color = WATER) => `
    <rect x="0" y="${y}" width="48" height="${32 - y}" fill="${color}"/>
    <path d="M4 ${y + 2} q2 -0.8 4 0 M20 ${y + 4} q2 -0.8 4 0 M36 ${y + 2.4} q2 -0.8 4 0" stroke="${FOAM}" stroke-width="0.5" fill="none"/>`;

// 障子（x,y は左上）
const shoji = (x, y, w, h) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${WASHI}" stroke="${WOOD}" stroke-width="0.6"/>
    ${Array.from({ length: Math.ceil(w / 3) - 1 }, (_, i) => `<path d="M${x + 3 * (i + 1)} ${y} v${h}" stroke="${WOOD_LIGHT}" stroke-width="0.35"/>`).join('')}
    ${Array.from({ length: Math.ceil(h / 4) - 1 }, (_, i) => `<path d="M${x} ${y + 4 * (i + 1)} h${w}" stroke="${WOOD_LIGHT}" stroke-width="0.35"/>`).join('')}`;

// 魚（x,y は体の中心、左向き）
const fish = (x, y, s = 1, color = FISH) => `
    <g transform="translate(${x} ${y}) scale(${s})">
        <path d="M-4 0 q3 -2.4 6.4 0 l2.4 -1.6 v3.2 l-2.4 -1.6 q-3.2 2.4 -6.4 0z" fill="${color}" stroke="${STEEL_EDGE}" stroke-width="0.3"/>
        <circle cx="-2.6" cy="-0.3" r="0.35" fill="${SUMI}"/>
    </g>`;

// 家紋（丸に桜）
const mon = (x, y, r = 3, color = SUMI) => `
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${(r * 0.14).toFixed(2)}"/>
    ${[0, 72, 144, 216, 288].map(a => {
        const t = (a - 90) * Math.PI / 180;
        return `<circle cx="${(x + Math.cos(t) * r * 0.42).toFixed(2)}" cy="${(y + Math.sin(t) * r * 0.42).toFixed(2)}" r="${(r * 0.3).toFixed(2)}" fill="${color}"/>`;
    }).join('')}`;

// 手裏剣
const shuriken = (x, y, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s}) rotate(20)">
        <path d="M0 -2.4 L0.6 -0.6 L2.4 0 L0.6 0.6 L0 2.4 L-0.6 0.6 L-2.4 0 L-0.6 -0.6z" fill="${STEEL}" stroke="${STEEL_EDGE}" stroke-width="0.3"/>
        <circle r="0.5" fill="${SKY_NIGHT}"/>
    </g>`;

// 狐火
const wisp = (x, y, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})">
        <circle r="3.2" fill="${FOXFIRE}" opacity="0.22"/>
        <path d="M0 1.6 q-1.8 -0.4 -1.4 -2 q0.4 -1.4 1.4 -3.2 q1 1.8 1.4 3.2 q0.4 1.6 -1.4 2z" fill="${FOXFIRE}"/>
        <circle cy="0" r="0.6" fill="#fff"/>
    </g>`;

export const RISING_SUN_ART = {
    // ===== コスト2 =====
    // 魚屋：藍の暖簾の下、台に魚を並べた店先
    fishmonger: svg(`
        ${wall()}
        ${ground(WOOD_LIGHT)}
        <rect x="0" y="0" width="48" height="3" fill="${WOOD_EDGE}"/>
        ${[2, 14, 26, 38].map(x => `<rect x="${x}" y="3" width="11" height="7" fill="${INDIGO}"/><circle cx="${x + 5.5}" cy="6.4" r="1.6" fill="none" stroke="${WASHI}" stroke-width="0.6"/>`).join('')}
        ${person(24, INDIGO_LIGHT, { hair: mage(24) + hachimaki(24) })}
        ${arm(27, 15.4, 31, 13)}
        <path d="M31 13 l2.6 -3" stroke="${STEEL}" stroke-width="0.9" stroke-linecap="round"/>
        <rect x="3" y="18" width="42" height="9" fill="${WOOD}" stroke="${WOOD_EDGE}" stroke-width="0.5"/>
        <rect x="3" y="17" width="42" height="1.6" fill="${WOOD_LIGHT}" stroke="${WOOD_EDGE}" stroke-width="0.4"/>
        <path d="M6 16.8 q5 -1.6 9 0 M31 16.8 q5 -1.6 10 0" stroke="${GRASS_DARK}" stroke-width="1.2" fill="none"/>
        ${fish(10, 15.6)}${fish(18, 16, 0.85, '#d98a6a')}${fish(34, 15.6)}${fish(41.4, 16, 0.8, '#d98a6a')}
    `),
    // 濡女：夜の川から現れる、蛇の体の女
    snake_witch: svg(`
        <rect x="0" y="0" width="48" height="32" fill="#22343a"/>
        <circle cx="40" cy="6" r="3" fill="#e8e4c9" opacity="0.8"/>
        <path d="M6 2 l-1 3 M30 1 l-1 3 M44 13 l-1 3 M10 12 l-1 3 M34 10 l-1 3" stroke="#7fa3ad" stroke-width="0.4"/>
        <path d="M16 20 L17.4 13.4 h5.2 L24 20z" fill="#d8e2dc"/>
        <circle cx="20" cy="10" r="3" fill="${SKIN_PALE}"/>
        <path d="M16.8 10 q0 -4.6 3.2 -4.6 q3.2 0 3.2 4.6 q0.6 5 2 9 q-2 0.6 -3 -1 q-0.6 -5 -1 -7 q-1.6 1 -3 0 q-0.6 4 -2 8 q-1.2 0 -1.6 -1 q1.4 -4 0.2 -8z" fill="${SUMI}"/>
        <circle cx="19" cy="10.4" r="0.4" fill="#e9d84a"/><circle cx="21" cy="10.4" r="0.4" fill="#e9d84a"/>
        ${river(20, '#2f5f6a')}
        <path d="M23 21 q6 4 12 2 q8 -3 9 3 q-4 4 -12 3 q-6 -1 -9 2" fill="none" stroke="${SNAKE}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M23 21 q6 4 12 2 q8 -3 9 3 q-4 4 -12 3 q-6 -1 -9 2" fill="none" stroke="${SNAKE_LIGHT}" stroke-width="0.6" stroke-dasharray="0.8 1.4"/>
        <path d="M17 21.4 q-1 1.6 0 2.6 M22 21.6 q1 1.4 0 2.4" stroke="#7fa3ad" stroke-width="0.4" fill="none"/>
    `),

    // ===== コスト3 =====
    // 公家：金屏風の前で笏を持つ、烏帽子の貴族
    aristocrat: svg(`
        <rect x="0" y="0" width="48" height="27" fill="${KIN_LIGHT}"/>
        <path d="M8 0 V27 M16 0 V27 M24 0 V27 M32 0 V27 M40 0 V27" stroke="${KIN_EDGE}" stroke-width="0.3"/>
        <rect x="2" y="4" width="14" height="3" rx="1.5" fill="${KIN}"/>
        <rect x="30" y="7" width="16" height="3" rx="1.5" fill="${KIN}"/>
        <rect x="4" y="18" width="12" height="2.6" rx="1.3" fill="${KIN}"/>
        ${tatami()}
        <path d="M11 27 Q13 15 24 14 Q35 15 37 27z" fill="${PURPLE}"/>
        <path d="M21.6 14.4 L24 18 L26.4 14.4" stroke="${WASHI}" stroke-width="0.8" fill="none"/>
        <circle cx="24" cy="11" r="3" fill="${SKIN_PALE}"/>
        ${eboshi(24)}
        <ellipse cx="22.8" cy="9.6" rx="0.5" ry="0.3" fill="${SUMI}"/><ellipse cx="25.2" cy="9.6" rx="0.5" ry="0.3" fill="${SUMI}"/>
        <path d="M24 23 L25.2 15.6" stroke="${WASHI}" stroke-width="1.3" stroke-linecap="round"/>
        <circle cx="24.4" cy="21" r="1.2" fill="${SKIN_PALE}"/>
    `),
    // 名匠：工房で漆の箱を仕上げる職人
    craftsman: svg(`
        ${wall('#8a6a4a')}
        <path d="M0 6 h48 M0 13 h48 M0 20 h48" stroke="#6e5238" stroke-width="0.5"/>
        ${ground(WOOD_LIGHT)}
        <path d="M30 3 h10 l-1 3 h-9z" fill="${STEEL}" stroke="${STEEL_EDGE}" stroke-width="0.3"/>
        <rect x="40" y="3.6" width="4" height="1.8" fill="${WOOD}"/>
        <path d="M24 3 v5 M26 3 v5 M28 3 v4" stroke="${STEEL_EDGE}" stroke-width="0.6"/>
        <rect x="22" y="18" width="23" height="2.4" fill="${WOOD}" stroke="${WOOD_EDGE}" stroke-width="0.4"/>
        <path d="M24 20.4 V27 M43 20.4 V27" stroke="${WOOD_EDGE}" stroke-width="1.2"/>
        <rect x="29" y="12.6" width="11" height="5.4" fill="${SHU}" stroke="${SHU_DARK}" stroke-width="0.4"/>
        <path d="M29 14.2 h11" stroke="${SHU_DARK}" stroke-width="0.4"/>
        ${mon(34.5, 16, 1.2, KIN)}
        ${person(14, INDIGO, { hair: mage(14) + hachimaki(14) })}
        ${arm(17, 15.4, 21, 12)}
        <path d="M20.4 12.6 l2 -2.4" stroke="${WOOD_EDGE}" stroke-width="0.8"/>
        <rect x="21" y="8.4" width="2.6" height="1.6" fill="${WOOD}" transform="rotate(-50 22.3 9.2)"/>
        ${sparkle(41, 11, 1.2)}
        <path d="M6 26 q1 -1.2 2 0 M29 26.4 q1 -1 2 0 M34 26 q1 -1.2 2 0" stroke="${WOOD_EDGE}" stroke-width="0.4" fill="none"/>
    `),
    // 川船：俵を積んで川を下る小舟
    riverboat: svg(`
        ${sky()}
        ${cloud(12, 5)}
        <path d="M0 18 L8 10 L15 15 L24 7 L33 14 L40 9 L48 15 V20 H0z" fill="#9db7c9"/>
        <rect x="0" y="18.6" width="48" height="2" fill="${GRASS_DARK}"/>
        ${pine(5, 20, 0.5)}${pine(43, 20, 0.45)}
        ${river(20)}
        ${person(31, INDIGO, { hair: kasa(31), scale: 0.8 })}
        ${arm(33, 17.6, 37, 15)}
        <path d="M36 8 L41 30" stroke="${WOOD_EDGE}" stroke-width="0.8"/>
        ${tawara(18, 24, 7, 4)}${tawara(25, 24, 7, 4)}${tawara(21.5, 20.4, 7, 3.6)}
        <path d="M10 24 h26 q-2 3.4 -6 3.4 h-16 q-3 0 -4 -3.4z" fill="${WOOD}" stroke="${WOOD_EDGE}" stroke-width="0.5"/>
        <path d="M10.4 24 l-4 -2.6 l1 -0.2 l4.4 2.4z" fill="${WOOD}" stroke="${WOOD_EDGE}" stroke-width="0.4"/>
        <path d="M8 29 q2 -0.8 4 0 M34 29.4 q2 -0.8 4 0" stroke="${FOAM}" stroke-width="0.5" fill="none"/>
    `),
    // 室：土の中に掘った、俵と野菜の貯蔵室
    root_cellar: svg(`
        <rect x="0" y="0" width="48" height="8" fill="${SKY}"/>
        <rect x="0" y="8" width="48" height="24" fill="${EARTH}"/>
        <rect x="0" y="7" width="48" height="2" fill="${GRASS}"/>
        <path d="M3 8 L8 3 L13 8z" fill="${THATCH}" stroke="${THATCH_EDGE}" stroke-width="0.4"/>
        <path d="M8 30 V18 Q8 12 24 12 Q40 12 40 18 V30z" fill="${EARTH_DARK}"/>
        <path d="M6 9 h4 v3 h-4z M7 12 h4 v3 h-4z M8 15 h4 v3 h-4z" fill="${WOOD_LIGHT}" stroke="${WOOD_EDGE}" stroke-width="0.3"/>
        ${tawara(19, 29, 9, 5)}${tawara(29, 29, 9, 5)}${tawara(24, 24, 9, 5)}
        <path d="M34 29 q-2 -4 0 -7 h4 q2 3 0 7z" fill="#6b4a32" stroke="${WOOD_EDGE}" stroke-width="0.3"/>
        <rect x="33.4" y="21.2" width="5.2" height="1" fill="${WOOD_EDGE}"/>
        <path d="M11.6 29 q-1 -4 0.6 -7 q1.6 3 0.4 7z M14 29 q-1 -3.4 0.6 -6 q1.4 2.6 0.4 6z" fill="#f4f1e6"/>
        <path d="M12.2 22 l-1 -2 M12.2 22 l1 -2 M14.6 23 l-0.8 -1.8 M14.6 23 l0.8 -1.8" stroke="${GRASS_DARK}" stroke-width="0.6"/>
        <path d="M18 18 q2 -1 4 0 M30 16 q2 -1 4 0" stroke="#5a4028" stroke-width="0.4" fill="none"/>
    `),

    // ===== コスト4 =====
    // 小路：提灯の灯る夕暮れの細い路地
    alley: svg(`
        <rect x="0" y="0" width="48" height="32" fill="#3a3550"/>
        ${stars([[22, 2], [26, 4]])}
        <rect x="18" y="6" width="12" height="20" fill="#2c2838"/>
        <rect x="22" y="16" width="4" height="8" fill="${FIRE_CORE}" opacity="0.7"/>
        <path d="M0 0 L18 6 V26 L0 32z" fill="#5a3d28"/>
        <path d="M48 0 L30 6 V26 L48 32z" fill="#4a3220"/>
        <path d="M5 2 V30 M10 3.6 V28.6 M14 5 V27.4 M43 2 V30 M38 3.6 V28.6 M34 5 V27.4" stroke="#2e1e12" stroke-width="0.5"/>
        <path d="M0 4 L18 8.4 V9.6 L0 7z M48 4 L30 8.4 V9.6 L48 7z" fill="${SUMI}"/>
        <path d="M18 26 h12 L40 32 H8z" fill="${STONE}"/>
        <path d="M16 28 h16 M13 30.4 h22 M24 26 V32" stroke="${STONE_EDGE}" stroke-width="0.4"/>
        ${chochin(9, 14, 1)}${chochin(39, 14, 1)}${chochin(20.4, 12, 0.5)}${chochin(27.6, 12, 0.5)}
    `),
    // 交替：天秤で小判と銭を両替する
    change: svg(`
        ${wall()}
        ${shoji(2, 2, 12, 16)}${shoji(34, 2, 12, 16)}
        ${ground(WOOD_LIGHT)}
        <rect x="4" y="20" width="40" height="7" fill="${WOOD}" stroke="${WOOD_EDGE}" stroke-width="0.5"/>
        <path d="M24 20 V7" stroke="${WOOD_EDGE}" stroke-width="1.2"/>
        <rect x="21" y="19" width="6" height="1.4" fill="${WOOD_EDGE}"/>
        <path d="M13 8 L35 8" stroke="${WOOD_EDGE}" stroke-width="0.9"/>
        <circle cx="24" cy="7.4" r="1" fill="${KIN}"/>
        <path d="M14 8 L11 15 M14 8 L17 15 M34 8 L31 15 M34 8 L37 15" stroke="${INK}" stroke-width="0.3"/>
        <path d="M10 15 h8 q-1 2 -4 2 q-3 0 -4 -2z M30 15 h8 q-1 2 -4 2 q-3 0 -4 -2z" fill="${STEEL}" stroke="${STEEL_EDGE}" stroke-width="0.4"/>
        ${koban(12.6, 12.8, 0.9)}${koban(15.4, 12.8, 0.9)}
        ${zeni(32, 14, 1.2)}${zeni(35, 14, 1.2)}${zeni(33.5, 12.2, 1.2)}
        ${koban(9, 23.6)}${zeni(37, 23.6)}${zeni(40.6, 24, 1.4)}
    `),
    // 忍者：月夜の屋根の上の忍者と手裏剣
    ninja: svg(`
        <rect x="0" y="0" width="48" height="32" fill="${SKY_NIGHT}"/>
        ${stars([[5, 4], [14, 2], [24, 6], [44, 18]])}
        <circle cx="35" cy="9" r="6" fill="#f3eecb"/>
        <path d="M0 23 L48 19 V32 H0z" fill="#3c4250"/>
        ${[4, 10, 16, 22, 28, 34, 40, 46].map(x => `<path d="M${x} ${23 - x / 12} V32" stroke="#2a2e38" stroke-width="0.6"/>`).join('')}
        <path d="M0 23 L48 19" stroke="#2a2e38" stroke-width="1.2"/>
        <path d="M29 20.4 q0 -6 5 -7.4 q5 1.4 5 7z" fill="${SUMI}"/>
        <path d="M30 15 L37.6 21" stroke="${STEEL_EDGE}" stroke-width="0.9"/>
        <circle cx="34" cy="10" r="2.8" fill="${SUMI}"/>
        <rect x="32" y="9.2" width="4" height="1.2" fill="${SKIN}"/>
        <circle cx="33.2" cy="9.8" r="0.3" fill="${SUMI}"/><circle cx="34.8" cy="9.8" r="0.3" fill="${SUMI}"/>
        <path d="M31.4 9 q-4 -1 -7 1 q3 0 6 1z" fill="${SUMI}"/>
        ${shuriken(16, 13)}${shuriken(8, 18, 0.8)}
        <path d="M19 13 h4 M20 14.4 h3 M10.6 18 h3 M11 19.2 h2.4" stroke="#8a93a8" stroke-width="0.4"/>
    `),
    // 歌人：桜の下、短冊に筆で歌を書く
    poet: svg(`
        ${wall()}
        ${tatami()}
        <path d="M0 4 q8 2 14 0 q4 -1 8 2" stroke="${WOOD_EDGE}" stroke-width="1" fill="none"/>
        ${[[3, 4.6], [8, 4.8], [13, 3.2], [18, 3.6], [21.4, 5.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="${SAKURA}"/><circle cx="${x}" cy="${y}" r="0.5" fill="${SAKURA_DARK}"/>`).join('')}
        <path d="M34 0 q4 6 12 7" stroke="#7c9a4a" stroke-width="0.8" fill="none"/>
        <path d="M37.4 3.4 v3 M43 6.4 v2" stroke="${INK}" stroke-width="0.3"/>
        <rect x="36" y="6.4" width="2.8" height="11" fill="#bcd3e8"/>
        <rect x="41.6" y="8.4" width="2.8" height="11" fill="#f1dc8a"/>
        <path d="M37.4 8.4 v2 m0 1.4 q-0.6 1 0 2 M43 10.4 v2 m0 1.4 v2" stroke="${SUMI}" stroke-width="0.35" fill="none"/>
        <rect x="14" y="7" width="5" height="19" fill="${SAKURA}" stroke="${SAKURA_DARK}" stroke-width="0.4"/>
        <path d="M16.5 9.4 v2.4 m-0.6 1.6 q1.4 0.8 0 2.4 m0.6 1.4 v2.2" stroke="${SUMI}" stroke-width="0.5" fill="none"/>
        <path d="M28 6 L19.6 19.4" stroke="#c9a86a" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M20.4 18 L18.6 21" stroke="${SUMI}" stroke-width="1.1" stroke-linecap="round"/>
        <rect x="26" y="23.6" width="7" height="3.4" rx="0.6" fill="${SUMI}"/>
        <rect x="27" y="24.4" width="2.4" height="1.6" fill="#4a5568"/>
        ${petals([[8, 10], [25, 12], [11, 17], [31, 18]])}
    `),
    // 川の社：川辺の小さな祠と、水に立つ鳥居
    river_shrine: svg(`
        ${sky()}
        ${cloud(36, 5)}
        <path d="M0 17 Q12 11 24 15 Q36 10 48 14 V22 H0z" fill="#a9c99a"/>
        ${ground(GRASS)}
        <rect x="0" y="20" width="48" height="7" fill="${GRASS}"/>
        <path d="M22 32 Q26 22 48 20 V32z" fill="${WATER}"/>
        <path d="M30 26 q2 -0.8 4 0 M38 23 q2 -0.8 4 0 M40 29 q2 -0.8 4 0" stroke="${FOAM}" stroke-width="0.5" fill="none"/>
        ${hokora(12, 26, 1.1)}
        ${torii(36, 27, 11, 11)}
        <g opacity="0.3" transform="translate(0 54) scale(1 -1)">${torii(36, 27, 11, 4)}</g>
        <path d="M22 27 q-1 -4 0 -6 M24 27 q0 -3 1.4 -5 M26 26 q0.2 -3 1.6 -4" stroke="${GRASS_DARK}" stroke-width="0.6" fill="none"/>
    `),
    // 田舎の村：山の麓の茅葺きの家と田んぼ
    rustic_village: svg(`
        ${sky()}
        ${cloud(10, 5)}${cloud(38, 7, 0.8)}
        <path d="M0 16 L10 8 L18 13 L28 5 L38 12 L48 8 V20 H0z" fill="#8fb08a"/>
        <rect x="0" y="18" width="48" height="4" fill="${GRASS}"/>
        ${pine(44, 21, 0.45)}
        ${minka(4, 10, 4.4, 21)}${minka(24, 12, 5, 21)}
        <rect x="0" y="21" width="48" height="11" fill="${PADDY}"/>
        ${[23, 25.6, 28.2, 30.8].map(y => `<path d="M0 ${y} h48" stroke="${GRASS_DARK}" stroke-width="1.2" stroke-dasharray="0.6 1.6"/>`).join('')}
        <path d="M16 21 L10 32 M34 21 L40 32" stroke="${SAND}" stroke-width="1"/>
        <path d="M20 26 h4 M28 29 h5" stroke="${FOAM}" stroke-width="0.4"/>
    `),

    // ===== コスト5 =====
    // 金山：木組みの坑道と、光る金の鉱石
    gold_mine: svg(`
        ${sky()}
        <path d="M0 27 L0 12 L14 3 L30 9 L48 4 V27z" fill="#8a7a5e"/>
        <path d="M6 14 l4 -2 M38 10 l4 2 M8 22 l3 -1 M40 18 l3 1" stroke="#6b5e46" stroke-width="0.6"/>
        ${ground('#6b5a40')}
        <path d="M16 27 V16 Q24 10 32 16 V27z" fill="#2a2018"/>
        <rect x="16" y="15" width="1.6" height="12" fill="${WOOD}"/>
        <rect x="30.4" y="15" width="1.6" height="12" fill="${WOOD}"/>
        <rect x="15" y="14" width="18" height="1.8" fill="${WOOD}" stroke="${WOOD_EDGE}" stroke-width="0.3"/>
        ${chochin(24, 19, 0.5)}
        <path d="M7 10 l2 -1 l1 1.4 l-2 1z M24 6 l2 -1 l1 1.6 l-2 0.8z M40 8 l1.6 -1 l1 1.4 l-1.6 1z" fill="${KIN}" stroke="${KIN_EDGE}" stroke-width="0.3"/>
        <path d="M35 27 q0 -4 1 -5 h8 q1 1 1 5z" fill="${STRAW}" stroke="${STRAW_EDGE}" stroke-width="0.4"/>
        <path d="M37 22 l1.4 -1.6 l1.6 0.6 l1.4 -1 l1.6 1 l0.6 1z" fill="${KIN}" stroke="${KIN_EDGE}" stroke-width="0.3"/>
        ${sparkle(41, 18, 1.4)}${sparkle(9, 7, 1)}${sparkle(27, 3.6, 1)}
    `),
    // 勅使：朱の御殿の前で巻物を広げる使者
    imperial_envoy: svg(`
        ${sky('#e8eef6')}
        <rect x="29" y="10" width="19" height="17" fill="${WASHI}"/>
        <path d="M31 10 V27 M37 10 V27 M43 10 V27" stroke="${SHU}" stroke-width="1.4"/>
        <path d="M30 18 h18" stroke="${SHU}" stroke-width="0.8"/>
        <path d="M26 10.6 Q32 9 34 4 H48 V10.6z" fill="${ROOF}"/>
        <path d="M34 4 H48" stroke="${KIN}" stroke-width="0.6"/>
        ${ground(STONE_LIGHT)}
        <path d="M4 29 h3 M14 30 h4 M26 29 h3" stroke="${STONE}" stroke-width="0.5"/>
        ${robed(13, PURPLE, { hair: eboshi(13) })}
        ${arm(15, 16, 18, 16.4)}
        <rect x="18" y="13" width="9" height="6" fill="${WASHI}" stroke="${STONE_EDGE}" stroke-width="0.3"/>
        <rect x="17.4" y="12.4" width="1.2" height="7.2" rx="0.5" fill="${SUMI}"/>
        <rect x="26.4" y="12.4" width="1.2" height="7.2" rx="0.5" fill="${SUMI}"/>
        <path d="M20 14.6 h4 M20 16 h5 M20 17.4 h3" stroke="${SUMI}" stroke-width="0.35"/>
        <rect x="24" y="16.6" width="1.6" height="1.6" fill="${SHU}"/>
    `),
    // 狐：狐火を従えて座る白い狐
    kitsune: svg(`
        <rect x="0" y="0" width="48" height="32" fill="#1f2a44"/>
        ${stars([[4, 3], [16, 2], [44, 4], [26, 3]])}
        ${ground('#2f4a3a')}
        <path d="M4 27 l1 -2 l1 2 M40 27 l1 -2.4 l1 2.4 M12 27 l0.8 -1.6 l0.8 1.6" stroke="#4f7a5a" stroke-width="0.5" fill="none"/>
        <path d="M26 26 q11 1 11 -9 q0 -5 -3 -6 q1 7 -4 10 q-2 1.4 -5 1.4z" fill="${FOX}" stroke="${FOX_EDGE}" stroke-width="0.4"/>
        <path d="M34 11 q3 1 3 6 q-1 -2 -3 -2.4z" fill="${KIN_LIGHT}"/>
        <path d="M17 27 q-1 -7 2 -12 h5 q4 5 3 12z" fill="${FOX}" stroke="${FOX_EDGE}" stroke-width="0.4"/>
        <path d="M19.6 27 v-4 M24.4 27 v-4" stroke="${FOX_EDGE}" stroke-width="0.4"/>
        <ellipse cx="21" cy="12" rx="3.6" ry="3" fill="${FOX}" stroke="${FOX_EDGE}" stroke-width="0.4"/>
        <path d="M18.8 10 L18.4 5.4 L21 8.8z M22.4 9 L24.6 5.4 L24.2 10.2z" fill="${FOX}" stroke="${FOX_EDGE}" stroke-width="0.4"/>
        <path d="M17.8 12.2 l-4 1.4 l4.4 1.4z" fill="${FOX}" stroke="${FOX_EDGE}" stroke-width="0.4"/>
        <circle cx="13.9" cy="13.6" r="0.4" fill="${SUMI}"/>
        <path d="M19 11.4 l1.6 -0.6 M22.6 11 l1.4 0.6" stroke="${SHU}" stroke-width="0.6"/>
        <path d="M20 9.6 q1 -1 2 0" stroke="${SHU}" stroke-width="0.4" fill="none"/>
        <path d="M18 16 q3 1.4 6 0" stroke="${SHU}" stroke-width="0.8" fill="none"/>
        ${wisp(8, 9)}${wisp(30, 5, 0.8)}${wisp(43, 15, 0.9)}
    `),
    // 駕籠：二人で担いで運ぶ駕籠
    litter: svg(`
        ${sky()}
        ${cloud(38, 5)}
        <path d="M0 20 Q12 14 24 18 Q36 14 48 19 V27 H0z" fill="#a9c99a"/>
        ${pine(46, 20, 0.4)}
        ${ground(SAND)}
        ${person(8, INDIGO, { hair: mage(8) + hachimaki(8) })}
        ${person(40, INDIGO, { hair: mage(40) + hachimaki(40) })}
        <path d="M2 14.4 L46 14.4" stroke="${SUMI}" stroke-width="1.2"/>
        <path d="M18 14.4 V17 M30 14.4 V17" stroke="${SUMI}" stroke-width="0.6"/>
        <path d="M15.4 17 q8.6 -2.6 17.2 0 v1 h-17.2z" fill="${SUMI}"/>
        <rect x="17" y="18" width="14" height="7" fill="${WOOD_LIGHT}" stroke="${WOOD_EDGE}" stroke-width="0.5"/>
        <rect x="19.6" y="19.2" width="8.8" height="4.4" fill="${STRAW}" stroke="${STRAW_EDGE}" stroke-width="0.3"/>
        <path d="M19.6 20.3 h8.8 M19.6 21.4 h8.8 M19.6 22.5 h8.8" stroke="${STRAW_EDGE}" stroke-width="0.25"/>
        <path d="M24 17 v1" stroke="${KIN}" stroke-width="0.8"/>
        ${arm(10, 16, 9, 14.4)}${arm(38, 16, 39, 14.4)}
    `),
    // 札差：米俵と、算盤・大福帳の商人
    rice_broker: svg(`
        ${wall()}
        ${shoji(26, 1, 21, 13)}
        ${tatami()}
        ${tawara(8, 27, 11, 5.4)}${tawara(19, 27, 11, 5.4)}${tawara(13.5, 21.6, 11, 5.4)}${tawara(13.5, 16.2, 9, 4.4)}
        ${robed(34, '#6b4a32', { hair: mage(34) })}
        <rect x="25" y="22" width="11" height="3.4" fill="${WOOD_EDGE}"/>
        ${[26.4, 28, 29.6, 31.2, 32.8, 34.4].map(x => `<circle cx="${x}" cy="23" r="0.5" fill="${WASHI}"/><circle cx="${x}" cy="24.6" r="0.5" fill="${WASHI}"/>`).join('')}
        <path d="M25 23.8 h11" stroke="${WASHI}" stroke-width="0.3"/>
        <rect x="39" y="19" width="7" height="8" fill="${WASHI}" stroke="${WOOD_EDGE}" stroke-width="0.4"/>
        <path d="M39.6 19 v8" stroke="${SUMI}" stroke-width="0.8"/>
        <rect x="42" y="20" width="2" height="5" fill="#fff" stroke="${SUMI}" stroke-width="0.25"/>
        <path d="M43 20.8 v3.4" stroke="${SUMI}" stroke-width="0.35"/>
        ${koban(36.6, 24.6, 0.7)}
    `),
    // 浪人：夕暮れの風の中、深い笠をかぶった侍
    ronin: svg(`
        ${sky(SKY_DUSK)}
        <circle cx="38" cy="16" r="5" fill="#f2a65a"/>
        <path d="M0 22 Q16 18 30 21 Q40 19 48 21 V27 H0z" fill="#b8a07a"/>
        ${ground(GRASS_DARK)}
        <path d="M3 27 q2 -3 5 -4 M8 27 q2 -3 5 -3.6 M34 27 q2 -3 5 -4 M40 27 q2 -3 5 -3.4" stroke="#7aa65a" stroke-width="0.6" fill="none"/>
        ${person(20, '#7a7468', { hair: `<path d="M13.6 11.6 L20 4.6 L26.4 11.6 q-6.4 1.2 -12.8 0z" fill="${STRAW}" stroke="${STRAW_EDGE}" stroke-width="0.4"/><path d="M20 4.6 V12 M16.8 8 L20 12 M23.2 8 L20 12" stroke="${STRAW_EDGE}" stroke-width="0.3"/>` })}
        <rect x="18" y="18" width="2.4" height="2" fill="#5a544a"/>
        <path d="M16.4 21 h7.2" stroke="${SUMI}" stroke-width="0.8"/>
        <path d="M14 22.4 L29 17.6" stroke="${SUMI}" stroke-width="1"/>
        <path d="M15 23.4 L26 20.4" stroke="${SUMI}" stroke-width="0.8"/>
        <circle cx="23.6" cy="19.4" r="0.8" fill="${KIN}"/><circle cx="22" cy="21.2" r="0.7" fill="${KIN}"/>
        <path d="M30 6 q3 -0.6 6 0 M34 9 q3 -0.6 6 0 M4 12 q3 -0.6 6 0" stroke="#fff" stroke-width="0.4" fill="none" opacity="0.8"/>
        ${petals([[33, 8], [40, 11], [8, 15]])}
    `),
    // 狸：頭に葉を乗せ、煙とともに化ける狸
    tanuki: svg(`
        <rect x="0" y="0" width="48" height="32" fill="#2c3a4f"/>
        <circle cx="39" cy="7" r="4" fill="#f3eecb"/>
        ${stars([[6, 3], [20, 2], [30, 6]])}
        ${ground('#3d5a3a')}
        ${pine(44, 27, 0.6)}
        <g fill="#fff" opacity="0.75">
            <circle cx="8" cy="16" r="3"/><circle cx="11" cy="12.6" r="2.4"/><circle cx="6" cy="12" r="2"/><circle cx="10.4" cy="19" r="2.2"/>
        </g>
        <path d="M27 24 q6 1 7 -4 q-2 1 -4 0 q-1 2 -3 4z" fill="${TANUKI}"/>
        <path d="M30.4 21.6 l1.4 -0.6 M32.6 20.6 l0.8 -0.6" stroke="${TANUKI_DARK}" stroke-width="0.8"/>
        <ellipse cx="22" cy="20" rx="6" ry="7" fill="${TANUKI}"/>
        <ellipse cx="22" cy="21.6" rx="4" ry="4.6" fill="${TANUKI_LIGHT}"/>
        <path d="M18 27 v-1.6 M26 27 v-1.6" stroke="${TANUKI_DARK}" stroke-width="2"/>
        <circle cx="18.4" cy="7.6" r="1.4" fill="${TANUKI_DARK}"/><circle cx="25.6" cy="7.6" r="1.4" fill="${TANUKI_DARK}"/>
        <circle cx="22" cy="10.6" r="4" fill="${TANUKI}"/>
        <ellipse cx="20.4" cy="10.6" rx="1.5" ry="1.1" fill="${TANUKI_DARK}"/><ellipse cx="23.6" cy="10.6" rx="1.5" ry="1.1" fill="${TANUKI_DARK}"/>
        <circle cx="20.4" cy="10.4" r="0.4" fill="#fff"/><circle cx="23.6" cy="10.4" r="0.4" fill="#fff"/>
        <ellipse cx="22" cy="12.6" rx="1.4" ry="1" fill="${TANUKI_LIGHT}"/>
        <circle cx="22" cy="12.2" r="0.45" fill="${SUMI}"/>
        <path d="M22 6.8 q-3 -1.6 -1 -4.4 q3 1 1 4.4z" fill="${GRASS}" stroke="${GRASS_DARK}" stroke-width="0.3"/>
        <path d="M22 6.8 q-0.6 -2 -0.6 -3.4" stroke="${GRASS_DARK}" stroke-width="0.3" fill="none"/>
        ${arm(17, 17, 15, 20, TANUKI)}${arm(27, 17, 29, 20, TANUKI)}
    `),
    // 茶屋：朱の野点傘と縁台、湯呑みと団子
    tea_house: svg(`
        ${sky()}
        <rect x="24" y="4" width="24" height="23" fill="${WOOD_LIGHT}"/>
        <path d="M22 5 L26 1 H48 V5z" fill="${ROOF}"/>
        <rect x="30" y="7" width="14" height="7" fill="${INDIGO}"/>
        <path d="M33.5 7 v7 M37 7 v7 M40.5 7 v7" stroke="${INDIGO_DARK}" stroke-width="0.4"/>
        <circle cx="37" cy="10.4" r="1.8" fill="none" stroke="${WASHI}" stroke-width="0.6"/>
        <rect x="30" y="14" width="14" height="13" fill="#4a3220"/>
        ${ground(SAND)}
        <path d="M12 9 V27" stroke="${WOOD_EDGE}" stroke-width="0.8"/>
        <path d="M1 10.6 Q12 1 23 10.6z" fill="${SHU}"/>
        <path d="M12 3.4 L4 10 M12 3.4 L8 10.4 M12 3.4 L16 10.4 M12 3.4 L20 10" stroke="${SHU_DARK}" stroke-width="0.3"/>
        <rect x="3" y="20" width="22" height="2" fill="${SHU}"/>
        <path d="M5 22 V27 M23 22 V27" stroke="${WOOD_EDGE}" stroke-width="1"/>
        <path d="M7.6 16.6 h3.4 l-0.5 3.4 h-2.4z" fill="${WASHI}" stroke="${STONE_EDGE}" stroke-width="0.3"/>
        <ellipse cx="9.3" cy="16.7" rx="1.6" ry="0.4" fill="#7da34a"/>
        <path d="M8.6 15.6 q0.6 -1 0 -2 M10 15.4 q0.6 -1 0 -2" stroke="#fff" stroke-width="0.3" fill="none"/>
        <ellipse cx="17" cy="19.6" rx="4" ry="0.6" fill="${WASHI}" stroke="${STONE_EDGE}" stroke-width="0.3"/>
        <path d="M14.4 19 L20 13.6" stroke="#c9a86a" stroke-width="0.4"/>
        <circle cx="16" cy="17.4" r="1.1" fill="#7da34a"/><circle cx="17.4" cy="16" r="1.1" fill="#fff" stroke="${STONE_LIGHT}" stroke-width="0.2"/><circle cx="18.8" cy="14.6" r="1.1" fill="${SAKURA}"/>
    `),

    // ===== コスト6 =====
    // 侍：家紋の幕の前に飾られた鎧兜
    samurai: svg(`
        <rect x="0" y="0" width="48" height="27" fill="${WASHI}"/>
        <rect x="0" y="5" width="48" height="5" fill="${SUMI}"/>
        <rect x="0" y="17" width="48" height="5" fill="${SUMI}"/>
        ${mon(7, 13.5, 3.2)}${mon(41, 13.5, 3.2)}
        ${ground(WOOD_EDGE)}
        <path d="M12 16 h6 v8 h-7z M36 16 h-6 v8 h7z" fill="${INDIGO}" stroke="${KIN_EDGE}" stroke-width="0.3"/>
        <path d="M11.4 18.6 h6.6 M11.2 21.2 h6.8 M30 18.6 h6.6 M30 21.2 h6.8" stroke="${SHU}" stroke-width="0.6"/>
        <path d="M18 16 h12 l1 8 h-14z" fill="${SUMI}"/>
        <path d="M17.6 18 h12.8 M17.4 20 h13.2 M17.2 22 h13.6" stroke="${SHU}" stroke-width="0.6"/>
        <path d="M16.6 24 h14.8 v3 h-14.8z" fill="${INDIGO}"/>
        <path d="M19.6 24 v3 M22.6 24 v3 M25.6 24 v3 M28.6 24 v3" stroke="${SHU}" stroke-width="0.4"/>
        <path d="M14.6 12 h18.8 l2 4 h-22.8z" fill="${INDIGO}" stroke="${KIN}" stroke-width="0.4"/>
        <path d="M14 14 h20" stroke="${SHU}" stroke-width="0.5"/>
        <path d="M17.4 12 Q24 2.6 30.6 12z" fill="${ROOF}" stroke="${KIN}" stroke-width="0.5"/>
        <path d="M20 11.6 Q21 6 24 4.8 M28 11.6 Q27 6 24 4.8" stroke="${KIN_EDGE}" stroke-width="0.3" fill="none"/>
        <path d="M21 13.2 h6 v3 q-3 1.4 -6 0z" fill="${SHU_DARK}"/>
        <path d="M22.4 14.6 q1.6 0.8 3.2 0" stroke="${WASHI}" stroke-width="0.4" fill="none"/>
        <path d="M22.6 8.4 q-6 -2 -7 -7 q3.6 3.4 8 4.6z M25.4 8.4 q6 -2 7 -7 q-3.6 3.4 -8 4.6z" fill="${KIN}" stroke="${KIN_EDGE}" stroke-width="0.3"/>
        <circle cx="24" cy="7.6" r="1.4" fill="${KIN}" stroke="${KIN_EDGE}" stroke-width="0.3"/>
    `),

    // ===== 財宝 =====
    // 米：日の丸を背にした米俵と稲穂
    rice: svg(`
        <rect x="0" y="0" width="48" height="32" fill="#f6e7b8"/>
        <circle cx="24" cy="15" r="11" fill="${SHU}" opacity="0.85"/>
        ${riceEar(10, 30, 18, 1)}${riceEar(13, 30, 15, 1)}${riceEar(38, 30, 18, -1)}${riceEar(35, 30, 15, -1)}
        ${tawara(24, 28, 18, 9)}
        <path d="M15 22 h18" stroke="${STRAW_EDGE}" stroke-width="0.4"/>
        ${[[6, 28], [42, 27], [17, 30], [31, 30.4]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="0.5" ry="0.8" fill="#fff"/>`).join('')}
        ${sparkle(38, 6, 1.4)}${sparkle(9, 9, 1)}
    `),

    // ===== 負債のコスト =====
    // 山の社：石段の上、山の頂の神社
    mountain_shrine: svg(`
        ${sky()}
        ${cloud(8, 6)}${cloud(40, 9, 0.8)}
        <path d="M0 27 L20 9 L28 9 L48 27z" fill="${MATSU}"/>
        <path d="M6 27 L20 14 M42 27 L28 14" stroke="${MATSU_DARK}" stroke-width="0.6"/>
        <path d="M22 27 L23.2 9 h1.6 L26 27z" fill="${STONE_LIGHT}"/>
        ${[11, 13, 15, 17, 19, 21, 23, 25].map(y => `<path d="M${22.9 - (y - 9) * 0.06} ${y} h${2.2 + (y - 9) * 0.12}" stroke="${STONE_EDGE}" stroke-width="0.3"/>`).join('')}
        ${hokora(24, 9.4, 0.7)}
        ${pine(9, 27, 0.6)}${pine(39, 27, 0.6)}${pine(15, 21, 0.4)}${pine(33, 21, 0.4)}
        ${ground(GRASS_DARK)}
        ${torii(24, 29, 9, 8)}
        ${cloud(12, 17, 0.9)}${cloud(37, 16, 0.7)}
    `),
    // 大名：家紋の幟と天守の城
    daimyo: svg(`
        ${sky()}
        ${cloud(20, 6)}
        ${ground(GRASS)}
        <path d="M22 27 L26 18 H44 L47 27z" fill="${STONE}" stroke="${STONE_EDGE}" stroke-width="0.4"/>
        <path d="M25 22 h20 M24 25 h22 M30 18 v4 M38 18 v4 M34 22 v3 M42 22 v3" stroke="${STONE_EDGE}" stroke-width="0.3"/>
        <rect x="28" y="13" width="14" height="5" fill="#fff" stroke="${STONE_EDGE}" stroke-width="0.3"/>
        <path d="M25.6 13.4 L28.6 10.4 H41.4 L44.4 13.4z" fill="${ROOF}"/>
        <rect x="30" y="7" width="10" height="3.4" fill="#fff" stroke="${STONE_EDGE}" stroke-width="0.3"/>
        <path d="M27.8 7.4 L30.6 4.8 H39.4 L42.2 7.4z" fill="${ROOF}"/>
        <rect x="32" y="2.6" width="6" height="2.2" fill="#fff"/>
        <path d="M30.6 3 L32.6 1 H37.4 L39.4 3z" fill="${ROOF}"/>
        <circle cx="32.6" cy="0.9" r="0.5" fill="${KIN}"/><circle cx="37.4" cy="0.9" r="0.5" fill="${KIN}"/>
        <path d="M31 15 h1.4 M34.4 15 h1.4 M37.8 15 h1.4 M32.6 8.4 h1.2 M36.2 8.4 h1.2" stroke="${SUMI}" stroke-width="1"/>
        <path d="M8 2 V27" stroke="${WOOD_EDGE}" stroke-width="0.9"/>
        <path d="M8 3 h10" stroke="${WOOD_EDGE}" stroke-width="0.6"/>
        <rect x="8.6" y="3" width="9" height="19" fill="${WASHI}" stroke="${STONE_EDGE}" stroke-width="0.3"/>
        <rect x="8.6" y="3" width="9" height="2.4" fill="${SHU}"/>
        ${mon(13.1, 11, 3)}
        <rect x="8.6" y="18" width="9" height="2.4" fill="${SHU}"/>
    `),
    // 絵師：金屏風に松と山を描く絵師
    artist: svg(`
        ${wall()}
        ${tatami()}
        ${[0, 1, 2, 3].map(i => `<rect x="${5 + i * 9}" y="3" width="9" height="21" fill="${i % 2 ? KIN_SHADE : KIN_LIGHT}" stroke="${SUMI}" stroke-width="0.5"/>`).join('')}
        <path d="M5 18 Q12 8 18 14 Q24 6 32 15 V24 H5z" fill="#6f7a6a" opacity="0.7"/>
        <rect x="7" y="6" width="12" height="2.4" rx="1.2" fill="${KIN}"/>
        <rect x="20" y="17" width="10" height="2.4" rx="1.2" fill="${KIN}"/>
        <path d="M10 24 q1 -6 -1 -10 q2 -3 6 -3" stroke="${SUMI}" stroke-width="1" fill="none"/>
        <ellipse cx="13" cy="11.4" rx="3.4" ry="1.3" fill="${MATSU}"/>
        <ellipse cx="9" cy="14.6" rx="3" ry="1.2" fill="${MATSU}"/>
        <ellipse cx="17" cy="9" rx="2.6" ry="1.1" fill="${MATSU_DARK}"/>
        <path d="M26 12 q2 -1 4 0.4" stroke="${SUMI}" stroke-width="0.5" fill="none"/>
        ${person(41, '#7a5a8a', { hair: mage(41), scale: 0.85 })}
        ${arm(38.4, 16.6, 34, 13.6)}
        <path d="M34.6 14 L30 11.6" stroke="#c9a86a" stroke-width="0.9" stroke-linecap="round"/>
        <path d="M30.6 11.9 L28.4 10.8" stroke="${SUMI}" stroke-width="1.1" stroke-linecap="round"/>
        <ellipse cx="33" cy="26" rx="2.6" ry="1" fill="${SUMI}"/>
        <rect x="30.4" y="24.6" width="5.2" height="1.4" fill="#4a4540"/>
    `)
};
