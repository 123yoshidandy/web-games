/**
 * 絵（すべて自作の SVG）
 * 地形は自然の淡い色に、色に頼らなくても見分けられる模様を重ねる（山：三角、森：木、草原：草、湿地：葦、川：波）
 * 動物は丸い顔の図柄（symbol）を一度だけページに入れ、use で使い回す
 */

import { toPixel, DIRS } from './hex.js';

export const HABITATS = {
    mountain: { name: '山', color: '#b9b3c3', deep: '#8f879c', pattern: 'p-mountain' },
    forest: { name: '森', color: '#8fb385', deep: '#5d8556', pattern: 'p-forest' },
    prairie: { name: '草原', color: '#ead68f', deep: '#c2a94e', pattern: 'p-prairie' },
    wetland: { name: '湿地', color: '#a9cfc0', deep: '#6d9f8c', pattern: 'p-wetland' },
    river: { name: '川', color: '#9cc6e4', deep: '#5f95bd', pattern: 'p-river' }
};
export const HABITAT_ORDER = ['mountain', 'forest', 'prairie', 'wetland', 'river'];

export const ANIMALS = {
    bear: { name: 'クマ', color: '#8a5d3f', light: '#e9d6c4' },
    elk: { name: 'ヘラジカ', color: '#b98b52', light: '#f1e2c8' },
    salmon: { name: 'サケ', color: '#e07a6c', light: '#f8dcd5' },
    hawk: { name: 'タカ', color: '#5f8fbf', light: '#d9e6f2' },
    fox: { name: 'キツネ', color: '#e58a37', light: '#f9e0c6' }
};
export const ANIMAL_ORDER = ['bear', 'elk', 'salmon', 'hawk', 'fox'];

// 六角の角（先の尖った向き）
export function hexCorners(cx, cy, size) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * (60 * i - 30);
        return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
    });
}

export const hexPoints = (cx, cy, size) => hexCorners(cx, cy, size).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

// 辺 d（東から反時計回り）の両端の角。画面は y が下向きなので、角度は時計回りに数える
function edgeCorners(cx, cy, size, d) {
    const a1 = Math.PI / 180 * (-60 * d - 30);
    const a2 = Math.PI / 180 * (-60 * d + 30);
    return [[cx + size * Math.cos(a1), cy + size * Math.sin(a1)], [cx + size * Math.cos(a2), cy + size * Math.sin(a2)]];
}

