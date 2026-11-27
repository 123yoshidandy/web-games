/**
 * 地図の描画（SVG）
 * 海と陸は geo.js の海岸線から、都市・道・州は map.js から描く。家と植民者はビューから描く
 * 押せるもの（植民者・道・都市・州のボーナス）には data-* を付け、光らせるものには glow を付ける
 */

import { SEAS, ISLANDS, project, BOUNDS } from './geo.js';
import { CITIES, ROMA, ROADS, PROVINCES, CITY } from './map.js';
import { BONUS_COINS } from './cards.js';
import { GOOD_COLORS, PLAYER_COLORS } from './art.js';

// 描く範囲（都市のまわりだけにして、地図を大きく見せる）
const VIEW = (() => {
    const [x0, y0] = project([-12.2, 52.6]);
    const [x1, y1] = project([39.6, 28.2]);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
})();
export const MAP_RATIO = VIEW.w / VIEW.h;

const P = (city) => project([CITY[city].lon, CITY[city].lat]);
// 描く範囲の外の点は、範囲の端に寄せる（はみ出して測られないように）
const clampPoint = ([x, y]) => [Math.min(VIEW.x + VIEW.w, Math.max(VIEW.x, x)), Math.min(VIEW.y + VIEW.h, Math.max(VIEW.y, y))];
const pts = (list) => list.map(p => clampPoint(project(p)).join(',')).join(' ');

