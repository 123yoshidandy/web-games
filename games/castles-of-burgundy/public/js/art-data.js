/**
 * 絵のデータ（すべて自作の SVG。公式の画像は使っていない）
 * TILE_ART: 六角形のタイルに重ねる絵（viewBox 0 0 60 52、背景は透明）
 * ICON_ART: 小さな記号（viewBox 0 0 24 24）
 * 外側の <svg>・<symbol> は呼ぶ側で包む
 */

const L = '#4a3a28'; // 縁取りの色
const S = `stroke="${L}" stroke-width="1.2" stroke-linejoin="round"`;
const WALL = '#f2ead6';
const ROOF = '#a8452e';
const STONE = '#c9c4b8';
const WOOD = '#9a6a3e';
const DARK = '#3a2a1e';

// 四本の脚（家畜用）
const legs = (xs, y1, y2, color) => xs.map((x) => `<path d="M${x} ${y1}V${y2}" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`).join('');

export const TILE_ART = {
    // 城：石の塔が三つ
    castle: `
        <path d="M12 42V21h2.5v-3H17v3h2.5v-3H22v24z" fill="#b8b2a6" ${S}/>
        <path d="M38 42V21h2.5v-3H43v3h2.5v-3H48v24z" fill="#b8b2a6" ${S}/>
        <path d="M30 14V6.5" stroke="${L}" stroke-width="1.2"/>
        <path d="M30 6.5l7 2.2-7 2.2z" fill="#d2463a" ${S}/>
        <path d="M21 42V14h3.6v3h3.6v-3h3.6v3h3.6v-3H39v28z" fill="${STONE}" ${S}/>
        <path d="M27 42v-7a3 3 0 0 1 6 0v7z" fill="#5a3f28" ${S}/>
        <rect x="28.8" y="20" width="2.4" height="4.5" rx="1.2" fill="${DARK}"/>
        <rect x="15.8" y="26" width="2.4" height="4.5" rx="1.2" fill="${DARK}"/>
        <rect x="41.8" y="26" width="2.4" height="4.5" rx="1.2" fill="${DARK}"/>
        <path d="M23 28h4M33 30h4M24 37h2M35 37h2M13 35h4M43 35h4" stroke="#8a8478" stroke-width=".9"/>`,

    // 鉱山：岩山と坑道の入口、つるはし
    mine: `
        <path d="M10 42l11-23 6 6 6-12 17 29z" fill="#a07a52" ${S}/>
        <path d="M18.5 26l2.5-7 3 3M30 18l3-5 4 7" fill="none" stroke="#c49a6a" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M18 42V30.5h14V42" fill="none" stroke="#6b4626" stroke-width="2.6"/>
        <path d="M17 30.5h16" stroke="#6b4626" stroke-width="3" stroke-linecap="round"/>
        <path d="M20 42v-10h10v10z" fill="#21170f"/>
        <circle cx="25" cy="24" r="1.1" fill="#e8eaee"/><circle cx="35" cy="27" r="1.1" fill="#e8eaee"/><circle cx="31" cy="21" r="1" fill="#e8eaee"/>
        <path d="M46.5 42.5L40.5 25" stroke="#7a4f2c" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M34 30.5q5.5-9 15-7l-.4 2q-8-1-12.5 6z" fill="#b9bec6" ${S}/>`,

    // 修道院：鐘楼のある建物
    monastery: `
        <path d="M14 42V28h21v14z" fill="${WALL}" ${S}/>
        <path d="M12 29l12.5-9 12.5 9z" fill="${ROOF}" ${S}/>
        <path d="M17 36v-3.5a1.5 1.5 0 0 1 3 0V36zM29 36v-3.5a1.5 1.5 0 0 1 3 0V36z" fill="#5a6f8a" ${S}/>
        <path d="M22.5 42v-5a2 2 0 0 1 4 0v5z" fill="#6b4626" ${S}/>
        <path d="M34 42V17h11v25z" fill="${WALL}" ${S}/>
        <path d="M32.5 17.5l7-9 7 9z" fill="${ROOF}" ${S}/>
        <path d="M36.5 27v-5a3 3 0 0 1 6 0v5z" fill="${DARK}"/>
        <path d="M37.3 26.2q0-4.6 2.2-4.6t2.2 4.6z" fill="#e8b23a" stroke="#8a6a20" stroke-width=".8"/>
        <path d="M37.5 34v-2.5a2 2 0 0 1 4 0V34z" fill="#5a6f8a" ${S}/>`,

    // 倉庫：大きな扉の小屋と荷箱
    warehouse: `
        <path d="M11 42V25l14-9 14 9v17z" fill="#b07a48" ${S}/>
        <path d="M11 25l14-9 14 9" fill="none" stroke="#6b4626" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M17 42V29h16v13z" fill="#6b4626" ${S}/>
        <path d="M25 29v13M17 29l8 13M33 29l-8 13" stroke="#c49a6a" stroke-width="1.1"/>
        <rect x="35" y="32" width="12" height="10" fill="#d8a868" ${S}/>
        <path d="M35 32l12 10M47 32l-12 10" stroke="#8a5a30" stroke-width="1"/>
        <rect x="37.5" y="25" width="7.5" height="7" fill="#c99a5c" ${S}/>
        <path d="M37.5 28.5h7.5" stroke="#8a5a30" stroke-width="1"/>`,

    // 大工：のこぎりと丸太・板
    carpenter: `
        <path d="M11 19h24v6.5L11 23z" fill="#d4d8de" ${S}/>
        <path d="M12 23.1l1.5 1.8 1.5-1.6 1.5 1.8 1.5-1.6 1.5 1.8 1.5-1.6 1.5 1.8 1.5-1.6 1.5 1.8 1.5-1.6 1.5 1.8 1.5-1.6 1.5 1.8 1.5-1.6 1.5 1.8" fill="none" stroke="#8a9098" stroke-width=".9"/>
        <path d="M34 17h8.5a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H34z" fill="#8a5a30" ${S}/>
        <rect x="37.5" y="20.5" width="4.5" height="6" rx="1.5" fill="#e8d6ad" ${S}/>
        <rect x="27" y="36" width="22" height="5" fill="#d8a868" ${S}/>
        <path d="M30 38.5h6M40 38.5h6" stroke="#a87a48" stroke-width=".9"/>
        <circle cx="16" cy="37.5" r="4.5" fill="#c99a5c" ${S}/>
        <circle cx="25" cy="37.5" r="4.5" fill="#c99a5c" ${S}/>
        <circle cx="20.5" cy="30" r="4.5" fill="#c99a5c" ${S}/>
        <circle cx="16" cy="37.5" r="1.8" fill="none" stroke="#8a5a30" stroke-width=".9"/>
        <circle cx="25" cy="37.5" r="1.8" fill="none" stroke="#8a5a30" stroke-width=".9"/>
        <circle cx="20.5" cy="30" r="1.8" fill="none" stroke="#8a5a30" stroke-width=".9"/>`,

    // 教会：尖塔と十字
    church: `
        <path d="M12 42V29h20v13z" fill="${WALL}" ${S}/>
        <path d="M10.5 30l11.5-8 11.5 8z" fill="#5a6a8a" ${S}/>
        <circle cx="22" cy="34" r="2.6" fill="#d2463a" ${S}/>
        <path d="M31 42V21h11v21z" fill="${WALL}" ${S}/>
        <path d="M30 21.5l6.5-13 6.5 13z" fill="#5a6a8a" ${S}/>
        <path d="M36.5 8.5V2.5M34 4.6h5" stroke="#c9a030" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M34 42v-6a2.5 2.5 0 0 1 5 0v6z" fill="#6b4626" ${S}/>
        <path d="M35 30v-3a1.5 1.5 0 0 1 3 0v3z" fill="${DARK}"/>
        <path d="M15 40v-3a1.3 1.3 0 0 1 2.6 0v3zM26.4 40v-3a1.3 1.3 0 0 1 2.6 0v3z" fill="#5a6f8a"/>`,

    // 市場：日よけの屋台と品物
    market: `
        <path d="M15 24v18M45 24v18" stroke="#6b4626" stroke-width="2"/>
        <path d="M10 25l4-10h32l4 10z" fill="#f5efe0" ${S}/>
        <path d="M14 15h6.4l-2 10H10zM26.8 15h6.4l.6 10h-8.6zM39.6 15H46l4 10h-8.4z" fill="#d2463a"/>
        <path d="M10 25l4-10h32l4 10z" fill="none" ${S}/>
        <path d="M10 25a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" fill="#f5efe0" ${S}/>
        <rect x="13" y="33" width="34" height="9" fill="#a8723f" ${S}/>
        <path d="M13 37h34" stroke="#7a4f2c" stroke-width=".9"/>
        <circle cx="18" cy="30.5" r="2.5" fill="#d2463a" ${S}/><circle cx="22.5" cy="30.8" r="2.3" fill="#e8b23a" ${S}/>
        <circle cx="27" cy="30.5" r="2.5" fill="#d2463a" ${S}/>
        <path d="M32 33l1.5-5h7l1.5 5z" fill="#d8a868" ${S}/>
        <circle cx="45" cy="31" r="2" fill="#7aa83a" ${S}/>`,

    // 宿屋：窓の多い木組みの家とベッドの看板
    boardingHouse: `
        <path d="M13 42V19h24v23z" fill="${WALL}" ${S}/>
        <path d="M10.5 20.5L25 10l14.5 10.5z" fill="${ROOF}" ${S}/>
        <path d="M13 30.5h24M25 19v4M25 34v8" stroke="${WOOD}" stroke-width="1.4"/>
        <rect x="15.5" y="22" width="6" height="5.5" fill="#8fb8d8" ${S}/>
        <rect x="28.5" y="22" width="6" height="5.5" fill="#8fb8d8" ${S}/>
        <rect x="15.5" y="33.5" width="6" height="5.5" fill="#8fb8d8" ${S}/>
        <rect x="28.5" y="33.5" width="6" height="5.5" fill="#8fb8d8" ${S}/>
        <path d="M18.5 22v5.5M31.5 22v5.5M18.5 33.5V39M31.5 33.5V39" stroke="${L}" stroke-width=".8"/>
        <path d="M23 42v-6a2 2 0 0 1 4 0v6z" fill="#6b4626" ${S}/>
        <path d="M37 24h11" stroke="${L}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M40 24v3M47 24v3" stroke="${L}" stroke-width=".9"/>
        <rect x="38.5" y="27" width="10" height="8" rx="1" fill="#d8a868" ${S}/>
        <path d="M40.3 33.5v-3.7M40.3 32h6.4v1.5" fill="none" stroke="${L}" stroke-width="1" stroke-linecap="round"/>
        <rect x="41.2" y="29.7" width="2.2" height="1.5" rx=".7" fill="#ffffff" stroke="${L}" stroke-width=".6"/>
        <path d="M43.8 31.2v-1.4h2.4a.6.6 0 0 1 .6.6v.8" fill="#8fb8d8" stroke="${L}" stroke-width=".6"/>`,

    // 銀行：柱の並ぶ建物と銀貨
    bank: `
        <path d="M11 22.5l19-10.5 19 10.5z" fill="#d9d2c0" ${S}/>
        <rect x="12" y="22.5" width="36" height="3.5" fill="#d9d2c0" ${S}/>
        <rect x="14" y="26" width="4" height="12" fill="#ece6d6" ${S}/>
        <rect x="20.5" y="26" width="4" height="12" fill="#ece6d6" ${S}/>
        <rect x="35.5" y="26" width="4" height="12" fill="#ece6d6" ${S}/>
        <rect x="42" y="26" width="4" height="12" fill="#ece6d6" ${S}/>
        <rect x="10.5" y="38" width="39" height="4" fill="#b8b2a6" ${S}/>
        <circle cx="30" cy="32" r="5.5" fill="#c9ced6" stroke="#5f6670" stroke-width="1.2"/>
        <circle cx="30" cy="32" r="3.6" fill="none" stroke="#8a919b" stroke-width=".9"/>
        <path d="M27.8 30.3a2.6 2.6 0 0 1 3.4-.8" fill="none" stroke="#ffffff" stroke-width=".9" stroke-linecap="round"/>
        <circle cx="30" cy="18.5" r="1.8" fill="#c9ced6" stroke="#5f6670" stroke-width=".9"/>`,

    // 市役所：時計塔のある広い建物
    cityHall: `
        <path d="M11 42V28h38v14z" fill="#d9b48a" ${S}/>
        <path d="M10 28.5l5-4.5h30l5 4.5z" fill="${ROOF}" ${S}/>
        <path d="M24 42V14h12v28z" fill="#e2c49c" ${S}/>
        <path d="M22.5 14.5l7.5-9 7.5 9z" fill="#4b5d7a" ${S}/>
        <circle cx="30" cy="21" r="4.2" fill="#ffffff" ${S}/>
        <path d="M30 18.6V21l1.8 1.2" fill="none" stroke="${L}" stroke-width="1" stroke-linecap="round"/>
        <path d="M27.5 42v-6.5a2.5 2.5 0 0 1 5 0V42z" fill="#6b4626" ${S}/>
        <path d="M28.6 31v-2.5a1.4 1.4 0 0 1 2.8 0V31z" fill="#5a6f8a"/>
        <rect x="13.5" y="31" width="3.5" height="5" fill="#5a6f8a" ${S}/>
        <rect x="19" y="31" width="3.5" height="5" fill="#5a6f8a" ${S}/>
        <rect x="37.5" y="31" width="3.5" height="5" fill="#5a6f8a" ${S}/>
        <rect x="43" y="31" width="3.5" height="5" fill="#5a6f8a" ${S}/>`,

    // 見張り塔：細く高い石の塔
    watchtower: `
        <path d="M30 9.5V3" stroke="${L}" stroke-width="1.1"/>
        <path d="M30 3l5.5 1.8L30 6.6z" fill="#d2463a" ${S}/>
        <path d="M25.5 42.5l1.8-24h5.4l1.8 24z" fill="#b8b2a6" ${S}/>
        <path d="M23 18.5h14l-3 3.5h-8z" fill="#9a948a" ${S}/>
        <path d="M21.25 18.5V10h2.5v2.5h2.5V10h2.5v2.5h2.5V10h2.5v2.5h2.5V10h2.5v8.5z" fill="${STONE}" ${S}/>
        <rect x="29" y="25" width="2" height="4.5" rx="1" fill="${DARK}"/>
        <rect x="29" y="32" width="2" height="4" rx="1" fill="${DARK}"/>
        <path d="M27.5 28h1M31.5 34h1.5M27 38.5h2" stroke="#8a8478" stroke-width=".9"/>
        <path d="M18 43h24" stroke="#6b8a3a" stroke-width="1.6" stroke-linecap="round"/>`,

    // 牛：白黒のぶち（左向き）
    cow: `
        ${legs([22, 26.5, 36, 40.5], 33, 42, L)}
        <path d="M45 26q4 3 2.5 9" fill="none" stroke="${L}" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="47.3" cy="35.5" r="1.3" fill="${L}"/>
        <rect x="19" y="21" width="27" height="15" rx="7" fill="#ffffff" ${S}/>
        <path d="M27 21.5c3 2 2 6 -1 7-3 1-5-2-4.5-5.5zM36 25c3-1 6 1 5.5 4.5-.5 3-4 4.5-6.5 2.5-2-2-1-6 1-7z" fill="#2a2420"/>
        <path d="M13 18.5q-3-1-3-5 2.5 1.5 5 3.5zM20 18.5q3-1 3-5-2.5 1.5-5 3.5z" fill="#e8dcc0" ${S}/>
        <path d="M11 18h11v8a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4z" fill="#ffffff" ${S}/>
        <rect x="11" y="25" width="11" height="6" rx="3" fill="#f0b0b0" ${S}/>
        <circle cx="14.5" cy="22" r="1" fill="${DARK}"/><circle cx="18.5" cy="22" r="1" fill="${DARK}"/>
        <path d="M11.5 19.5l-3 1 2.5 1.5M21.5 19.5l3 1-2.5 1.5" fill="#ffffff" ${S}/>`,

    // 豚：桃色（左向き）
    pig: `
        ${legs([23, 27.5, 36, 40.5], 33, 41, '#c97a86')}
        <path d="M45.5 27q4-1 3 2t2-1.5" fill="none" stroke="${L}" stroke-width="1.2" stroke-linecap="round"/>
        <ellipse cx="32" cy="29" rx="14" ry="8.5" fill="#f2a8b4" ${S}/>
        <path d="M20 22l-1-5 5 3z" fill="#e88a9a" ${S}/>
        <circle cx="18" cy="28" r="6.5" fill="#f2a8b4" ${S}/>
        <ellipse cx="12.5" cy="29.5" rx="2.4" ry="3" fill="#e88a9a" ${S}/>
        <circle cx="12.3" cy="28.5" r=".6" fill="${L}"/><circle cx="12.3" cy="30.6" r=".6" fill="${L}"/>
        <circle cx="17" cy="26" r="1" fill="${DARK}"/>`,

    // 羊：もこもこの白い毛と黒い顔（左向き）
    sheep: `
        ${legs([23, 27, 36, 40], 33, 42, '#2a2420')}
        <path d="M21 24a4 4 0 0 1 6-3.5 4 4 0 0 1 6.5 0 4 4 0 0 1 6.5 0 4 4 0 0 1 6 4 4 4 0 0 1 1.5 6.5 4 4 0 0 1-5 4.5 4 4 0 0 1-6.5 1 4 4 0 0 1-6.5 0 4 4 0 0 1-6.5-1.5 4 4 0 0 1-2-6.5 4 4 0 0 1 0-4.5z" fill="#fbf8f0" ${S}/>
        <path d="M17.5 21.5h6l1 6a4.5 4.5 0 0 1-4 5.5 4.5 4.5 0 0 1-4.5-5z" fill="#2a2420" ${S}/>
        <path d="M17 22.5l-4 1.5 3.5 1.5" fill="#2a2420" ${S}/>
        <path d="M17 19.5a3 3 0 0 1 6 0 3 3 0 0 1 2 2.5h-9z" fill="#fbf8f0" ${S}/>
        <circle cx="19" cy="25.5" r="1" fill="#ffffff"/>`,

    // 鶏：茶色のめんどり（左向き）
    chicken: `
        <path d="M27 36v5.5M32 36v5.5M25.5 41.5h3M30.5 41.5h3" stroke="#d89a2a" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M39 26l6-8 1.5 6 2.5-3-.5 9z" fill="#5a3a20" ${S}/>
        <path d="M22 26c0 7 4 11 11 11s10-4 10-9-3-6-8-6c-3 0-6-3-8-3s-5 3-5 7z" fill="#b8692e" ${S}/>
        <path d="M29 28c3 3 7 3 9 1" fill="none" stroke="#7a4420" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="21.5" cy="20" r="5" fill="#b8692e" ${S}/>
        <path d="M17.5 16.5a1.6 1.6 0 0 1 2-2.2 1.6 1.6 0 0 1 2.5-.5 1.6 1.6 0 0 1 2.5 1l-1 2.2h-5z" fill="#d2342a" ${S}/>
        <path d="M17 19.5l-4 1.5 4 1.2z" fill="#e8b23a" ${S}/>
        <path d="M17.5 22.5q-.5 3 1.5 3.5l1-3z" fill="#d2342a" stroke="${L}" stroke-width=".8"/>
        <circle cx="20" cy="19" r="1" fill="${DARK}"/>`,

    // 船：白い帆の帆船
    ship: `
        <path d="M28 33V7.5" stroke="#5a3a20" stroke-width="1.8"/>
        <path d="M28 7.5l6 2-6 2z" fill="#d2463a" ${S}/>
        <path d="M20 11.5h15.5c1.5 6 1.5 12 0 18H20c1.5-6 1.5-12 0-18z" fill="#f8f4e8" ${S}/>
        <path d="M27.5 15.5v10" stroke="#d6cdb4" stroke-width="1"/>
        <path d="M37 16l9 15.5h-9z" fill="#f8f4e8" ${S}/>
        <path d="M11 32.5h38l-5.5 8h-27z" fill="#9a6a3e" ${S}/>
        <path d="M14 35.5h32" stroke="#6b4626" stroke-width="1"/>
        <circle cx="21" cy="38" r=".9" fill="${DARK}"/><circle cx="26" cy="38" r=".9" fill="${DARK}"/><circle cx="31" cy="38" r=".9" fill="${DARK}"/>
        <path d="M10.5 43.5q2.5-2 5 0t5 0 5 0 5 0 5 0 5 0 5 0 5 0" fill="none" stroke="#d6ecfa" stroke-width="1.4" stroke-linecap="round"/>`,
};

