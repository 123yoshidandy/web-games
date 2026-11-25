/**
 * 絵のデータ（すべて自作の SVG。公式の画像は使っていない）
 * CHARACTER_ART: 役割の肖像（viewBox 0 0 60 80、背景は透明）
 * DISTRICT_ART: 地区の建物（viewBox 0 0 60 40、背景は透明）
 * 外側の <svg>・<symbol> は呼ぶ側で包む
 */

const SKIN = '#f1c9a5';
const SKIN_LINE = '#b98a66';

// 顔（円と目の点）
const face = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="9" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width="1"/>
    <circle cx="${cx - 3.2}" cy="${cy - .5}" r="1.1" fill="#3a2a20"/><circle cx="${cx + 3.2}" cy="${cy - .5}" r="1.1" fill="#3a2a20"/>`;
// 手
const hand = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="3" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width="1"/>`;
// 体（肩から下）
const body = (fill, line) => `<path d="M9 80c0-19 9-31 21-31s21 12 21 31z" fill="${fill}" stroke="${line}" stroke-width="1"/>`;

export const CHARACTER_ART = {
    assassin: `
        ${body('#2b2d33', '#16171b')}
        <path d="M15 52c-3-25 6-40 15-42 9 2 18 17 15 42-4-4-9-6-15-6s-11 2-15 6z" fill="#3e414a"/>
        ${face(30, 37)}
        <path d="M21 38.5h18v3c0 5-4 8-9 8s-9-3-9-8z" fill="#1c1d22"/>
        <path d="M24.5 33.5l4 1.2M35.5 33.5l-4 1.2" stroke="#1c1d22" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M46 52l2.5-20 2.5 20z" fill="#d6dde3" stroke="#7f8a94" stroke-width="1"/>
        <path d="M43 52.5h11" stroke="#8a6a3a" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M48.5 54v6" stroke="#5a3f28" stroke-width="3" stroke-linecap="round"/>
        ${hand(48.5, 59)}`,
    thief: `
        ${body('#7a5233', '#4a3220')}
        <path d="M13 67h34" stroke="#4a3220" stroke-width="3"/>
        <path d="M16 48c-3-21 4-33 14-34 10 1 17 13 14 34-3-5-8-8-14-8s-11 3-14 8z" fill="#5e3f26"/>
        ${face(30, 37)}
        <path d="M21.5 36.5h17" stroke="#2a2422" stroke-width="3.6" stroke-linecap="round"/>
        <circle cx="26.8" cy="36.5" r=".9" fill="#f5f0e0"/><circle cx="33.2" cy="36.5" r=".9" fill="#f5f0e0"/>
        <path d="M26 41.5c2 2 6 2 8 0" fill="none" stroke="#8a5a3a" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M41 60c-6 3-7 13 0 15h8c7-2 6-12 0-15z" fill="#c9a35a" stroke="#7a5a2a" stroke-width="1"/>
        <path d="M41.5 59.5l3.5 2 3.5-2" fill="none" stroke="#7a5a2a" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="45" cy="68.5" r="2.6" fill="#e3b53a" stroke="#9a7420" stroke-width=".8"/>
        ${hand(45, 58)}
        <circle cx="16" cy="76" r="2" fill="#e3b53a" stroke="#9a7420" stroke-width=".8"/>`,
    magician: `
        ${body('#5d3f8f', '#3a2760')}
        <circle cx="19" cy="66" r="1" fill="#f4d061"/><circle cx="26" cy="74" r="1" fill="#f4d061"/><circle cx="39" cy="70" r="1" fill="#f4d061"/>
        ${face(30, 40)}
        <path d="M22 44c1 10 5 15 8 17 3-2 7-7 8-17-2 2-5 3-8 3s-6-1-8-3z" fill="#ece8e0" stroke="#b8b2a6" stroke-width=".8"/>
        <path d="M19 33L33 3l8 30z" fill="#4a2f78" stroke="#2e1c50" stroke-width="1" stroke-linejoin="round"/>
        <path d="M13 33h34" stroke="#2e1c50" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M31 17l1 2.2 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="#f4d061"/>
        <path d="M51 30v48" stroke="#7a5233" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="51" cy="26" r="4.2" fill="#a9dcf2" stroke="#4a8aaa" stroke-width="1"/>
        ${hand(51, 56)}`,
    king: `
        ${body('#e3b53a', '#a67a14')}
        <path d="M30 60v20" stroke="#a67a14" stroke-width="1.2"/>
        <path d="M13 55c4 7 10 9 17 9s13-2 17-9l-3-5c-4 4-9 6-14 6s-10-2-14-6z" fill="#f7f3ea" stroke="#c9c0ae" stroke-width=".8"/>
        <circle cx="19" cy="57" r=".9" fill="#2a2422"/><circle cx="30" cy="61" r=".9" fill="#2a2422"/><circle cx="41" cy="57" r=".9" fill="#2a2422"/>
        ${face(30, 38)}
        <path d="M22 42c2 8 5 10 8 10s6-2 8-10c-2 2-5 3-8 3s-6-1-8-3z" fill="#8a5a32"/>
        <path d="M20 31l1-11 5 5 4-8 4 8 5-5 1 11z" fill="#f4d061" stroke="#a67a14" stroke-width="1" stroke-linejoin="round"/>
        <circle cx="30" cy="27" r="1.6" fill="#c8433a"/><circle cx="24" cy="28" r="1.1" fill="#3d7cc9"/><circle cx="36" cy="28" r="1.1" fill="#3d7cc9"/>
        <path d="M48 46v30" stroke="#a67a14" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="48" cy="44" r="3" fill="#f4d061" stroke="#a67a14" stroke-width="1"/>
        ${hand(48, 60)}`,
    bishop: `
        ${body('#3d7cc9', '#24548f')}
        <path d="M25 51v29M35 51v29" stroke="#f4d061" stroke-width="3"/>
        <path d="M25 68v6M22 71h6M35 68v6M32 71h6" stroke="#a67a14" stroke-width="1.2"/>
        ${face(30, 40)}
        <path d="M21 33c0-10 4-18 9-23 5 5 9 13 9 23z" fill="#f2efe6" stroke="#9a9384" stroke-width="1" stroke-linejoin="round"/>
        <path d="M21 31.5h18" stroke="#3d7cc9" stroke-width="2.4"/>
        <path d="M30 15v12M26 19.5h8" stroke="#e3b53a" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M11 78V30" stroke="#c9a040" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M11 30c0-7 9-7 9 0 0 3-3.5 3.5-3.5 1" fill="none" stroke="#c9a040" stroke-width="2.4" stroke-linecap="round"/>
        ${hand(11, 56)}`,
    merchant: `
        ${body('#3f9a55', '#276b38')}
        <path d="M30 52v28" stroke="#276b38" stroke-width="1.2"/>
        <circle cx="30" cy="60" r="1.2" fill="#e3b53a"/><circle cx="30" cy="68" r="1.2" fill="#e3b53a"/>
        ${face(30, 39)}
        <path d="M25 43c2-1.5 3.5-1.5 5 0 1.5-1.5 3-1.5 5 0" fill="none" stroke="#6b4a32" stroke-width="1.6" stroke-linecap="round"/>
        <ellipse cx="30" cy="31" rx="14" ry="3" fill="#2c6e3d" stroke="#1d4d29" stroke-width="1"/>
        <path d="M21 31c0-8 4-12 9-12s9 4 9 12z" fill="#2c6e3d" stroke="#1d4d29" stroke-width="1"/>
        <path d="M21 29h18" stroke="#e3b53a" stroke-width="1.8"/>
        <path d="M38 23c3-7 8-8 11-7-3 2-6 5-9 9z" fill="#e3b53a" stroke="#9a7420" stroke-width=".8"/>
        <path d="M38 54h16M46 50v20M42 70h8" stroke="#9a7420" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M38 54l-3 7M38 54l3 7M54 54l-3 7M54 54l3 7" stroke="#9a7420" stroke-width=".8"/>
        <path d="M34 61h8a4 3 0 0 1-8 0zM50 61h8a4 3 0 0 1-8 0z" fill="#e3b53a" stroke="#9a7420" stroke-width=".8"/>
        <ellipse cx="15" cy="76" rx="5" ry="1.8" fill="#e3b53a" stroke="#9a7420" stroke-width=".8"/>
        <ellipse cx="15" cy="73" rx="5" ry="1.8" fill="#e3b53a" stroke="#9a7420" stroke-width=".8"/>
        <ellipse cx="15" cy="70" rx="5" ry="1.8" fill="#f4d061" stroke="#9a7420" stroke-width=".8"/>`,
    architect: `
        ${body('#b8743a', '#7a4a20')}
        ${face(30, 39)}
        <path d="M26 43.5c2 1.5 6 1.5 8 0" fill="none" stroke="#8a5a3a" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M19 32c0-8 5-12 11-12s12 3 13 9c-7 2-17 3-24 3z" fill="#5a3a20" stroke="#3a2412" stroke-width="1"/>
        <path d="M42 29l4 1" stroke="#3a2412" stroke-width="2" stroke-linecap="round"/>
        <g transform="rotate(-10 19 66)">
            <rect x="7" y="57" width="24" height="18" rx="1" fill="#f4ead2" stroke="#a88b56" stroke-width="1"/>
            <path d="M11 71V63l7-4 7 4v8zM11 63h14M18 71v-5h3v5" fill="none" stroke="#4a7fb5" stroke-width="1"/>
            <path d="M7 57c-2 0-2 18 0 18M31 57c2 0 2 18 0 18" fill="none" stroke="#a88b56" stroke-width="1.4"/>
        </g>
        ${hand(20, 76)}
        <path d="M46 47l-6 24M46 47l6 24" stroke="#8b96a0" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M42.5 61h7" stroke="#8b96a0" stroke-width="1.2"/>
        <circle cx="46" cy="46" r="2.4" fill="#c9a040" stroke="#8a6a1a" stroke-width=".8"/>
        ${hand(46, 50)}`,
    warlord: `
        ${body('#c8433a', '#86261f')}
        <path d="M11 58c2-6 6-9 10-9l2 6c-4 0-8 2-12 3zM49 58c-2-6-6-9-10-9l-2 6c4 0 8 2 12 3z" fill="#9aa4ad" stroke="#5f6870" stroke-width="1"/>
        <path d="M22 56h16v14H22z" fill="#9aa4ad" stroke="#5f6870" stroke-width="1"/>
        ${face(30, 40)}
        <path d="M22 44c2 7 5 9 8 9s6-2 8-9c-2 2-5 3-8 3s-6-1-8-3z" fill="#4a3020"/>
        <path d="M19 38c0-11 5-17 11-17s11 6 11 17h-3v-5c-2-1-5-2-8-2s-6 1-8 2v5z" fill="#9aa4ad" stroke="#5f6870" stroke-width="1" stroke-linejoin="round"/>
        <path d="M30 31v8" stroke="#5f6870" stroke-width="2" stroke-linecap="round"/>
        <path d="M30 21c1-7 7-11 13-10-4 2-8 6-10 11z" fill="#c8433a" stroke="#86261f" stroke-width=".8"/>
        <path d="M47.5 60V27l1.5-3 1.5 3v33z" fill="#d6dde3" stroke="#7f8a94" stroke-width="1"/>
        <path d="M43 60.5h12" stroke="#7a5a2a" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M49 62v7" stroke="#4a3220" stroke-width="3" stroke-linecap="round"/>
        ${hand(49, 65)}`
};

