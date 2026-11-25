/**
 * 絵（すべて SVG で自作）。symbol を1か所に置き、use で使い回す
 */

export function symbolsSvg() {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></symbol>
<symbol id="i-log" viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></symbol>
<symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/></symbol>
<symbol id="s-grape" viewBox="0 0 20 20"><path d="M10 1.5c.4 1.6 1.4 2.4 3 2.6" fill="none" stroke="#6f9a48" stroke-width="1.6" stroke-linecap="round"/>
<g fill="currentColor"><circle cx="6.5" cy="6.5" r="2.6"/><circle cx="10" cy="6.2" r="2.6"/><circle cx="13.5" cy="6.5" r="2.6"/><circle cx="8.2" cy="10" r="2.6"/><circle cx="11.8" cy="10" r="2.6"/><circle cx="10" cy="13.5" r="2.6"/><circle cx="10" cy="17" r="2.2"/></g></symbol>
<symbol id="s-worker" viewBox="0 0 20 20"><circle cx="10" cy="5" r="3.4" fill="currentColor"/><path d="M3.5 19c0-5.5 2.4-9.3 6.5-9.3s6.5 3.8 6.5 9.3z" fill="currentColor"/></symbol>
<symbol id="s-grande" viewBox="0 0 20 20"><circle cx="10" cy="4.6" r="3.6" fill="currentColor"/><path d="M2.5 19.5c0-6 2.8-10 7.5-10s7.5 4 7.5 10z" fill="currentColor"/><path d="M6.5 14h7" stroke="rgba(0,0,0,.45)" stroke-width="1.6"/></symbol>
<symbol id="s-coin" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#e9b949" stroke="#9a7120" stroke-width="1.5"/><path d="M8 6.5v7h4.5" fill="none" stroke="#7a5810" stroke-width="1.8" stroke-linecap="round"/></symbol>
<symbol id="s-star" viewBox="0 0 20 20"><path d="M10 1.8l2.5 5.3 5.7.7-4.2 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.2-4 5.7-.7z" fill="#f0d27a" stroke="#a37d22" stroke-width="1.2" stroke-linejoin="round"/></symbol>
<symbol id="s-bottle" viewBox="0 0 20 20"><path d="M8 1.5h4v4.2c2 1 3 2.6 3 4.8v7.6c0 .6-.4.9-1 .9H6c-.6 0-1-.3-1-.9v-7.6c0-2.2 1-3.8 3-4.8z" fill="currentColor"/><path d="M6.5 11h7v4.5h-7z" fill="rgba(255,255,255,.55)"/></symbol>
</svg>`;
}

export const sym = (id, cls = '') => `<svg class="sym ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

export function titleArtHtml() {
    return `<svg viewBox="0 0 220 150" class="t-art">
<defs><linearGradient id="t-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d9b4a"/><stop offset="1" stop-color="#3f5a2a"/></linearGradient></defs>
<path d="M0 118 Q55 82 112 104 T220 96 V150 H0z" fill="url(#t-hill)"/>
<g stroke="#2c3f1d" stroke-width="2" opacity=".7">${[22, 52, 82, 112, 142, 172, 202].map(x => `<path d="M${x} 112 v30"/>`).join('')}</g>
<g transform="translate(72 10)"><path d="M38 6c4 7 10 10 18 10" fill="none" stroke="#6f9a48" stroke-width="5" stroke-linecap="round"/>
<path d="M54 14c10-8 22-6 26 2-10 6-20 6-26-2z" fill="#7ea84f"/>
<g fill="#7b2346">${[[22, 28], [38, 26], [54, 28], [30, 42], [46, 42], [62, 40], [38, 56], [54, 56], [46, 70], [30, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5"/>`).join('')}</g>
<g fill="#a8456c" opacity=".7">${[[19, 25], [35, 23], [51, 25], [27, 39], [43, 39], [35, 53], [51, 53], [43, 67]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join('')}</g></g>
</svg>`;
}
