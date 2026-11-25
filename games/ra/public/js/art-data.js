/**
 * 絵のデータ（すべて自作の SVG。公式の画像は使っていない）
 * TILE_ART: 角丸の正方形のタイルに重ねる絵（viewBox 0 0 48 48、背景は透明）
 * ICON_ART: 小さな記号（viewBox 0 0 24 24）
 * 外側の <svg>・<symbol> は呼ぶ側で包む
 */

const L = '#2a1d12'; // 縁取りの色
const S = `stroke="${L}" stroke-width="1.2" stroke-linejoin="round"`;
const GOLD = '#e9b949';
const GOLD_D = '#b8862a';
const TURQ = '#3fb3b8';
const LAPIS = '#2f4f9e';
const OCHRE = '#b5532f';
const CREAM = '#f1e6c8';
const SHADE = '#b8955a';
const SKIN = '#c97b4a';
const RED = '#e0392b';

// 縁取りつきの線（太い黒線の上に色の線を重ねる）
const line = (d, color, w) =>
    `<path d="${d}" fill="none" stroke="${L}" stroke-width="${w + 2.2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// 放射状の光（三角形を n 本）
const rays = (cx, cy, r1, r2, n, half, fill, extra = '') => {
    let d = '';
    for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const p = (r, t) => `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
        d += `M${p(r1, a - half)}L${p(r2, a)}L${p(r1, a + half)}Z`;
    }
    return `<path d="${d}" fill="${fill}" ${extra}/>`;
};

// 星形
const star = (cx, cy, R, r, n, fill, extra = '') => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const a = (Math.PI * i) / n - Math.PI / 2;
        const rr = i % 2 ? r : R;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return `<path d="M${pts.join('L')}Z" fill="${fill}" ${extra}/>`;
};

// 災害の赤い×印
const redX = (x, y) => line(`M${x - 3.5} ${y - 3.5}l7 7M${x + 3.5} ${y - 3.5}l-7 7`, RED, 2.6);