export const ICON_ART = {
    // 労働者：人の上半身（currentColor で塗る）
    worker: `
        <circle cx="12" cy="7" r="4.3" fill="currentColor" ${S}/>
        <path d="M3.5 22c0-6 3.8-9.5 8.5-9.5s8.5 3.5 8.5 9.5z" fill="currentColor" ${S}/>`,

    // 銀貨
    silver: `
        <circle cx="12" cy="12" r="9.5" fill="#c9ced6" stroke="#5f6670" stroke-width="1.4"/>
        <circle cx="12" cy="12" r="6.5" fill="#dde1e6" stroke="#8a919b" stroke-width="1"/>
        <path d="M12 8.5l1.1 2.4 2.4.3-1.8 1.7.5 2.5-2.2-1.3-2.2 1.3.5-2.5-1.8-1.7 2.4-.3z" fill="#8a919b"/>
        <path d="M7.5 8.5a6 6 0 0 1 3-2.4" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>`,

    // 商品：荷を積んだ箱（currentColor で塗る）
    goods: `
        <rect x="2.5" y="13" width="9.5" height="8.5" rx=".6" fill="currentColor" ${S}/>
        <rect x="12" y="13" width="9.5" height="8.5" rx=".6" fill="currentColor" ${S}/>
        <rect x="12" y="13" width="9.5" height="8.5" rx=".6" fill="#000" opacity=".15"/>
        <rect x="7" y="4.5" width="10" height="8.5" rx=".6" fill="currentColor" ${S}/>
        <path d="M2.5 17.25h9.5M12 17.25h9.5M7 8.75h10" stroke="${L}" stroke-width=".9"/>
        <path d="M4.5 13v8.5M10 13v8.5M14 13v8.5M19.5 13v8.5M9 4.5V13M15 4.5V13" stroke="${L}" stroke-width=".6" opacity=".55"/>`,
};
