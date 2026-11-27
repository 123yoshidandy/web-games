/**
 * 兵器の絵（自作の SVG。上から見た図で、右を向いている）
 * 色は軍ごとに差し替える。盤面（canvas）には画像にして描き、エディタのカードには SVG のまま入れる
 */

export const SIDE_COLORS = [
    { body: '#4f9be8', dark: '#1f4f86', light: '#b9dcff' },   // 自軍（青）
    { body: '#e2604f', dark: '#86281d', light: '#ffc4b8' }    // 敵軍（赤）
];

// 各図形は viewBox 0 0 32 32。b：本体、d：濃い色、l：明るい色
const SHAPES = {
    infantry: (c) => `
        <circle cx="13" cy="16" r="6.5" fill="${c.body}" stroke="${c.dark}" stroke-width="1.5"/>
        <circle cx="13" cy="16" r="3" fill="${c.light}"/>
        <rect x="15" y="17.5" width="12" height="2.4" rx="1" fill="${c.dark}"/>
        <rect x="9" y="8.5" width="4" height="4" rx="1.5" fill="${c.dark}"/>
        <rect x="9" y="19.5" width="4" height="4" rx="1.5" fill="${c.dark}"/>`,
    tank: (c) => `
        <rect x="4" y="6" width="22" height="5" rx="2" fill="${c.dark}"/>
        <rect x="4" y="21" width="22" height="5" rx="2" fill="${c.dark}"/>
        <rect x="5" y="9" width="20" height="14" rx="3" fill="${c.body}"/>
        <rect x="17" y="14.5" width="13" height="3" rx="1.2" fill="${c.dark}"/>
        <circle cx="14" cy="16" r="5.5" fill="${c.light}" stroke="${c.dark}" stroke-width="1.5"/>`,
    rocket: (c) => `
        <rect x="3" y="9" width="24" height="14" rx="2.5" fill="${c.body}"/>
        <rect x="22" y="10" width="6" height="12" rx="2" fill="${c.dark}"/>
        <rect x="5" y="11" width="15" height="3" rx="1.5" fill="${c.light}"/>
        <rect x="5" y="14.5" width="15" height="3" rx="1.5" fill="${c.light}"/>
        <rect x="5" y="18" width="15" height="3" rx="1.5" fill="${c.light}"/>
        <path d="M20 11h3M20 14.5h3M20 18h3" stroke="${c.dark}" stroke-width="2"/>`,
    missile: (c) => `
        <rect x="3" y="9" width="24" height="14" rx="2.5" fill="${c.body}"/>
        <rect x="22" y="10" width="6" height="12" rx="2" fill="${c.dark}"/>
        <path d="M5 12.5h11l4 1.5-4 1.5H5z" fill="${c.light}" stroke="${c.dark}" stroke-width="1"/>
        <path d="M5 17h11l4 1.5-4 1.5H5z" fill="${c.light}" stroke="${c.dark}" stroke-width="1"/>`,
    cannon: (c) => `
        <path d="M4 10l6-4h10l6 4v12l-6 4H10l-6-4z" fill="${c.body}" stroke="${c.dark}" stroke-width="1.5"/>
        <circle cx="15" cy="16" r="5" fill="${c.light}" stroke="${c.dark}" stroke-width="1.5"/>
        <rect x="17" y="12.5" width="13" height="2.2" rx="1" fill="${c.dark}"/>
        <rect x="17" y="17.3" width="13" height="2.2" rx="1" fill="${c.dark}"/>`,
    attacker: (c) => `
        <path d="M5 14h22l3 2-3 2H5z" fill="${c.body}" stroke="${c.dark}" stroke-width="1.2"/>
        <path d="M13 3h4l2 11h-6zM13 29h4l2-11h-6z" fill="${c.body}" stroke="${c.dark}" stroke-width="1.2"/>
        <path d="M4 9h3l2 5H6zM4 23h3l2-5H6z" fill="${c.dark}"/>
        <rect x="20" y="14.8" width="5" height="2.4" rx="1.2" fill="${c.light}"/>`,
    fighter: (c) => `
        <path d="M30 16 18 12.5 9 4H6l4 10H4l-2 2 2 2h6L6 28h3l9-8.5z" fill="${c.body}" stroke="${c.dark}" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M20 14.5l5 1.5-5 1.5z" fill="${c.light}"/>`,
    bomber: (c) => `
        <path d="M4 14.5h22l4 1.5-4 1.5H4z" fill="${c.body}" stroke="${c.dark}" stroke-width="1.2"/>
        <path d="M17 15 11 2H8l3 13zM17 17 11 30H8l3-13z" fill="${c.body}" stroke="${c.dark}" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M2 11h3l2 4H4zM2 21h3l2-4H4z" fill="${c.dark}"/>
        <circle cx="11" cy="7.5" r="1.6" fill="${c.dark}"/><circle cx="11" cy="24.5" r="1.6" fill="${c.dark}"/>
        <rect x="21" y="15" width="4" height="2" rx="1" fill="${c.light}"/>`
};

// 兵器の SVG（文字列）。flip で左向き
export function armSvg(type, side = 0, { size = 32, flip = false } = {}) {
    const shape = SHAPES[type](SIDE_COLORS[side]);
    const body = flip ? `<g transform="translate(32 0) scale(-1 1)">${shape}</g>` : shape;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

// 盤面に描く画像（side・向きごとに1枚ずつ作って使い回す）
const cache = new Map();
export function armImage(type, side, flip) {
    const key = `${type}:${side}:${flip ? 1 : 0}`;
    if (!cache.has(key)) {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(armSvg(type, side, { size: 64, flip }))}`;
        cache.set(key, image);
    }
    return cache.get(key);
}
