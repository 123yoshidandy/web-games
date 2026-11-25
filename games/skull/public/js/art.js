/**
 * 絵（自作）：札（花・ドクロ・裏）とコースター
 * 札の裏は、持ち主の色。花とドクロは SVG で描く
 */

export const PLAYER_COLORS = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d68910', '#16a085'];

const FLOWER_ART = `<g>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-5.2" rx="3.6" ry="5.4" fill="#f06292" transform="rotate(${a})"/>`).join('')}
    <circle r="3.4" fill="#ffd54f"/><circle r="1.4" fill="#f9a825"/></g>`;
const SKULL_ART = `<g><path d="M0-8.6c-5 0-8 3.4-8 7.4 0 2.8 1.4 4.4 3 5.3V7h10V4.1c1.6-.9 3-2.5 3-5.3 0-4-3-7.4-8-7.4z" fill="#f4f1e8"/>
    <circle cx="-3.2" cy="-1.2" r="2.4" fill="#2b2b2b"/><circle cx="3.2" cy="-1.2" r="2.4" fill="#2b2b2b"/><path d="M0 1.6-1.2 3.6h2.4z" fill="#2b2b2b"/>
    <path d="M-2.6 5v2M0 5v2M2.6 5v2" stroke="#2b2b2b" stroke-width=".9"/></g>`;

// disc：'F'（花）・'S'（ドクロ）・null（裏）。color は裏の色
export function discHtml(disc, color, { cls = '', attrs = '' } = {}) {
    const face = disc === 'F' ? FLOWER_ART : disc === 'S' ? SKULL_ART : '';
    const bg = disc === 'S' ? '#2c2c34' : disc === 'F' ? '#fff4f7' : color;
    const ring = disc ? color : 'rgba(255,255,255,.35)';
    const pattern = disc ? '' : `<circle r="6.5" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2" stroke-dasharray="2 2.2"/><circle r="2" fill="rgba(255,255,255,.35)"/>`;
    const label = disc === 'F' ? '花' : disc === 'S' ? 'ドクロ' : '伏せた札';
    return `<svg class="disc ${disc ? `face ${disc === 'S' ? 'skull' : 'flower'}` : 'back'} ${cls}" ${attrs} viewBox="-11 -11 22 22" role="img" aria-label="${label}">
        <circle r="10.2" fill="${bg}" stroke="${ring}" stroke-width="1.4"/>${pattern}${face}</svg>`;
}

// コースター：wins が 1 以上なら花の面（裏返した）
export function coasterHtml(wins, color) {
    const flipped = wins >= 1;
    return `<svg class="coaster ${flipped ? 'flipped' : ''}" viewBox="-11 -11 22 22" role="img" aria-label="${flipped ? 'コースター（1回成功）' : 'コースター'}">
        <circle r="10.4" fill="${flipped ? '#f6d365' : '#5a4a3a'}" stroke="${color}" stroke-width="1.4"/>
        ${flipped ? `<g transform="scale(.75)">${FLOWER_ART}</g>` : '<circle r="6" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.2"/>'}</svg>`;
}