// 辺 rot・rot+1・rot+2 の側の半分の多角形
function halfPoints(cx, cy, size, rot) {
    const pts = [];
    for (let k = 0; k < 3; k++) {
        const [p1, p2] = edgeCorners(cx, cy, size, (rot + k) % 6);
        if (k === 0) pts.push(p2);
        pts.push(p1);
    }
    return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

const ICON_POS = {
    1: [[0, 0]],
    2: [[-0.3, 0], [0.3, 0]],
    3: [[-0.3, -0.18], [0.3, -0.18], [0, 0.3]]
};

/**
 * タイル1枚の絵（<g> の文字列）
 * tile: { habitats, wildlife, keystone }、rot：回転、token：置いた動物（なければ null）
 * opts.cls：外側の <g> に付けるクラス、opts.attrs：外側に付ける属性
 */
export function tileSvg(tile, rot, cx, cy, size, { token = null, cls = '', attrs = '' } = {}) {
    const [a, b] = tile.habitats;
    const body = [];
    if (!b) {
        body.push(`<polygon points="${hexPoints(cx, cy, size)}" fill="${HABITATS[a].color}"/>`);
        body.push(`<polygon points="${hexPoints(cx, cy, size)}" fill="url(#${HABITATS[a].pattern})"/>`);
    } else {
        const ha = halfPoints(cx, cy, size, rot);
        const hb = halfPoints(cx, cy, size, (rot + 3) % 6);
        body.push(`<polygon points="${ha}" fill="${HABITATS[a].color}"/><polygon points="${ha}" fill="url(#${HABITATS[a].pattern})"/>`);
        body.push(`<polygon points="${hb}" fill="${HABITATS[b].color}"/><polygon points="${hb}" fill="url(#${HABITATS[b].pattern})"/>`);
    }
    body.push(`<polygon class="tile-edge" points="${hexPoints(cx, cy, size * 0.97)}" fill="none"/>`);
    if (token) {
        const r = size * 0.62;
        body.push(`<circle cx="${cx}" cy="${cy + size * 0.06}" r="${r * 0.98}" class="token-shadow"/>`);
        body.push(`<use href="#a-${token}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"/>`);
    } else {
        const list = tile.wildlife;
        const r = size * (list.length === 1 ? (tile.keystone ? 0.3 : 0.3) : list.length === 2 ? 0.27 : 0.25);
        if (tile.keystone) body.push(`<circle cx="${cx}" cy="${cy}" r="${r * 1.32}" class="keystone-ring"/>`);
        ICON_POS[list.length].forEach(([dx, dy], i) => {
            const x = cx + dx * size;
            const y = cy + dy * size;
            body.push(`<circle cx="${x}" cy="${y}" r="${r * 1.04}" class="slot"/>`);
            body.push(`<use href="#a-${list[i]}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" opacity=".78"/>`);
        });
    }
    return `<g class="tile ${cls}" ${attrs}>${body.join('')}</g>`;
}

// 動物のトークン1つ（単独の <svg>）
export function tokenSvg(animal, px = 34, extra = '') {
    return `<svg class="token-svg" viewBox="-10 -10 20 20" width="${px}" height="${px}" aria-label="${ANIMALS[animal].name}" ${extra}><use href="#a-${animal}" x="-10" y="-10" width="20" height="20"/></svg>`;
}

// タイル1枚（単独の <svg>）
export function tileOnlySvg(tile, rot = 0, px = 56, token = null) {
    const s = 10;
    return `<svg class="tile-svg" viewBox="-9.2 -10.2 18.4 20.4" width="${px}" height="${px * 20.4 / 18.4}">${tileSvg(tile, rot, 0, 0, s, { token })}</svg>`;
}

// 地形の小さな見本（凡例・得点表に使う）
export function habitatSwatch(habitat, px = 18) {
    return `<svg class="hab-svg" viewBox="-10 -10 20 20" width="${px}" height="${px}" aria-label="${HABITATS[habitat].name}"><polygon points="${hexPoints(0, 0, 9.6)}" fill="${HABITATS[habitat].color}"/><polygon points="${hexPoints(0, 0, 9.6)}" fill="url(#${HABITATS[habitat].pattern})"/><polygon points="${hexPoints(0, 0, 9.2)}" class="tile-edge" fill="none"/></svg>`;
}

// 自然トークン（松かさ形の葉）
export const natureSvg = (px = 20) => `<svg class="nature-svg" viewBox="-10 -10 20 20" width="${px}" height="${px}" aria-label="自然トークン"><use href="#nature" x="-10" y="-10" width="20" height="20"/></svg>`;

export const icon = (id, label) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>${label ? `<span class="sr">${label}</span>` : ''}`;

// 一度だけページに入れる図柄
export function symbolsSvg() {
    const A = ANIMALS;
    const eye = (x, y, r = 1.15) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2b2420"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff"/>`;
    const cheek = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="1.3" ry=".8" fill="#f2a3a0" opacity=".75"/>`;
    const disc = (animal) => `<circle r="9.4" fill="${A[animal].light}" stroke="${A[animal].color}" stroke-width="1.1"/>`;
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="a-bear" viewBox="-10 -10 20 20">${disc('bear')}
        <circle cx="-4.6" cy="-4.4" r="2.5" fill="${A.bear.color}"/><circle cx="4.6" cy="-4.4" r="2.5" fill="${A.bear.color}"/>
        <circle cx="-4.6" cy="-4.4" r="1.2" fill="#c99a78"/><circle cx="4.6" cy="-4.4" r="1.2" fill="#c99a78"/>
        <ellipse cx="0" cy="0.8" rx="6.6" ry="5.9" fill="${A.bear.color}"/>
        <ellipse cx="0" cy="2.7" rx="3.1" ry="2.3" fill="#e5c3a3"/>
        <ellipse cx="0" cy="1.6" rx="1.2" ry=".85" fill="#2b2420"/>
        <path d="M-0.9 3.3 Q0 4.1 0.9 3.3" stroke="#2b2420" stroke-width=".5" fill="none" stroke-linecap="round"/>
        ${eye(-2.6, -0.6)}${eye(2.6, -0.6)}${cheek(-4.2, 1.9)}${cheek(4.2, 1.9)}
    </symbol>
    <symbol id="a-elk" viewBox="-10 -10 20 20">${disc('elk')}
        <g stroke="#7a5532" stroke-width="1.1" stroke-linecap="round" fill="none">
            <path d="M-2.4 -3.6 L-4.6 -7.2 M-3.4 -5.3 L-6.6 -5.6 M-4 -6.4 L-3.6 -8.4"/>
            <path d="M2.4 -3.6 L4.6 -7.2 M3.4 -5.3 L6.6 -5.6 M4 -6.4 L3.6 -8.4"/>
        </g>
        <ellipse cx="-5.2" cy="-2.2" rx="2" ry="1.1" transform="rotate(-25 -5.2 -2.2)" fill="${A.elk.color}"/>
        <ellipse cx="5.2" cy="-2.2" rx="2" ry="1.1" transform="rotate(25 5.2 -2.2)" fill="${A.elk.color}"/>
        <path d="M-3.9 -2.6 Q0 -5 3.9 -2.6 Q4.6 2.6 2.6 5.4 Q0 7 -2.6 5.4 Q-4.6 2.6 -3.9 -2.6Z" fill="${A.elk.color}"/>
        <ellipse cx="0" cy="4.3" rx="2.4" ry="1.7" fill="#e8cfa6"/>
        <ellipse cx="-0.8" cy="4.2" rx=".45" ry=".35" fill="#2b2420"/><ellipse cx="0.8" cy="4.2" rx=".45" ry=".35" fill="#2b2420"/>
        ${eye(-1.8, 0.3, 1)}${eye(1.8, 0.3, 1)}${cheek(-3, 2.4)}${cheek(3, 2.4)}
    </symbol>
    <symbol id="a-salmon" viewBox="-10 -10 20 20">${disc('salmon')}
        <path d="M6.4 0 L9 -3.4 L8.6 0 L9 3.4Z" fill="${A.salmon.color}"/>
        <path d="M-7 0 Q-4 -5.4 2.6 -4 Q6.6 -2.6 7 0 Q6.6 2.6 2.6 4 Q-4 5.4 -7 0Z" fill="${A.salmon.color}"/>
        <path d="M-1 -4.4 Q1.6 -6.8 3.6 -3.6Z" fill="#c95f53"/>
        <path d="M-3.6 2 Q-1 3.4 2.6 2.4" stroke="#f7c3ba" stroke-width="1" fill="none" stroke-linecap="round"/>
        ${eye(-3.8, -0.9, 1)}
        <path d="M-6.4 1.2 Q-5.6 1.9 -4.8 1.4" stroke="#7d2d24" stroke-width=".55" fill="none" stroke-linecap="round"/>
        ${cheek(-3.9, 1.4)}
    </symbol>
    <symbol id="a-hawk" viewBox="-10 -10 20 20">${disc('hawk')}
        <path d="M-7 1 Q-8 -3 -5 -5 Q-6 -1 -4 1Z M7 1 Q8 -3 5 -5 Q6 -1 4 1Z" fill="#46729e"/>
        <ellipse cx="0" cy="0.4" rx="5.4" ry="6" fill="${A.hawk.color}"/>
        <ellipse cx="0" cy="2.6" rx="3.4" ry="3.4" fill="#eef3f8"/>
        <path d="M-4 -2.6 L-1 -1.6 M4 -2.6 L1 -1.6" stroke="#2e4f72" stroke-width=".8" stroke-linecap="round"/>
        ${eye(-2.2, -0.4, 1.05)}${eye(2.2, -0.4, 1.05)}
        <path d="M-1.3 0.8 L1.3 0.8 L0 3.2Z" fill="#f2b33d"/>
        <path d="M-1.6 -5.2 Q0 -7.2 1.6 -5.2" stroke="${A.hawk.color}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </symbol>
    <symbol id="a-fox" viewBox="-10 -10 20 20">${disc('fox')}
        <path d="M-6.4 -7.4 L-2.4 -3 L-6.6 -1.4Z M6.4 -7.4 L2.4 -3 L6.6 -1.4Z" fill="${A.fox.color}"/>
        <path d="M-5.6 -5.6 L-3.6 -3.3 L-5.7 -2.5Z M5.6 -5.6 L3.6 -3.3 L5.7 -2.5Z" fill="#7a3f16"/>
        <path d="M-7.2 -1.8 Q0 -6.2 7.2 -1.8 Q5.6 4 0 6.4 Q-5.6 4 -7.2 -1.8Z" fill="${A.fox.color}"/>
        <path d="M-6.6 -0.6 Q-3 1 0 6.3 Q-4.4 4.4 -6.6 -0.6Z M6.6 -0.6 Q3 1 0 6.3 Q4.4 4.4 6.6 -0.6Z" fill="#fff6ea"/>
        <ellipse cx="0" cy="4.4" rx=".95" ry=".7" fill="#2b2420"/>
        ${eye(-2.5, -0.9, 1)}${eye(2.5, -0.9, 1)}${cheek(-3.8, 1.6)}${cheek(3.8, 1.6)}
    </symbol>
    <symbol id="nature" viewBox="-10 -10 20 20">
        <circle r="9.4" fill="#f3ead2" stroke="#9a7b45" stroke-width="1"/>
        <g fill="#a8783e" stroke="#7d5427" stroke-width=".5">
            <ellipse cx="0" cy="-3.4" rx="2.6" ry="2"/><ellipse cx="-2.6" cy="-0.4" rx="2.6" ry="2"/><ellipse cx="2.6" cy="-0.4" rx="2.6" ry="2"/>
            <ellipse cx="0" cy="2.4" rx="2.6" ry="2"/><ellipse cx="-1.6" cy="5" rx="1.9" ry="1.5"/><ellipse cx="1.6" cy="5" rx="1.9" ry="1.5"/>
        </g>
        <path d="M0 -5.4 L0 -8" stroke="#5d8556" stroke-width="1.3" stroke-linecap="round"/>
    </symbol>
    <pattern id="p-mountain" patternUnits="userSpaceOnUse" width="7" height="6"><path d="M0.6 5 L2.6 2 L4.6 5" fill="none" stroke="#857c93" stroke-width=".7" opacity=".55"/></pattern>
    <pattern id="p-forest" patternUnits="userSpaceOnUse" width="6.4" height="7"><path d="M3.2 1 L5 4.6 L1.4 4.6Z" fill="#5d8556" opacity=".45"/><path d="M3.2 4.6 L3.2 5.8" stroke="#6b4f33" stroke-width=".6" opacity=".45"/></pattern>
    <pattern id="p-prairie" patternUnits="userSpaceOnUse" width="5.6" height="5.6"><path d="M1.6 4.4 Q2 2.6 1.4 1.4 M2.6 4.4 Q2.6 3 3.4 2" fill="none" stroke="#b49a3f" stroke-width=".55" opacity=".6" stroke-linecap="round"/></pattern>
    <pattern id="p-wetland" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M2 5 L2 2 M3.4 5 L3.4 1.6" stroke="#5f8f7d" stroke-width=".55" opacity=".55" stroke-linecap="round"/><ellipse cx="2" cy="1.6" rx=".45" ry=".8" fill="#7b5a3a" opacity=".5"/></pattern>
    <pattern id="p-river" patternUnits="userSpaceOnUse" width="7" height="4"><path d="M0 2.2 Q1.75 0.8 3.5 2.2 T7 2.2" fill="none" stroke="#f4fbff" stroke-width=".7" opacity=".7"/></pattern>
    <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/></symbol>
    <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8v.5"/><path d="M12 17.2v.1"/></symbol>
    <symbol id="i-log" viewBox="0 0 24 24"><path d="M5 5h14M5 10h14M5 15h10M5 20h7"/></symbol>
    <symbol id="i-score" viewBox="0 0 24 24"><path d="M5 20V11M12 20V5M19 20v-6"/></symbol>
    <symbol id="i-rotate" viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4v4h-4"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></symbol>
    <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></symbol>
    <symbol id="i-fit" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
    <symbol id="i-cards" viewBox="0 0 24 24"><rect x="4" y="6" width="11" height="14" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v12"/></symbol>
    <symbol id="i-bag" viewBox="0 0 24 24"><path d="M7 8h10l1.5 12h-13z"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0"/></symbol>
    <symbol id="i-swap" viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></symbol>
</defs></svg>`;
}

// 盤の座標（タイルの中心）
export const center = (q, r, size) => toPixel(q, r, size);
export { DIRS };
