/**
 * 絵（すべて自作の SVG）
 * 盤は緑のラシャに黒い線と4つの星。石は黒と白の丸い石で、光と影のグラデーションで立体感を付ける
 * 石の絵は symbol として一度だけページに入れ、use で使い回す
 */

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'
};

// 石（viewBox 0 0 100 100。中心 50,50、半径 44。下に薄い影）
const STONES = {
    black: `<ellipse cx="50" cy="55" rx="44" ry="42" fill="rgba(0,0,0,.4)"/>
        <circle cx="50" cy="50" r="44" fill="url(#g-black)"/>
        <ellipse cx="38" cy="32" rx="18" ry="11" fill="url(#g-black-hi)" transform="rotate(-28 38 32)"/>`,
    white: `<ellipse cx="50" cy="55" rx="44" ry="42" fill="rgba(0,0,0,.35)"/>
        <circle cx="50" cy="50" r="44" fill="url(#g-white)"/>
        <circle cx="50" cy="50" r="43.2" fill="none" stroke="rgba(120,124,118,.55)" stroke-width="1.6"/>
        <ellipse cx="38" cy="32" rx="17" ry="10" fill="url(#g-white-hi)" transform="rotate(-28 38 32)"/>`
};

const DEFS = `
    <radialGradient id="g-black" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#5a5f63"/><stop offset=".45" stop-color="#25282b"/><stop offset="1" stop-color="#08090a"/></radialGradient>
    <radialGradient id="g-black-hi"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="g-white" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#eceee9"/><stop offset="1" stop-color="#b9bdb5"/></radialGradient>
    <radialGradient id="g-white-hi"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

export function symbolsSvg() {
    const lines = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    const stones = Object.entries(STONES).map(([key, body]) => `<symbol id="s-${key}" viewBox="0 0 100 100">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${DEFS}</defs>${lines}${stones}</svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 石1つ（color：1 黒・2 白）
export const stoneSvg = (color, cls = '') => `<svg class="stone ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#s-${color === 1 ? 'black' : 'white'}"/></svg>`;

export const COLOR_NAME = { 1: '黒', 2: '白' };