// 地区の色
const Y = '#e3b53a', B = '#3d7cc9', G = '#3f9a55', R = '#c8433a', P = '#8a55b0';
// 壁・線
const STONE = '#ddd3bf', STONE2 = '#bdb19a', WOOD = '#b98252', DARK = '#3b3240';
const L = 'stroke="#4a3b2e" stroke-width="1.2" stroke-linejoin="round"';
const LT = 'stroke="#4a3b2e" stroke-width="1" stroke-linejoin="round"';

// 地面の線
const ground = (x1 = 3, x2 = 57) => `<path d="M${x1} 38.5H${x2}" stroke="#8f7f63" stroke-width="1.6" stroke-linecap="round"/>`;
// 胸壁のある塔・壁（x から幅 w、上端 top、下端 bottom）
const crenel = (x, top, w, fill, m = Math.max(2, Math.round(w / 5)), bottom = 38) => {
    const s = (w / (2 * m - 1)).toFixed(2);
    let d = `M${x} ${bottom}V${top}`;
    for (let i = 0; i < 2 * m - 1; i++) {
        d += `h${s}`;
        if (i < 2 * m - 2) d += i % 2 === 0 ? 'v3' : 'v-3';
    }
    return `<path d="${d}V${bottom}z" fill="${fill}" ${L}/>`;
};
// 窓（暗い四角に十字の桟）
const win = (x, y, w = 5, h = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${DARK}"/><path d="M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}" stroke="${STONE}" stroke-width=".8"/>`;
// 上が丸い戸口
const door = (x, w, top, fill = DARK) => `<path d="M${x} 38V${top + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V38z" fill="${fill}" ${LT}/>`;
// 旗（竿の根元 x,y、高さ h、色）
const flag = (x, y, h, fill) => `<path d="M${x} ${y}v-${h}" stroke="#4a3b2e" stroke-width="1.2" stroke-linecap="round"/><path d="M${x} ${y - h}l8 2.5-8 2.5z" fill="${fill}" ${LT}/>`;
// 垂れ幕
const banner = (x, y, w, h, fill) => `<path d="M${x} ${y}h${w}v${h}l-${w / 2}-3-${w / 2} 3z" fill="${fill}" ${LT}/>`;
// 星
const star = (x, y, r, fill) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
        const a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * .45 : r;
        p.push(`${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`);
    }
    return `<path d="M${p.join('L')}z" fill="${fill}"/>`;
};
// 波
const waves = (y, fill = '#7fb2d9') => `<path d="M2 ${y}q3.5-2 7 0t7 0 7 0 7 0 7 0 7 0 7 0 7 0V40H2z" fill="${fill}"/>
    <path d="M6 ${y + 3}q2-1.5 4 0M24 ${y + 4}q2-1.5 4 0M44 ${y + 3}q2-1.5 4 0" fill="none" stroke="#f2f6fa" stroke-width="1" stroke-linecap="round"/>`;

