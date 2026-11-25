/**
 * 絵（自作の SVG）。ダイスの目とアイコンを symbol としてページに一度だけ入れ、use で使い回す
 */

const SYMBOLS = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="f-arrow" viewBox="0 0 40 40">
    <path d="M9 31 29 11" stroke="#6b3a1e" stroke-width="3" stroke-linecap="round"/>
    <path d="M30 10 21 12.5 27.5 19Z" fill="#8f2d1f"/>
    <path d="M9 31 6 26M9 31l5 3M12.5 27.5l-3-5M12.5 27.5l5 3" stroke="#c0532c" stroke-width="2.4" stroke-linecap="round"/>
  </symbol>
  <symbol id="f-dynamite" viewBox="0 0 40 40">
    <rect x="9" y="15" width="19" height="17" rx="3" fill="#c8352a"/>
    <path d="M14 15v17M20 15v17" stroke="#8d1f17" stroke-width="1.6"/>
    <path d="M24 15c1-5 5-7 8-6" stroke="#3b2a1f" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M32 9m-3.6 0l2.6-1 1-2.8 1 2.8 2.6 1-2.6 1-1 2.8-1-2.8z" fill="#f2a02c"/>
  </symbol>
  <symbol id="f-target" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="14" fill="none" stroke="#2f4b6e" stroke-width="2.4"/>
    <circle cx="20" cy="20" r="9" fill="none" stroke="#2f4b6e" stroke-width="1.4" opacity=".55"/>
    <path d="M20 3v6M20 31v6M3 20h6M31 20h6" stroke="#2f4b6e" stroke-width="2.4" stroke-linecap="round"/>
  </symbol>
  <symbol id="f-beer" viewBox="0 0 40 40">
    <rect x="9" y="13" width="17" height="20" rx="2.5" fill="#e6a530"/>
    <path d="M26 17h3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H26" fill="none" stroke="#b47a18" stroke-width="2.6"/>
    <path d="M8 14c0-4 3-6 6-5 1-3 6-3 7 0 3-1 6 1 6 5Z" fill="#fff8e6" stroke="#d8c8a0" stroke-width="1"/>
    <path d="M14 18v11M20 18v11" stroke="#f6cd70" stroke-width="2" stroke-linecap="round"/>
  </symbol>
  <symbol id="f-gatling" viewBox="0 0 40 40">
    <rect x="15" y="11.5" width="20" height="4" rx="1.5" fill="#3f3b38"/>
    <rect x="15" y="18" width="20" height="4" rx="1.5" fill="#3f3b38"/>
    <rect x="15" y="24.5" width="20" height="4" rx="1.5" fill="#3f3b38"/>
    <circle cx="13" cy="20" r="8" fill="#6b625b" stroke="#3f3b38" stroke-width="2"/>
    <circle cx="13" cy="20" r="2.4" fill="#d9cfc4"/>
    <path d="M6 30 3 36M20 30l3 6" stroke="#6b3a1e" stroke-width="3" stroke-linecap="round"/>
  </symbol>
  <symbol id="i-heart" viewBox="0 0 24 24">
    <path d="M12 20.5 4.2 12.9A4.8 4.8 0 0 1 11 6.1l1 1 1-1a4.8 4.8 0 0 1 6.8 6.8Z" fill="currentColor"/>
  </symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24">
    <path d="M5 19 18 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M19.5 4.5 13 6.2l4.8 4.8Z" fill="currentColor"/>
    <path d="M5 19l-2-3.5M5 19l3.5 2M7.6 16.4l-2-3.5M7.6 16.4l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </symbol>
  <symbol id="i-star" viewBox="0 0 24 24">
    <path d="M12 2.8 14.6 8.6 21 9.2 16.2 13.4 17.6 19.7 12 16.4 6.4 19.7 7.8 13.4 3 9.2 9.4 8.6Z" fill="currentColor"/>
  </symbol>
</svg>`;

const FACE_SYMBOL = { arrow: 'f-arrow', dynamite: 'f-dynamite', 1: 'f-target', 2: 'f-target', beer: 'f-beer', gatling: 'f-gatling' };

export function installSymbols(container) {
    container.innerHTML = SYMBOLS;
}

// ダイスの目（1と2は的に数字を重ねる）
export function faceSvg(face) {
    if (!face) return '<svg viewBox="0 0 40 40" class="face" aria-hidden="true"></svg>';
    const number = face === '1' || face === '2'
        ? `<text x="20" y="27" text-anchor="middle" class="face-num">${face}</text>` : '';
    return `<svg viewBox="0 0 40 40" class="face" aria-hidden="true"><use href="#${FACE_SYMBOL[face]}"/>${number}</svg>`;
}

export const icon = (id, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;

// 線で描いたボタンのアイコン
export const LINE_ICONS = {
    home: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/></svg>',
    log: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    help: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/></svg>'
};
