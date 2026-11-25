/**
 * 絵（すべて自作の SVG）
 * 駒は、台座・胴・頭を単純な図形の組み合わせで描く。白は象牙色、黒は焦げ茶で、どちらも濃い輪郭を付ける
 * 駒の絵は symbol として一度だけページに入れ、use で使い回す
 */

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flip: '<path d="M7 4v16"/><path d="M3.5 7.5L7 4l3.5 3.5"/><path d="M17 20V4"/><path d="M13.5 16.5L17 20l3.5-3.5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    draw: '<circle cx="12" cy="12" r="9"/><path d="M8 10h8M8 14h8"/>'
};

// 台座（どの駒も同じ）
const BASE = 'M21 87h58v-4c0-4.5-3-7.5-7.5-8.5h-43C24 75.5 21 78.5 21 83z';

// 駒の胴と頭（viewBox 0 0 100 100）。body は塗りと輪郭、line は飾りの線
const SHAPES = {
    p: {
        body: [
            'M50 19a11.5 11.5 0 0 0-7.2 20.4C37 41.6 34 45 34 48.5h32c0-3.5-3-6.9-8.8-9.1A11.5 11.5 0 0 0 50 19z',
            'M40.5 48.5c-.5 10-3.5 18-9.5 26h38c-6-8-9-16-9.5-26z'
        ]
    },
    r: {
        body: [
            'M29 18h9v7h7.5v-7h9v7H62v-7h9v15l-5 5H34l-5-5z',
            'M35 38h30l2.5 30h-35z',
            'M30 68h40v6.5H30z'
        ],
        line: ['M33 33h34']
    },
    n: {
        body: [
            'M35 74.5c-.5-10 3-18 11-25.5-5 1.5-10 3.5-15 5-5.5 1.6-10.5-1.7-10.5-7 0-3.3 2.2-6 5-8.3 6-4.7 10.4-9.6 13.5-15.7l2-9.5 6.2 7.2c13.3 1.2 23.3 11.8 24.8 27.3 1 11-1.5 19-4.5 26.5z'
        ],
        line: ['M58 22.5c7 5.5 11 14 11.5 26', 'M33.5 37.5l4.5 1'],
        dot: [[44.5, 29, 2.6], [25.5, 46.5, 1.4]]
    },
    b: {
        body: [
            'M50 21.5c-11 7.5-16.5 17-15 27 .9 5.8 6.5 9 15 9s14.1-3.2 15-9c1.5-10-4-19.5-15-27z',
            'M36 57.5h28v7H36z',
            'M40 64.5c-.3 4-3 7.5-8.5 10h37c-5.5-2.5-8.2-6-8.5-10z'
        ],
        line: ['M55 31l-8 11.5'],
        ball: [50, 16, 5]
    },
    q: {
        body: [
            'M23 34l9 30h36l9-30-12 15.5L60.5 26 53 46.5 50 23l-3 23.5L39.5 26 35 49.5z',
            'M31.5 64h37l-2 10.5h-33z'
        ],
        balls: [[23, 31, 4.5], [39.5, 23, 4.5], [50, 19.5, 4.5], [60.5, 23, 4.5], [77, 31, 4.5]]
    },
    k: {
        body: [
            'M46.5 7h7v6.5H60v7h-6.5v8h-7v-8H40v-7h6.5z',
            'M50 31.5c-4.7-4.6-10-6.6-15-6-6.5.8-10.5 5.4-10.5 12 0 9 5.6 17 10 25.5h31c4.4-8.5 10-16.5 10-25.5 0-6.6-4-11.2-10.5-12-5-.6-10.3 1.4-15 6z',
            'M34.5 63h31l-1.5 11.5H36z'
        ],
        line: ['M37 54h26']
    }
};

const COLORS = {
    w: { fill: 'url(#g-ivory)', stroke: '#2b241c', line: '#2b241c' },
    b: { fill: 'url(#g-ebony)', stroke: '#0d0b09', line: '#c9bca5' }
};

const DEFS = `
    <linearGradient id="g-ivory" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset=".55" stop-color="#f1e8d6"/><stop offset="1" stop-color="#cdbfa4"/></linearGradient>
    <linearGradient id="g-ebony" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a5d50"/><stop offset=".45" stop-color="#3a322b"/><stop offset="1" stop-color="#1a1613"/></linearGradient>`;

function pieceBody(letter, color) {
    const shape = SHAPES[letter];
    const c = COLORS[color];
    const stroke = `stroke="${c.stroke}" stroke-width="3" stroke-linejoin="round"`;
    const paths = [BASE, ...shape.body].map(d => `<path d="${d}"/>`).join('');
    const circles = [...(shape.balls ?? []), ...(shape.ball ? [shape.ball] : [])].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
    const lines = (shape.line ?? []).map(d => `<path d="${d}"/>`).join('');
    const dots = (shape.dot ?? []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
    return `<g fill="${c.fill}" ${stroke}>${paths}${circles}</g>`
        + (lines ? `<g fill="none" stroke="${c.line}" stroke-width="2.4" stroke-linecap="round">${lines}</g>` : '')
        + (dots ? `<g fill="${c.line}">${dots}</g>` : '');
}

export function symbolsSvg() {
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    const pieces = ['w', 'b'].flatMap(color => Object.keys(SHAPES).map(letter =>
        `<symbol id="p-${color}${letter}" viewBox="0 0 100 100">${pieceBody(letter, color)}</symbol>`)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${DEFS}</defs>${icons}${pieces}</svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 駒1つ。code は FEN の文字（白は大文字、黒は小文字）
export const pieceSvg = (code, cls = '') => {
    const color = code === code.toUpperCase() ? 'w' : 'b';
    return `<svg class="piece ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#p-${color}${code.toLowerCase()}"/></svg>`;
};

// 単体の SVG（アイコンの画像を作るときに使う）
export function standalonePieceSvg(code, size = 100) {
    const color = code === code.toUpperCase() ? 'w' : 'b';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}"><defs>${DEFS}</defs>${pieceBody(code.toLowerCase(), color)}</svg>`;
}

export const PIECE_NAME = { k: 'キング', q: 'クイーン', r: 'ルーク', b: 'ビショップ', n: 'ナイト', p: 'ポーン' };
export const COLOR_NAME = ['白', '黒'];
