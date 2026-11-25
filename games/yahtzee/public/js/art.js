/**
 * サイコロの絵（自作の SVG）
 * 角の丸い白い面に、目を丸い穴として打つ。0 はまだ振っていない面（目なし）
 */

// 目の位置（100 × 100 の面の上）
const L = 27;
const M = 50;
const R = 73;
const PIPS = {
    1: [[M, M]],
    2: [[R, L], [L, R]],
    3: [[R, L], [M, M], [L, R]],
    4: [[L, L], [R, L], [L, R], [R, R]],
    5: [[L, L], [R, L], [M, M], [L, R], [R, R]],
    6: [[L, L], [R, L], [L, M], [R, M], [L, R], [R, R]]
};

export function pipsSvg(value) {
    return (PIPS[value] ?? []).map(([x, y]) => `<circle class="pip" cx="${x}" cy="${y}" r="${value === 1 ? 11 : 9}"/>`).join('');
}

export function dieSvg(value, cls = '') {
    return `<svg class="die-face ${cls} ${value === 0 ? 'blank' : ''}" viewBox="0 0 100 100" aria-hidden="true">
        <rect class="face" x="3" y="3" width="94" height="94" rx="20"/>
        <g class="pips">${pipsSvg(value)}</g>
    </svg>`;
}

// 小さいサイコロ（得点表の上段の見出しに使う）
export const miniDie = (value) => dieSvg(value, 'mini');