// 道の線（海路は、通る点を通る曲線）と、真ん中の点
function roadGeometry(road) {
    const a = P(road.a);
    const b = P(road.b);
    if (!road.via) {
        return { d: `M${a[0]},${a[1]} L${b[0]},${b[1]}`, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    }
    const v = project(road.via);
    const c = [2 * v[0] - (a[0] + b[0]) / 2, 2 * v[1] - (a[1] + b[1]) / 2];
    return { d: `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}`, mid: v };
}
const GEOMETRY = Object.fromEntries(ROADS.map(r => [r.id, roadGeometry(r)]));

// 地形と道は変わらないので、一度だけ文字にしておく
const STATIC = (() => {
    let s = `<rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" fill="#d8c79c"/>`;
    s += `<g class="sea" fill="#6f9fc2">${Object.values(SEAS).map(sea => `<polygon points="${pts(sea)}"/>`).join('')}</g>`;
    s += `<g class="land" fill="#d8c79c">${Object.values(ISLANDS).map(isle => `<polygon points="${pts(isle)}"/>`).join('')}</g>`;
    s += '<g class="roads">';
    ROADS.forEach(r => {
        s += `<path class="road ${r.kind}" d="${GEOMETRY[r.id].d}"/>`;
    });
    s += '</g>';
    void BOUNDS;
    return s;
})();

const CITY_R = 9;

// view：ゲームのビュー。ui：{ glowColonists, glowRoads, glowCities, glowProvinces, selectedColonist, lastCity }
export function renderMap(view, ui = {}) {
    const glowRoads = new Set(ui.glowRoads ?? []);
    const glowCities = new Set(ui.glowCities ?? []);
    const glowProvinces = new Set(ui.glowProvinces ?? []);
    const glowColonists = new Set(ui.glowColonists ?? []);
    let s = `<svg viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;
    s += STATIC;

    // 押せる道（光らせる）
    ROADS.forEach(r => {
        if (!glowRoads.has(r.id)) return;
        s += `<path class="road-glow ${r.kind}" d="${GEOMETRY[r.id].d}"/>`;
        s += `<path class="road-hit" data-road="${r.id}" d="${GEOMETRY[r.id].d}"/>`;
    });

    // 州：番号と名前、ボーナスの印
    PROVINCES.forEach(pr => {
        const [x, y] = project(pr.label);
        const bonus = view.bonus[pr.id];
        const glow = glowProvinces.has(pr.id);
        s += `<g class="province${glow ? ' glow' : ''}"${glow ? ` data-province="${pr.id}"` : ''} transform="translate(${x},${y})">`;
        s += `<text class="pr-name" y="-12">${pr.ja}</text>`;
        if (bonus.active) {
            s += `<rect class="bonus" x="-10" y="-8" width="20" height="20" rx="4" fill="${GOOD_COLORS[bonus.good]}"/>`;
            s += `<use href="#g-${bonus.good}" x="-7" y="-5" width="14" height="14" class="bonus-ico"/>`;
        } else {
            s += `<rect class="bonus coin" x="-10" y="-8" width="20" height="20" rx="4"/>`;
            s += `<use href="#i-coin" x="-8" y="-6" width="16" height="16"/>`;
            s += `<text class="coin-n" y="6">${BONUS_COINS[bonus.good]}</text>`;
        }
        if (glow) s += '<rect class="hit" x="-34" y="-26" width="68" height="44" fill="transparent"/>';
        s += '</g>';
    });

    // 都市
    [ROMA, ...CITIES].forEach(c => {
        const [x, y] = P(c.id);
        const rome = c.id === ROMA.id;
        const good = view.cityGoods[c.id];
        const glow = glowCities.has(c.id);
        s += `<g class="city${glow ? ' glow' : ''}${ui.lastCity === c.id ? ' last' : ''}"${glow ? ` data-city="${c.id}"` : ''} data-city-id="${c.id}" transform="translate(${x},${y})">`;
        if (rome) {
            s += `<circle r="${CITY_R + 3}" class="rome"/>`;
            s += `<path d="M-6 4h12M-5 4v-6M0 4v-6M5 4v-6M-7-3h14l-7-5z" class="rome-mark"/>`;
        } else {
            s += `<circle r="${CITY_R}" fill="${GOOD_COLORS[good]}" class="city-dot"/>`;
            s += `<use href="#g-${good}" x="-6" y="-6" width="12" height="12" class="city-ico"/>`;
        }
        s += `<text class="city-name" y="${rome ? 24 : 21}">${c.ja}</text>`;
        // 家：都市の右上から並べる
        const owners = view.houses[c.id] ?? [];
        owners.forEach((owner, i) => {
            const angle = -Math.PI / 2 + (i - (owners.length - 1) / 2) * 0.62;
            const hx = Math.cos(angle) * 15 - 5;
            const hy = Math.sin(angle) * 15 - 5;
            s += `<use href="#i-house" x="${hx.toFixed(1)}" y="${hy.toFixed(1)}" width="10" height="10" class="house" data-house="${c.id}:${owner}" fill="${PLAYER_COLORS[view.players[owner].color]}"/>`;
        });
        if (glow) s += `<circle r="${CITY_R + 9}" class="hit" fill="transparent"/>`;
        s += '</g>';
    });

    // 植民者：道の真ん中か、都市のまわり
    const inCity = {};
    view.colonists.forEach(col => {
        if (col.city !== null) (inCity[col.city] = inCity[col.city] ?? []).push(col);
    });
    const drawColonist = (col, x, y) => {
        const color = PLAYER_COLORS[view.players[col.owner].color];
        const glow = glowColonists.has(col.id);
        const sel = ui.selectedColonist === col.id;
        s += `<g class="colonist ${col.kind}${glow ? ' glow' : ''}${sel ? ' selected' : ''}"${glow ? ` data-colonist="${col.id}"` : ''} data-col-id="${col.id}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">`;
        s += `<circle r="8.5" class="col-bg"/>`;
        s += `<use href="#c-${col.kind}" x="-6.5" y="-6.5" width="13" height="13" fill="${color}"/>`;
        if (glow) s += '<circle r="15" class="hit" fill="transparent"/>';
        s += '</g>';
    };
    view.colonists.forEach(col => {
        if (col.road !== null) {
            const [x, y] = GEOMETRY[col.road].mid;
            drawColonist(col, x, y);
        }
    });
    Object.entries(inCity).forEach(([city, list]) => {
        const [cx, cy] = P(city);
        // 都市の上側に弧にして並べる（下の名前を隠さない）。多いときは外側にもう1列
        list.forEach((col, i) => {
            const row = i < 7 ? 0 : 1;
            const inRow = row === 0 ? Math.min(list.length, 7) : list.length - 7;
            const k = row === 0 ? i : i - 7;
            const radius = (city === ROMA.id ? 23 : 19) + row * 17;
            const spread = Math.min(Math.PI * 1.25, (inRow - 1) * 0.5);
            const angle = -Math.PI / 2 - spread / 2 + (inRow > 1 ? (k / (inRow - 1)) * spread : 0);
            drawColonist(col, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        });
    });
    s += '</svg>';
    return s;
}