export const DISTRICT_ART = {
    // 黄（貴族）
    manor: `
        ${ground()}
        <rect x="38" y="7" width="5" height="10" fill="${STONE2}" ${L}/>
        <rect x="13" y="20" width="34" height="18" fill="${STONE}" ${L}/>
        <path d="M9 21L30 7l21 14z" fill="${Y}" ${L}/>
        ${win(16, 25)}${win(39, 25)}
        ${door(27, 6, 28, WOOD)}
        <circle cx="30" cy="15" r="2.2" fill="${DARK}"/>`,
    castle: `
        ${ground()}
        ${crenel(17, 18, 26, STONE)}
        <rect x="8" y="14" width="10" height="24" fill="${STONE}" ${L}/>
        <rect x="42" y="14" width="10" height="24" fill="${STONE}" ${L}/>
        <path d="M6 15l7-11 7 11z" fill="${Y}" ${L}/>
        <path d="M40 15l7-11 7 11z" fill="${Y}" ${L}/>
        ${flag(13, 4, 4, Y)}${flag(47, 4, 4, Y)}
        <path d="M11 21v4M15 21v4M45 21v4M49 21v4" stroke="${DARK}" stroke-width="1.6"/>
        ${door(24, 12, 25)}
        <path d="M17 28h26" stroke="${Y}" stroke-width="2"/>`,
    palace: `
        ${ground()}
        <rect x="4" y="23" width="52" height="15" fill="${STONE}" ${L}/>
        <path d="M2 24l6-5h12l2 5zM58 24l-6-5H40l-2 5z" fill="${Y}" ${L}/>
        <rect x="20" y="17" width="20" height="21" fill="${STONE}" ${L}/>
        <path d="M20 17a10 10 0 0 1 20 0z" fill="${Y}" ${L}/>
        <path d="M30 7V3" stroke="#4a3b2e" stroke-width="1.4"/><circle cx="30" cy="2.6" r="1.6" fill="${Y}" ${LT}/>
        <path d="M23 21v17M27 21v17M33 21v17M37 21v17" stroke="${STONE2}" stroke-width="1.6"/>
        ${door(27, 6, 29)}
        ${win(8, 27, 4, 5)}${win(14, 27, 4, 5)}${win(42, 27, 4, 5)}${win(48, 27, 4, 5)}`,
    // 青（宗教）
    temple: `
        ${ground()}
        <rect x="7" y="34" width="46" height="4" fill="${STONE2}" ${L}/>
        <rect x="9" y="31" width="42" height="3" fill="${STONE}" ${L}/>
        <path d="M12 21h4v10h-4zM20 21h4v10h-4zM28 21h4v10h-4zM36 21h4v10h-4zM44 21h4v10h-4z" fill="${STONE}" ${L}/>
        <rect x="9" y="18" width="42" height="3" fill="${STONE}" ${L}/>
        <path d="M7 18L30 6l23 12z" fill="${B}" ${L}/>
        <circle cx="30" cy="13.5" r="2" fill="#f2efe6"/>`,
    church: `
        ${ground()}
        <rect x="8" y="21" width="28" height="17" fill="${STONE}" ${L}/>
        <path d="M6 22l16-10 16 10z" fill="${B}" ${L}/>
        <circle cx="21" cy="27" r="3" fill="#f2d98a" ${LT}/>
        <path d="M14 38v-5M28 38v-5" stroke="${DARK}" stroke-width="2.4"/>
        <rect x="36" y="15" width="13" height="23" fill="${STONE}" ${L}/>
        <path d="M34.5 16L42.5 4l8 12z" fill="${B}" ${L}/>
        <path d="M42.5 4V0.5M40.8 1.8h3.4" stroke="#c9a040" stroke-width="1.2"/>
        ${door(39.5, 6, 29)}
        <path d="M42.5 19v4" stroke="${DARK}" stroke-width="1.6"/>`,
    monastery: `
        ${ground()}
        <rect x="4" y="22" width="40" height="16" fill="${STONE}" ${L}/>
        <path d="M2 23l6-6h32l6 6z" fill="${B}" ${L}/>
        <path d="M7 38v-7a3 3 0 0 1 6 0v7zM16 38v-7a3 3 0 0 1 6 0v7zM25 38v-7a3 3 0 0 1 6 0v7zM34 38v-7a3 3 0 0 1 6 0v7z" fill="${DARK}"/>
        <rect x="44" y="12" width="12" height="26" fill="${STONE}" ${L}/>
        <path d="M42.5 13L50 5l7.5 8z" fill="${B}" ${L}/>
        <path d="M47 23v-5a3 3 0 0 1 6 0v5z" fill="${DARK}"/>
        <path d="M48.2 22.5a1.8 2.2 0 0 1 3.6 0z" fill="#e3b53a"/>
        <path d="M44 28h12" stroke="${STONE2}" stroke-width="1"/>`,
    cathedral: `
        ${ground()}
        <rect x="19" y="16" width="22" height="22" fill="${STONE}" ${L}/>
        <path d="M18 17l12-9 12 9z" fill="${B}" ${L}/>
        <rect x="8" y="12" width="11" height="26" fill="${STONE}" ${L}/>
        <rect x="41" y="12" width="11" height="26" fill="${STONE}" ${L}/>
        <path d="M7 13l6.5-12 6.5 12zM40 13l6.5-12 6.5 12z" fill="${B}" ${L}/>
        <circle cx="30" cy="22" r="4" fill="#f2d98a" ${LT}/>
        <path d="M30 18v8M26 22h8M27.2 19.2l5.6 5.6M32.8 19.2l-5.6 5.6" stroke="${B}" stroke-width=".8"/>
        <path d="M25 38v-6l5-5 5 5v6z" fill="${DARK}" ${LT}/>
        <path d="M13.5 18v5M46.5 18v5M13.5 28v4M46.5 28v4" stroke="${DARK}" stroke-width="1.8"/>`,
    // 緑（商業）
    tavern: `
        ${ground()}
        <rect x="8" y="19" width="30" height="19" fill="${WOOD}" ${L}/>
        <path d="M8 26h30M16 19v19M30 19v19M16 26l-8 12M30 26l8 12" stroke="#6e4a2a" stroke-width="1"/>
        <path d="M5 20L23 7l18 13z" fill="${G}" ${L}/>
        ${win(19, 28, 5, 5)}
        <path d="M38 17h13" stroke="#4a3b2e" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M42 17v3M49 17v3" stroke="#4a3b2e" stroke-width="1"/>
        <rect x="40" y="20" width="12" height="10" rx="1" fill="#f4ead2" ${L}/>
        <path d="M43 23h5v5h-5z" fill="#e3b53a" ${LT}/>
        <path d="M48 24h1.5v3H48" fill="none" stroke="#4a3b2e" stroke-width="1"/>
        <path d="M42.6 23.2a1.4 1.4 0 0 1 2.4-1 1.4 1.4 0 0 1 2.4 0 1.4 1.4 0 0 1 1 1z" fill="#fff" ${LT}/>
        <path d="M44 38v-7h10v7z" fill="#8a5a32" ${L}/>
        <path d="M44 33h10M44 36h10" stroke="#4a3b2e" stroke-width=".8"/>`,
    market: `
        ${ground()}
        <path d="M7 24v14M27 24v14M33 24v14M53 24v14" stroke="#6e4a2a" stroke-width="1.6"/>
        <path d="M4 17h26l-2 7H6z" fill="#f4ead2" ${L}/>
        <path d="M4 17h5.2l-.4 7H6zM14.4 17h5.2l-.4 7h-4.4zM24.8 17H30l-2 7h-3.6z" fill="${G}"/>
        <path d="M4 17h26l-2 7H6z" fill="none" ${L}/>
        <path d="M30 17h26l-2 7H32z" fill="${G}" ${L}/>
        <path d="M35.2 17h5.2l-.4 7h-4.4zM45.6 17h5.2l-.4 7h-4.4z" fill="#f4ead2"/>
        <path d="M30 17h26l-2 7H32z" fill="none" ${L}/>
        <rect x="8" y="30" width="18" height="8" fill="${WOOD}" ${L}/>
        <rect x="34" y="30" width="18" height="8" fill="${WOOD}" ${L}/>
        <circle cx="12" cy="28.5" r="2" fill="${R}"/><circle cx="16.5" cy="28.5" r="2" fill="#e88b2e"/><circle cx="21" cy="28.5" r="2" fill="${R}"/>
        <circle cx="38" cy="28.5" r="2" fill="${Y}"/><circle cx="42.5" cy="28.5" r="2" fill="#7cbf4a"/><circle cx="47" cy="28.5" r="2" fill="${Y}"/>`,
    tradingPost: `
        ${ground()}
        <rect x="6" y="17" width="30" height="21" fill="${STONE}" ${L}/>
        <path d="M3 18l18-10 18 10z" fill="${G}" ${L}/>
        <rect x="17" y="13" width="8" height="5" fill="${DARK}"/>
        <rect x="14" y="25" width="14" height="13" fill="${WOOD}" ${L}/>
        <path d="M14 25l14 13M28 25L14 38" stroke="#6e4a2a" stroke-width="1"/>
        <path d="M21 10h27" stroke="#6e4a2a" stroke-width="2" stroke-linecap="round"/>
        <path d="M46 10v8" stroke="#4a3b2e" stroke-width="1"/>
        <rect x="42" y="18" width="8" height="7" fill="${WOOD}" ${L}/>
        <path d="M42 18l8 7M50 18l-8 7" stroke="#6e4a2a" stroke-width=".8"/>
        <rect x="40" y="30" width="9" height="8" fill="${WOOD}" ${L}/>
        <path d="M40 30l9 8M49 30l-9 8" stroke="#6e4a2a" stroke-width=".8"/>
        <path d="M50 38v-8c0-1 6-1 6 0v8z" fill="#8a5a32" ${L}/>
        <path d="M50 34h6" stroke="${G}" stroke-width="1.4"/>`,
    docks: `
        ${waves(31)}
        <path d="M8 28v11M18 28v11M28 28v11" stroke="#6e4a2a" stroke-width="2"/>
        <rect x="3" y="25" width="31" height="3.5" fill="${WOOD}" ${L}/>
        <path d="M10 25v3.5M17 25v3.5M24 25v3.5" stroke="#6e4a2a" stroke-width=".8"/>
        ${flag(6, 25, 13, G)}
        <rect x="22" y="19" width="7" height="6" fill="${WOOD}" ${L}/>
        <path d="M22 19l7 6M29 19l-7 6" stroke="#6e4a2a" stroke-width=".8"/>
        <path d="M32 25v-3" stroke="#4a3b2e" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M37 29h20l-3 5H40z" fill="${G}" ${L}/>
        <path d="M37 29h20" stroke="#6e4a2a" stroke-width="1.6"/>
        <path d="M42 27l8 5" stroke="#6e4a2a" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M32 23q4 0 6 6" fill="none" stroke="#6e4a2a" stroke-width=".8"/>`,
    harbor: `
        ${waves(33)}
        <path d="M8 27h42l-6 8H14z" fill="#8a5a32" ${L}/>
        <path d="M10 29.5h38" stroke="${G}" stroke-width="1.6"/>
        <path d="M29 27V3M19 27V9" stroke="#4a3b2e" stroke-width="1.6"/>
        <path d="M30 5c7 1 13 1 16 0v18c-4 1-10 1-16 0z" fill="${G}" ${L}/>
        <path d="M20 10c4 1 6 1 8 0v14c-3 1-5 1-8 0z" fill="${G}" ${L}/>
        <path d="M30 14c6 1 12 1 16 0M20 17c3 1 5 1 8 0" fill="none" stroke="#2c6e3d" stroke-width=".8"/>
        <path d="M29 3l6-1.5-6-1.5z" fill="${G}"/>
        <path d="M50 27l7-6" stroke="#4a3b2e" stroke-width="1.4"/>`,
    townHall: `
        ${ground()}
        <rect x="6" y="20" width="48" height="18" fill="${STONE}" ${L}/>
        <path d="M4 21l6-6h40l6 6z" fill="${G}" ${L}/>
        ${win(9, 25, 5, 6)}${win(16, 25, 5, 6)}${win(39, 25, 5, 6)}${win(46, 25, 5, 6)}
        <rect x="23" y="8" width="14" height="30" fill="${STONE}" ${L}/>
        <path d="M21.5 9L30 1l8.5 8z" fill="${G}" ${L}/>
        <circle cx="30" cy="15" r="4.2" fill="#f7f3ea" ${LT}/>
        <path d="M30 15v-2.8M30 15h2.2" stroke="#4a3b2e" stroke-width="1" stroke-linecap="round"/>
        ${door(26.5, 7, 28, WOOD)}`,
    // 赤（軍事）
    watchtower: `
        ${ground()}
        <path d="M8 38V30l2-2 2 2v8M14 38V31l2-2 2 2v7M42 38V31l2-2 2 2v7M48 38V30l2-2 2 2v8" fill="${WOOD}" ${LT}/>
        <path d="M24 38V14h12v24z" fill="${STONE}" ${L}/>
        <rect x="21" y="11" width="18" height="4" fill="${STONE2}" ${L}/>
        <path d="M19.5 12L30 4l10.5 8z" fill="${R}" ${L}/>
        ${flag(30, 4, 4, R)}
        <path d="M30 18v5M30 27v4" stroke="${DARK}" stroke-width="1.8"/>
        <path d="M24 24h12" stroke="${STONE2}" stroke-width="1"/>`,
    prison: `
        ${ground()}
        <rect x="8" y="14" width="40" height="24" fill="${STONE2}" ${L}/>
        <path d="M8 20h40M8 26h40M8 32h40M16 14v6M28 14v6M40 14v6M22 20v6M34 20v6M16 26v6M40 26v6M22 32v6M34 32v6" stroke="#9a8e77" stroke-width=".8"/>
        <rect x="6" y="10" width="44" height="5" fill="${R}" ${L}/>
        <rect x="12" y="19" width="7" height="7" fill="${DARK}"/><path d="M14.3 19v7M16.7 19v7" stroke="#9aa4ad" stroke-width="1.2"/>
        <rect x="37" y="19" width="7" height="7" fill="${DARK}"/><path d="M39.3 19v7M41.7 19v7" stroke="#9aa4ad" stroke-width="1.2"/>
        <rect x="23" y="24" width="10" height="14" fill="#6b6f76" ${L}/>
        <circle cx="25.5" cy="27" r=".8" fill="${DARK}"/><circle cx="30.5" cy="27" r=".8" fill="${DARK}"/><circle cx="25.5" cy="35" r=".8" fill="${DARK}"/><circle cx="30.5" cy="35" r=".8" fill="${DARK}"/>
        <path d="M48 34q3 0 4 2" fill="none" stroke="#6b6f76" stroke-width="1.2"/>
        <circle cx="54" cy="35.5" r="3" fill="#3b3e44"/>`,
    battlefield: `
        <path d="M2 38.5c6-6 14-8 28-8s22 2 28 8z" fill="#a58e62" ${LT}/>
        <path d="M13 38L41 3M47 38L19 3" stroke="#6e4a2a" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M41 3l-2.5 5 3.5-1z" fill="#9aa4ad"/>
        <path d="M19 3l2.5 5-3.5-1z" fill="#9aa4ad"/>
        <path d="M8 37V4" stroke="#4a3b2e" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M8 5h13l-3 4.5 3 4.5H8z" fill="${R}" ${LT}/>
        <circle cx="30" cy="26" r="6.5" fill="${R}" ${L}/>
        <circle cx="30" cy="26" r="2" fill="#c9a040"/>
        <path d="M49 37l2-12M47.5 28h5" stroke="#8b96a0" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M14 34l-1-3M16 34l1-3" stroke="#6b8a3a" stroke-width="1" stroke-linecap="round"/>`,
    fortress: `
        ${ground()}
        ${crenel(14, 17, 32, '#b8ad97', 4)}
        ${crenel(3, 10, 13, '#b8ad97', 2)}
        ${crenel(44, 10, 13, '#b8ad97', 2)}
        <path d="M14 22h32" stroke="${R}" stroke-width="2.2"/>
        <path d="M24 38V30a6 6 0 0 1 12 0v8z" fill="${DARK}" ${LT}/>
        <path d="M27 25v13M30 24v14M33 25v13M24 30h12M24 34h12" stroke="#8b96a0" stroke-width=".9"/>
        <path d="M9.5 18v5M50.5 18v5" stroke="${DARK}" stroke-width="1.8"/>
        ${flag(9.5, 10, 9, R)}${flag(50.5, 10, 9, R)}`,
    // 紫（特殊）
    hauntedCity: `
        ${ground()}
        <circle cx="47" cy="8" r="5.5" fill="#f2e7b8"/>
        <path d="M5 38V21l1-1 14 1v17z" fill="#6c5a7a" ${L}/>
        <path d="M3 22l9-11 10 9z" fill="${P}" ${L}/>
        <path d="M22 38V25l15-1v14z" fill="#5c4a6a" ${L}/>
        <path d="M20 26l8-9 11 6z" fill="${P}" ${L}/>
        <rect x="9" y="25" width="4" height="5" fill="#c7e08a" transform="rotate(-4 11 27)"/>
        <rect x="27" y="29" width="4" height="4" fill="#c7e08a"/>
        <path d="M13.5 38v-5h3v5" fill="${DARK}"/>
        <path d="M41 33c0-11 2-17 7-17s7 6 7 17l-2.3-2-2.3 2-2.4-2-2.3 2-2.4-2z" fill="#f4f2f8" ${LT}/>
        <circle cx="46" cy="22" r="1.2" fill="${DARK}"/><circle cx="50" cy="22" r="1.2" fill="${DARK}"/>
        <ellipse cx="48" cy="26.5" rx="1.2" ry="1.6" fill="${DARK}"/>`,
    keep: `
        ${ground()}
        ${crenel(17, 5, 26, STONE, 3)}
        <path d="M17 13h26" stroke="${STONE2}" stroke-width="1"/>
        ${banner(26, 13, 8, 12, P)}
        ${star(30, 18.5, 2.4, '#f4d061')}
        <path d="M21 17v5M39 17v5M21 27v4M39 27v4" stroke="${DARK}" stroke-width="1.8"/>
        ${door(26, 8, 30, WOOD)}
        <path d="M11 38v-6h6M49 38v-6h-6" fill="none" stroke="${STONE2}" stroke-width="1.6"/>`,
    laboratory: `
        ${ground()}
        <circle cx="12" cy="6" r="2.2" fill="#c5e3a0"/><circle cx="15" cy="3" r="1.6" fill="#c5e3a0"/>
        <rect x="9.5" y="9" width="5" height="9" fill="${STONE2}" ${L}/>
        <rect x="4" y="20" width="26" height="18" fill="${STONE}" ${L}/>
        <path d="M2 21l15-10 15 10z" fill="${P}" ${L}/>
        ${win(8, 25, 5, 6)}
        ${door(19, 6, 28, WOOD)}
        <path d="M42.5 9h5M43.5 9v10c-6 2-9 6-9 11a8 8 0 0 0 4 7h12a8 8 0 0 0 4-7c0-5-3-9-9-11V9" fill="#eef4f6" ${L}/>
        <path d="M35 29c4-1 16-1 19 0 0 3-1 6-4 8H39c-3-2-4-5-4-8z" fill="${P}"/>
        <path d="M43.5 19c-6 2-9 6-9 11a8 8 0 0 0 4 7h12a8 8 0 0 0 4-7c0-5-3-9-9-11" fill="none" ${L}/>
        <circle cx="42" cy="32" r="1.2" fill="#e8d6f4"/><circle cx="47" cy="34" r="1" fill="#e8d6f4"/><circle cx="45" cy="25" r=".9" fill="${P}"/>`,
    smithy: `
        ${ground()}
        <path d="M5 38V17M29 38V17" stroke="#6e4a2a" stroke-width="2"/>
        <path d="M2 18l15-9 15 9z" fill="${P}" ${L}/>
        <rect x="8" y="27" width="18" height="11" fill="${STONE2}" ${L}/>
        <path d="M11 27c1-5 3-3 4-7 2 3 2 5 4 2 1 3 3 3 4 5z" fill="#f08a2e" ${LT}/>
        <path d="M14 27c1-3 2-2 3-4 1 2 2 3 3 4z" fill="#f4d061"/>
        <path d="M32 26h22c0 2-3 3-6 3v4h3v5H39v-5h3v-4c-5 0-10-1-10-3z" fill="#4b4f57" ${L}/>
        <path d="M41 11l9 8" stroke="#8a5a32" stroke-width="2" stroke-linecap="round"/>
        <rect x="37" y="7" width="8" height="5" rx="1" fill="#6b6f76" ${LT} transform="rotate(42 41 9.5)"/>
        <path d="M46 22l2-3M50 23l3-2M44 21l-2-3" stroke="#f4a03a" stroke-width="1.2" stroke-linecap="round"/>`,
    graveyard: `
        ${ground()}
        <path d="M2 38V27M58 38V27M2 29h56M2 35h56" stroke="${P}" stroke-width="1.4"/>
        <path d="M6 38v-9M10 38v-9M14 38v-9M46 38v-9M50 38v-9M54 38v-9" stroke="${P}" stroke-width="1.2"/>
        <path d="M6 28l0-1.5M10 28l0-1.5" stroke="${P}" stroke-width="1"/>
        <path d="M17 38V22a6 6 0 0 1 12 0v16z" fill="#a8a6ad" ${L}/>
        <path d="M23 21v8M20 24h6" stroke="#6b6974" stroke-width="1.4"/>
        <path d="M33 38V28a4.5 4.5 0 0 1 9 0v10z" fill="#a8a6ad" ${L}/>
        <path d="M45.5 38V14M41 19h9" stroke="#7a7680" stroke-width="2.6" stroke-linecap="square"/>
        <circle cx="20" cy="37" r="1.4" fill="${P}"/><circle cx="37.5" cy="37" r="1.4" fill="${P}"/>
        <path d="M8 22c1-6 1-10-1-14M7 13l-3-3M7.6 16l3-3" fill="none" stroke="#5a4636" stroke-width="1.4" stroke-linecap="round"/>`,
    observatory: `
        ${ground()}
        ${star(8, 7, 2.6, '#f4d061')}${star(52, 12, 2, '#f4d061')}${star(17, 3, 1.6, '#f4d061')}
        <rect x="13" y="22" width="34" height="16" fill="${STONE}" ${L}/>
        <path d="M16 22a14 13 0 0 1 28 0z" fill="${P}" ${L}/>
        <path d="M30 9.5v12.5" stroke="${DARK}" stroke-width="3"/>
        <path d="M30 16l15-11" stroke="#4b4f57" stroke-width="4.4" stroke-linecap="round"/>
        <path d="M43 6.5l3.5-2.5" stroke="#c9a040" stroke-width="5" stroke-linecap="butt"/>
        ${door(27, 6, 30, WOOD)}
        ${win(17, 27, 4, 5)}${win(39, 27, 4, 5)}`,
    schoolOfMagic: `
        ${ground()}
        <rect x="8" y="20" width="12" height="18" fill="${STONE}" ${L}/>
        <path d="M6 21l8-13 8 13z" fill="${P}" ${L}/>
        <rect x="23" y="12" width="16" height="26" fill="${STONE}" ${L}/>
        <path d="M20.5 13L31 0.5 41.5 13z" fill="${P}" ${L}/>
        ${star(31, 9, 2.4, '#f4d061')}
        <path d="M28 25v-4a3 3 0 0 1 6 0v4z" fill="#b98ae0" ${LT}/>
        ${door(27.5, 7, 30, WOOD)}
        <path d="M12 30v-3a2 2 0 0 1 4 0v3z" fill="#b98ae0" ${LT}/>
        ${star(48, 10, 3, '#b98ae0')}${star(53, 20, 2, '#f4d061')}${star(45, 26, 1.8, '#b98ae0')}
        <path d="M42 38v-6l8-6 3 1-7 11z" fill="#7a5233" ${LT}/>`,
    library: `
        ${ground()}
        <rect x="6" y="17" width="48" height="21" fill="${STONE}" ${L}/>
        <path d="M3 18l7-8h40l7 8z" fill="${P}" ${L}/>
        <path d="M30 15c-3-2-7-2-9-1v-3c2-1 6-1 9 1 3-2 7-2 9-1v3c-2-1-6-1-9 1z" fill="#f7f3ea" ${LT}/>
        <rect x="9" y="21" width="16" height="15" fill="#5a3f2e" ${LT}/>
        <rect x="35" y="21" width="16" height="15" fill="#5a3f2e" ${LT}/>
        <path d="M9 28.5h16M35 28.5h16" stroke="#3a2a20" stroke-width="1"/>
        <path d="M10.5 22v6M12.5 22v6M14.5 23v5M17 22v6M19 22.5v5.5M21 22v6M23 23v5M10.5 29.5v6M13 29.5v6M15 30v5.5M17.5 29.5v6M20 29.5v6M22.5 30v5.5" stroke-width="1.6" stroke="${R}"/>
        <path d="M12.5 22v6M19 22.5v5.5M13 29.5v6M22.5 30v5.5" stroke-width="1.6" stroke="${B}"/>
        <path d="M14.5 23v5M21 22v6M17.5 29.5v6" stroke-width="1.6" stroke="${Y}"/>
        <path d="M36.5 22v6M38.5 22v6M40.5 23v5M43 22v6M45 22.5v5.5M47 22v6M49 23v5M36.5 29.5v6M39 29.5v6M41 30v5.5M43.5 29.5v6M46 29.5v6M48.5 30v5.5" stroke-width="1.6" stroke="${G}"/>
        <path d="M38.5 22v6M45 22.5v5.5M39 29.5v6M48.5 30v5.5" stroke-width="1.6" stroke="${P}"/>
        <path d="M40.5 23v5M47 22v6M43.5 29.5v6" stroke-width="1.6" stroke="${Y}"/>
        ${door(27, 6, 28, WOOD)}`,
    greatWall: `
        ${ground(1, 59)}
        ${crenel(1, 16, 58, STONE, 7)}
        <path d="M1 25h58M1 32h58M8 19v6M20 19v6M32 19v6M44 19v6M54 19v6M14 25v7M26 25v7M38 25v7M50 25v7M8 32v6M20 32v6M32 32v6M44 32v6M54 32v6" stroke="${STONE2}" stroke-width="1"/>
        ${banner(5, 19, 6, 10, P)}${banner(27, 19, 6, 10, P)}${banner(49, 19, 6, 10, P)}`,
    university: `
        ${ground()}
        <rect x="5" y="19" width="50" height="19" fill="${STONE}" ${L}/>
        <path d="M3 20l27-10 27 10z" fill="${P}" ${L}/>
        <path d="M30 14.5l-7-2.5 7-2.5 7 2.5z" fill="${DARK}"/>
        <path d="M26 13v2.5c2 1.2 6 1.2 8 0V13" fill="${DARK}"/>
        <path d="M37 12v4" stroke="#f4d061" stroke-width="1"/><circle cx="37" cy="16.4" r=".9" fill="#f4d061"/>
        <path d="M9 32v-6a2.5 2.5 0 0 1 5 0v6zM17 32v-6a2.5 2.5 0 0 1 5 0v6zM38 32v-6a2.5 2.5 0 0 1 5 0v6zM46 32v-6a2.5 2.5 0 0 1 5 0v6z" fill="#b98ae0" ${LT}/>
        <rect x="24" y="22" width="12" height="16" fill="${STONE2}" ${LT}/>
        ${door(26.5, 7, 28, WOOD)}`,
    dragonGate: `
        ${ground()}
        <path d="M6 38V17h48v21z" fill="${STONE}" ${L}/>
        <path d="M4 18h52" stroke="${STONE2}" stroke-width="3" stroke-linecap="round"/>
        <path d="M19 38V28a11 10 0 0 1 22 0v10z" fill="${DARK}" ${L}/>
        <path d="M6 28h6M48 28h6M6 33h6M48 33h6" stroke="${STONE2}" stroke-width="1"/>
        <path d="M17 17c-1-6 2-11 8-12l4-4 1 4c3 0 6 1 8 3l11 2c1 0 2 2 1 3l-4 1 3 2c1 1 0 2-1 2l-11 0c-3 3-8 4-12 3-4 1-7 0-8-4z" fill="${P}" ${L}/>
        <path d="M22 6l-4-5 6 3z" fill="#f4d061" ${LT}/>
        <circle cx="33" cy="9" r="1.8" fill="#f4d061"/><circle cx="33.4" cy="9" r=".8" fill="${DARK}"/>
        <path d="M38 13.5l9 .5" stroke="${DARK}" stroke-width="1" stroke-linecap="round"/>
        <path d="M41 14.2l1 1.8 1-1.6 1 1.6 1-1.5" fill="none" stroke="#fff" stroke-width=".8"/>
        <circle cx="47" cy="11" r=".7" fill="${DARK}"/>
        <path d="M20 11c2 1 4 1 6 0M21 14c2 1 4 1 6 0" fill="none" stroke="#6a3d8c" stroke-width=".9"/>`
};