export const TILE_ART = {
    // ラー：太陽円盤と金の光
    ra: `
        ${rays(24, 24, 11, 20, 12, 0.2, GOLD, S)}
        <circle cx="24" cy="24" r="12" fill="#e8552a" ${S}/>
        <circle cx="24" cy="24" r="8.5" fill="none" stroke="#f59a4c" stroke-width="2"/>
        <circle cx="20.5" cy="20.5" r="2.2" fill="#f7b77a"/>`,

    // 神：アンク
    god: `
        ${line('M24 20.5c-4 0-6-3.8-6-7.5s2.4-6.5 6-6.5 6 2.8 6 6.5-2 7.5-6 7.5z', GOLD, 3.8)}
        <path d="M11 21h26a1.8 1.8 0 0 1 0 4.6H11a1.8 1.8 0 0 1 0-4.6z" fill="${GOLD}" ${S}/>
        <path d="M21.6 25.6h4.8l2.8 16.4h-10.4z" fill="${GOLD}" ${S}/>
        <circle cx="24" cy="23.3" r="1.5" fill="${TURQ}" ${S}/>`,

    // 金：積んだ金の延べ棒
    gold: `
        <path d="M6 41l2.5-8h14l2.5 8z" fill="${GOLD}" ${S}/>
        <path d="M23 41l2.5-8h14l2.5 8z" fill="${GOLD}" ${S}/>
        <path d="M14.5 32l2.5-8h14l2.5 8z" fill="${GOLD}" ${S}/>
        <path d="M9.5 35.5h12M26.5 35.5h12M18 26.5h12" stroke="#fbe39a" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M6 41h20M23 41h19M14.5 32h19" stroke="${GOLD_D}" stroke-width="1.4"/>
        ${star(15, 15, 4.5, 1.3, 4, '#fff4cc')}
        ${star(34, 11, 3, 0.9, 4, '#fff4cc')}`,

    // ファラオ：ネメス頭巾の横顔（右向き）
    pharaoh: `
        <path d="M27 11.5Q19 6 12 11L8.5 41h12.5l2-12z" fill="${GOLD}" ${S}/>
        <path d="M12 16.5q6-3 13 0M11 22q6-2.5 12 0M10.3 28q5-2 11 0M9.6 34q5-2 10.5 0" stroke="${LAPIS}" stroke-width="2.2" fill="none"/>
        <path d="M26.5 12.5l6 2 1 7 2.5 3.5-2.2 1 .3 3-2 1 .6 2.4-3 2.6-5.7.5-1.5-9z" fill="${SKIN}" ${S}/>
        <path d="M30.5 33.5h3l-.5 7h-2z" fill="${LAPIS}" ${S}/>
        <path d="M21 21.5l5 2.5 2.2 18H20.5z" fill="${GOLD}" ${S}/>
        <path d="M22.2 27h5M22.5 31.5h5.3M22.7 36h5.8" stroke="${LAPIS}" stroke-width="2"/>
        <path d="M28.3 19.4q2.2-1.4 4.3.2-2.2 1.2-4.3-.2z" fill="${CREAM}" stroke="${L}" stroke-width="1"/>
        <circle cx="30.6" cy="19.4" r=".9" fill="${L}"/>
        <path d="M27.5 17.4q2.8-1.2 5.3.2" stroke="${L}" stroke-width="1.1" fill="none"/>
        <path d="M27 12.5q.5-4.5 2.5-4.2 1.4.4.2 2.3l-1.4 2.4z" fill="${TURQ}" ${S}/>`,

    // ナイル：パピルスと川の波
    nile: `
        <path d="M15 34V17M24 34V12M33 34V18" stroke="${L}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M15 34V17M24 34V12M33 34V18" stroke="#6fae4f" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M15 18l-6-8q6-3 12 0z" fill="#8cc25a" ${S}/>
        <path d="M24 13l-6.5-8q6.5-3 13 0z" fill="#8cc25a" ${S}/>
        <path d="M33 19l-6-8q6-3 12 0z" fill="#8cc25a" ${S}/>
        <path d="M9.5 10.5q5.5-2.4 11 0M17.8 5.5q6.2-2.4 12.4 0M27.5 11.5q5.5-2.4 11 0" stroke="${GOLD}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path d="M5 33q3.2-3 6.4 0t6.4 0 6.4 0 6.4 0 6.4 0 6 0V43H5z" fill="${TURQ}" ${S}/>
        <path d="M8 38.5q2.6-2.4 5.2 0t5.2 0M24 39q2.6-2.4 5.2 0t5.2 0" stroke="${CREAM}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,

    // 洪水：大きな波と水位の線
    flood: `
        <path d="M35 6h6v37h-6z" fill="${CREAM}" ${S}/>
        <path d="M35 11h3M35 16h4M35 21h3M35 26h4M35 31h3M35 36h4" stroke="${L}" stroke-width="1.2"/>
        <path d="M5 43V27C7 15 18 8 27 10c6 1.4 8 7.5 3.5 10-3 1.6-6-.5-5-3.4-5 .8-7.5 5-6 10h16v16z" fill="${TURQ}" ${S}/>
        <path d="M8 26c2-8 9-13 16-13" stroke="${CREAM}" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M5 33.5q3-2.6 6 0t6 0 6 0 6 0" stroke="${CREAM}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        ${line('M33 15.5h10', RED, 2)}`,

    // 天文：三日月と星
    astronomy: `
        <path d="M21 8a14 14 0 1 0 12 22A11 11 0 1 1 21 8z" fill="${CREAM}" ${S}/>
        ${star(32, 15, 7, 2.8, 5, GOLD, S)}
        ${star(39, 30, 3.6, 1.5, 5, GOLD, S)}
        ${star(26, 38, 2.8, 1.2, 5, GOLD, S)}`,

    // 農業：麦の穂と鎌
    agriculture: `
        <path d="M24 42V12M24 42L15 16M24 42l9-26" stroke="${L}" stroke-width="3" stroke-linecap="round"/>
        <path d="M24 42V12M24 42L15 16M24 42l9-26" stroke="#d9a63a" stroke-width="1.4" stroke-linecap="round"/>
        ${[[24, 9], [14.5, 12.5], [33.5, 12.5]].map(([x, y]) => `
            <ellipse cx="${x}" cy="${y}" rx="2.6" ry="5" fill="${GOLD}" ${S}/>
            <path d="M${x - 2.4} ${y - 1}h4.8M${x - 2.4} ${y + 2}h4.8" stroke="${GOLD_D}" stroke-width="1"/>`).join('')}
        <path d="M24 31l-6.5 5" stroke="${L}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M18 36.5q-12 0-11.5-14 4 11 13 11.5z" fill="#d6d9de" ${S}/>
        <path d="M22 35.5l5.5 5" stroke="${L}" stroke-width="4.6" stroke-linecap="round"/>
        <path d="M22 35.5l5.5 5" stroke="${OCHRE}" stroke-width="2.6" stroke-linecap="round"/>`,

    // 筆記：絵文字を書いた巻物と葦の筆
    writing: `
        <path d="M9 12h30v24H9z" fill="${CREAM}" ${S}/>
        <rect x="6" y="10" width="5" height="28" rx="2.5" fill="#d8c49a" ${S}/>
        <rect x="37" y="10" width="5" height="28" rx="2.5" fill="#d8c49a" ${S}/>
        <path d="M14 17q3-2.4 6 0-3 2.4-6 0z" fill="none" stroke="${LAPIS}" stroke-width="1.5"/>
        <circle cx="17" cy="17" r="1" fill="${LAPIS}"/>
        <path d="M14 23l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5" stroke="${LAPIS}" stroke-width="1.5" fill="none"/>
        <path d="M14 30.5q1-3.5 4-3l2 1.3-2 .3v2.4z" fill="${OCHRE}"/>
        <path d="M25 15v7M28 15v7M25 26h7M26.5 28.5v3.5h4" stroke="${OCHRE}" stroke-width="1.5" fill="none"/>
        <path d="M30 34L43 9" stroke="${L}" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M30 34L43 9" stroke="#d9a63a" stroke-width="1.8" stroke-linecap="round"/>`,

    // 宗教：ホルスの目
    religion: `
        ${line('M8 15q15-7 31 0', GOLD, 3)}
        <path d="M8 23q8-8 16-8t16 8q-8 6-16 6t-16-6z" fill="${CREAM}" ${S}/>
        <circle cx="24" cy="22" r="5" fill="${LAPIS}" ${S}/>
        <circle cx="22.5" cy="20.5" r="1.4" fill="${CREAM}"/>
        ${line('M8 23q8-8 16-8t16 8', GOLD, 2.2)}
        ${line('M20 29l-4 12', GOLD, 2.6)}
        ${line('M27 29q3 5 7.5 5.5c3.5.3 4.5-3 2-4.5', GOLD, 2.6)}`,

    // 芸術：絵付けした壺
    art: `
        <path d="M18 7h12l-1 4c7 3 9 10 7 18-1.5 6-5 9-6 10h-12c-1-1-4.5-4-6-10-2-8 0-15 7-18z" fill="${CREAM}" ${S}/>
        <path d="M14 18h20" stroke="${TURQ}" stroke-width="3"/>
        <path d="M12.8 30h22.4" stroke="${OCHRE}" stroke-width="3"/>
        <path d="M20 26.5l4-4.5 4 4.5M17 26q3-2 4 .5M31 26q-3-2-4 .5" stroke="${LAPIS}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M18 7h12l-1 4c7 3 9 10 7 18-1.5 6-5 9-6 10h-12c-1-1-4.5-4-6-10-2-8 0-15 7-18z" fill="none" ${S}/>
        <path d="M17.5 41h13" stroke="${L}" stroke-width="2.4" stroke-linecap="round"/>`,

    // 要塞：日干し煉瓦の城壁と塔
    fortress: `
        <path d="M6 42V18h3v-3h3v3h3v-3h3v27z" fill="${OCHRE}" ${S}/>
        <path d="M30 42V18h3v-3h3v3h3v-3h3v27z" fill="${OCHRE}" ${S}/>
        <path d="M18 42V24h2.5v-3H23v3h2v-3h2.5v3H30v18z" fill="#c9683f" ${S}/>
        <path d="M20.5 42v-8a3.5 3.5 0 0 1 7 0v8z" fill="${L}"/>
        <path d="M10.5 24v4M34.5 24v4" stroke="${L}" stroke-width="2" stroke-linecap="round"/>
        <path d="M7 32h5M13 36h4M31 32h5M37 37h4M20 29h4" stroke="#7a3520" stroke-width="1"/>`,

    // オベリスク：尖った石柱
    obelisk: `
        <path d="M19 42l1.8-29h6.4l1.8 29z" fill="${CREAM}" ${S}/>
        <path d="M24 13h3.2l1.8 29H24z" fill="#ddc99a"/>
        <path d="M19 42l1.8-29h6.4l1.8 29z" fill="none" ${S}/>
        <path d="M20.8 13L24 5.5l3.2 7.5z" fill="${GOLD}" ${S}/>
        <path d="M22.3 18h3.4M22.5 22.5q1.5-1.3 3 0M22 27h4M23 30.5v3M25 30.5v3M22 37h4" stroke="${OCHRE}" stroke-width="1.3" fill="none"/>
        <path d="M13 42h22" stroke="${L}" stroke-width="2.4" stroke-linecap="round"/>`,

    // 宮殿：柱の並ぶ建物
    palace: `
        <path d="M5 13h38v6H5z" fill="${OCHRE}" ${S}/>
        <path d="M7 10h34l2 3H5z" fill="${CREAM}" ${S}/>
        ${[11, 19.7, 28.3, 37].map((x) => `
            <path d="M${x - 2} 22h4v16h-4z" fill="${CREAM}" ${S}/>
            <path d="M${x - 3.6} 19h7.2l-1.8 3h-3.6z" fill="${TURQ}" ${S}/>`).join('')}
        <path d="M7 19.5h34" stroke="${GOLD}" stroke-width="1.2"/>
        <path d="M5 38h38v4H5z" fill="#ddc99a" ${S}/>`,

    // ピラミッド：滑らかな四角錐
    pyramid: `
        <path d="M24 7L5 40h19z" fill="${CREAM}" ${S}/>
        <path d="M24 7l19 33H24z" fill="${SHADE}" ${S}/>
        <path d="M24 7l-3.4 6h6.8z" fill="${GOLD}" ${S}/>
        <path d="M4 40.5h40" stroke="${L}" stroke-width="2.2" stroke-linecap="round"/>`,

    // 神殿：塔門と翼のある日輪
    temple: `
        <path d="M5 41l3-27h12v27z" fill="${CREAM}" ${S}/>
        <path d="M43 41l-3-27H28v27z" fill="${CREAM}" ${S}/>
        <path d="M18 20h12v21H18z" fill="#ddc99a" ${S}/>
        <path d="M20.5 41v-14h7v14z" fill="${L}"/>
        <path d="M10 6v8M38 6v8" stroke="${L}" stroke-width="1.2"/>
        <path d="M10 6l5 1.8-5 1.8zM38 6l-5 1.8 5 1.8z" fill="${RED}" ${S}/>
        <path d="M14 23.5q4-2 7 0M27 23.5q3-2 7 0" stroke="${LAPIS}" stroke-width="1.8" fill="none"/>
        <circle cx="24" cy="23.5" r="2.2" fill="${GOLD}" ${S}/>
        <path d="M9 19h9M30 19h9M9 31h9M30 31h9" stroke="#b49a6a" stroke-width="1.1"/>`,

    // 像：正面を向いて立つ王の像
    statue: `
        <path d="M13 38h22v4H13z" fill="${SHADE}" ${S}/>
        <path d="M19.5 30h3.5v8h-3.5zM25 30h3.5v8H25z" fill="${CREAM}" ${S}/>
        <path d="M18 24h12l1.5 7h-15z" fill="${CREAM}" ${S}/>
        <path d="M16 16h16l-2 8H18z" fill="${CREAM}" ${S}/>
        <path d="M16.5 17l-1.5 8.5 3 .5M31.5 17l1.5 8.5-3 .5" stroke="${L}" stroke-width="1.2" fill="#e3d4ac"/>
        <path d="M16 17l2.5-11h11l2.5 11-4 1.5V12h-8v6.5z" fill="${GOLD}" ${S}/>
        <path d="M18 9.5h12M17 13.5h3M28 13.5h3" stroke="${LAPIS}" stroke-width="1.8"/>
        <path d="M20 10h8v8a4 4 0 0 1-8 0z" fill="#e3d4ac" ${S}/>
        <path d="M22.5 22h3l-.5 3h-2z" fill="${LAPIS}" ${S}/>
        <path d="M21.5 13.5h1.5M25 13.5h1.5" stroke="${L}" stroke-width="1.2"/>`,

    // 階段ピラミッド
    stepPyramid: `
        <path d="M5 41v-6h38v6z" fill="${CREAM}" ${S}/>
        <path d="M9 35v-6h30v6z" fill="${CREAM}" ${S}/>
        <path d="M13 29v-6h22v6z" fill="${CREAM}" ${S}/>
        <path d="M17 23v-6h14v6z" fill="${CREAM}" ${S}/>
        <path d="M20.5 17v-6h7v6z" fill="${CREAM}" ${S}/>
        <path d="M33 35.6h9.4v4.8H33zM29 29.6h9.4v4.8H29zM26 23.6h8.4v4.8H26zM24 17.6h6.4v4.8H24zM24 11.6h2.9v4.8H24z" fill="${SHADE}"/>
        <path d="M22.5 41v-3.5h3V41z" fill="${L}"/>`,

    // スフィンクス：伏せた獅子と王の頭
    sphinx: `
        <path d="M8 40c-1-8 2-14 10-15h12l3-4h4l2 4v8l6 4v3z" fill="#e3c88a" ${S}/>
        <path d="M6 40c2-3 5-4 8-3" stroke="${L}" stroke-width="1.2" fill="none"/>
        <path d="M11 40q1-6 7-7" stroke="${L}" stroke-width="1.2" fill="none"/>
        <path d="M30 21q0-10 7-11 7 0 8 7l-1 3-2 1v10h-6l-4-6z" fill="${GOLD}" ${S}/>
        <path d="M31 16.5q4-2 8-1M30.5 21q3-1.5 6-.5M32.5 25.5q2.5-1 4.5 0" stroke="${LAPIS}" stroke-width="1.8" fill="none"/>
        <path d="M38 13.5l5 1.5 1.5 5-1 1 .5 2.5-1.5 1 .3 2-3 1.5-3-.5z" fill="#e3c88a" ${S}/>
        <circle cx="41.5" cy="17.5" r=".9" fill="${L}"/>
        <path d="M4 41h40" stroke="${L}" stroke-width="2.2" stroke-linecap="round"/>`,

    // 葬式：横たわる人形の棺
    funeral: `
        <path d="M6 30c0-5 3-8 7-8h20c4 0 7 1.5 9 4 1 1.2 1 2.8 0 4-2 2.5-5 4-9 4H13c-4 0-7-1-7-4z" fill="${GOLD}" ${S}/>
        <path d="M6.5 27.5h12M6.5 31.5h12" stroke="${LAPIS}" stroke-width="2"/>
        <path d="M8.5 23.8c2-1 6-1.2 8.5 0v8.4c-2.5 1.5-6.5 1-8.5 0z" fill="${SKIN}" ${S}/>
        <path d="M21 26l14 0M21 30h14" stroke="${OCHRE}" stroke-width="1.4"/>
        <path d="M24 24v8M29 24v8" stroke="${TURQ}" stroke-width="1.6"/>
        <path d="M6 36h36v5H6z" fill="#6a5a48" ${S}/>
        ${redX(37, 12)}`,

    // 干ばつ：照りつける太陽とひび割れた地面
    drought: `
        ${rays(24, 14, 7, 12, 10, 0.25, GOLD, S)}
        <circle cx="24" cy="14" r="7" fill="#f08a2c" ${S}/>
        <path d="M5 28h38v14H5z" fill="${OCHRE}" ${S}/>
        <path d="M10 28l3 5-2 4 2 5M22 28l-2 6 4 3-1 5M33 28l3 4-3 5 4 5M13 33h7M24 37h9" stroke="${L}" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
        <path d="M40 27v-4q-2-2-4-1M40 23q2-3 3-2" stroke="#8a7a3a" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,

    // 内乱：交差した槍と牛革の盾
    unrest: `
        ${line('M9 41L37 9', '#a8743e', 2.2)}
        ${line('M39 41L11 9', '#a8743e', 2.2)}
        <path d="M37 9l1.2-5.5L32.5 6l1 3.5z" fill="#d6d9de" ${S}/>
        <path d="M11 9L9.8 3.5 15.5 6l-1 3.5z" fill="#d6d9de" ${S}/>
        <path d="M17 37V22a7 7 0 0 1 14 0v15z" fill="${CREAM}" ${S}/>
        <path d="M20 22.5q2-2 4 0-1 3-4 0zM25 28q3-1.5 4 1-2.5 2-4-1zM19.5 31q2-1 3 1.5-2 1.2-3-1.5z" fill="#6a4a30"/>
        ${redX(39, 38)}`,

    // 地震：割れて食い違った地面と倒れる柱
    earthquake: `
        <path d="M5 32h17l-3 4 4 3-2 3H5z" fill="${OCHRE}" ${S}/>
        <path d="M43 28H24l-2.5 4.5 4 3-2 3.5 2.5 3H43z" fill="#c9683f" ${S}/>
        <path d="M19 31l2-3.5" stroke="${RED}" stroke-width="2" stroke-linecap="round"/>
        <g transform="rotate(-24 30 27)">
            <path d="M27 27V12h6v15z" fill="${CREAM}" ${S}/>
            <path d="M25.5 12h9l-1.2-2.5h-6.6z" fill="${TURQ}" ${S}/>
            <path d="M28 16l2 2-1.5 2.5 2 2" stroke="${L}" stroke-width="1" fill="none"/>
        </g>
        ${line('M6 10l3 3-3 3 3 3M42 8l-3 3 3 3', RED, 1.6)}`,
};

export const ICON_ART = {
    // 太陽：円と光
    sun: `
        ${rays(12, 12, 6.6, 11, 8, 0.28, 'currentColor')}
        <circle cx="12" cy="12" r="5.6" fill="currentColor"/>
        <circle cx="12" cy="12" r="3.4" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="1.2"/>`,
};
