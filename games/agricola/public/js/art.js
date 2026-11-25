/**
 * 絵（すべて自作の SVG）。図柄は symbol としてページに一度だけ入れ、use で使い回す
 */

const SYMBOLS = {
    wood: `<rect x="2.5" y="8" width="16" height="9" rx="2" fill="#8a5a33"/><path d="M5 11h9M6.5 14h8" stroke="#64401f" stroke-width="1.1" stroke-linecap="round"/><ellipse cx="18.5" cy="12.5" rx="3" ry="4.5" fill="#dfae72"/><ellipse cx="18.5" cy="12.5" rx="1.4" ry="2.2" fill="none" stroke="#8a5a33" stroke-width=".9"/>`,
    clay: `<path d="M3 10l4-3.2h14L17 10z" fill="#e8835a"/><path d="M17 10l4-3.2v7.4L17 17.4z" fill="#9c3f25"/><rect x="3" y="10" width="14" height="7.4" fill="#c4572f"/>`,
    reed: `<g stroke-linecap="round"><path d="M7 21C8 15 8 9 6 4" stroke="#7f9b3a" stroke-width="1.8" fill="none"/><path d="M12 21c0-6 .5-11 0-17" stroke="#93ad46" stroke-width="1.8" fill="none"/><path d="M17 21c-.5-5 0-10 2-15" stroke="#7f9b3a" stroke-width="1.8" fill="none"/></g><ellipse cx="6.2" cy="5" rx="1.3" ry="3" fill="#8a5a33"/><ellipse cx="12" cy="4.6" rx="1.3" ry="3" fill="#8a5a33"/><ellipse cx="18.8" cy="6" rx="1.3" ry="3" fill="#8a5a33"/>`,
    stone: `<path d="M3.5 16.5l2-7.5 5.5-3.5 6.5 1 3.5 5.5-1 5.5-6.5 2-8-1.5z" fill="#8f979e"/><path d="M5.5 9l5.5-3.5 6.5 1-4.5 3.6z" fill="#cdd2d6"/><path d="M13 10.1l4.5-3.6 3.5 5.5-1 5.5z" fill="#6f777e"/>`,
    grain: `<path d="M12 22V7" stroke="#a87a24" stroke-width="1.6" stroke-linecap="round"/><g fill="#e3b33d"><ellipse cx="12" cy="4.5" rx="1.6" ry="2.6"/><ellipse cx="9.4" cy="8" rx="1.5" ry="2.5" transform="rotate(-35 9.4 8)"/><ellipse cx="14.6" cy="8" rx="1.5" ry="2.5" transform="rotate(35 14.6 8)"/><ellipse cx="9.4" cy="12" rx="1.5" ry="2.5" transform="rotate(-35 9.4 12)"/><ellipse cx="14.6" cy="12" rx="1.5" ry="2.5" transform="rotate(35 14.6 12)"/><ellipse cx="9.4" cy="16" rx="1.5" ry="2.5" transform="rotate(-35 9.4 16)"/><ellipse cx="14.6" cy="16" rx="1.5" ry="2.5" transform="rotate(35 14.6 16)"/></g>`,
    veg: `<path d="M12 8c-3.8 0-6.5 3-6.5 6.8 0 3.9 2.9 6.7 6.5 6.7s6.5-2.8 6.5-6.7C18.5 11 15.8 8 12 8z" fill="#e57a2b"/><path d="M9 10.5c-.7 2.5-.7 6 .3 9M15 10.5c.7 2.5.7 6-.3 9M12 9v12" stroke="#b9561a" stroke-width="1" fill="none"/><path d="M12 8.5c0-2 .8-3.6 2.6-4.6M12 8.3c-1.3-1.5-3-2-4.6-1.6" stroke="#4f8a2f" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    food: `<path d="M3.5 11.5h17c0 5.2-3.8 8.5-8.5 8.5s-8.5-3.3-8.5-8.5z" fill="#b5713a"/><path d="M3.5 11.5h17" stroke="#7a4824" stroke-width="1.4"/><ellipse cx="12" cy="11" rx="7.5" ry="2" fill="#f2d48a"/><path d="M9 7.5c.6-1.2-.6-2 0-3.2M13 7.5c.6-1.2-.6-2 0-3.2" stroke="#c9b38f" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
    sheep: `<g fill="#f6f2e8" stroke="#bdb5a3" stroke-width=".7"><circle cx="8" cy="11" r="3.4"/><circle cx="12" cy="9.5" r="3.6"/><circle cx="16" cy="11.2" r="3.3"/><circle cx="10" cy="14.2" r="3.2"/><circle cx="14.5" cy="14.3" r="3.2"/></g><path d="M8.5 17v3.5M15.5 17v3.5" stroke="#4a4038" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="4.6" cy="11.8" rx="2.4" ry="2" fill="#4a4038"/>`,
    boar: `<ellipse cx="12.5" cy="13" rx="7.5" ry="5" fill="#6b4630"/><path d="M8 9.5l1.2-2.5 1.6 2.4M13 8.5l1.3-2.4 1.4 2.5" fill="#4d3021"/><ellipse cx="4.6" cy="13.6" rx="2.6" ry="2.2" fill="#8a5c3f"/><path d="M3.2 15.2l-1-1.4M4.2 15.6l-.4-1.8" stroke="#f2ead6" stroke-width="1" stroke-linecap="round"/><path d="M8.5 17v3.2M16 17v3.2" stroke="#3e281b" stroke-width="1.7" stroke-linecap="round"/><circle cx="6.4" cy="12.2" r=".7" fill="#1f130c"/>`,
    cattle: `<rect x="5.5" y="8.5" width="14" height="8.5" rx="3.5" fill="#f2ede4"/><path d="M9 8.5c1 2 0 4.5-1.5 5.5M14.5 12c1.5-.8 3.2-.2 4 1.5" fill="none" stroke="#2f2a26" stroke-width="2.4" stroke-linecap="round"/><rect x="1.5" y="9" width="5.4" height="5.4" rx="2" fill="#2f2a26"/><path d="M2 9l-1-2M6.2 9l1-2" stroke="#d8cbb0" stroke-width="1.1" stroke-linecap="round"/><path d="M8 17v3.4M17 17v3.4" stroke="#2f2a26" stroke-width="1.7" stroke-linecap="round"/><ellipse cx="3" cy="13.4" rx="1.6" ry="1" fill="#e9a8a0"/>`,
    person: `<circle cx="12" cy="5.6" r="3.4" fill="currentColor"/><path d="M5 21.5l1.8-6.6-3.3-1.6c-.9-.5-.6-1.8.4-1.9L8.6 10.5h6.8l4.7.9c1 .1 1.3 1.4.4 1.9l-3.3 1.6 1.8 6.6h-4.6L12 17.6l-2.4 3.9z" fill="currentColor"/>`,
    house: `<path d="M4 12.5L12 5l8 7.5V21H4z" fill="currentColor"/><path d="M2.2 13.2L12 3.6l9.8 9.6" stroke="#5a3a1c" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="10" y="14.5" width="4" height="6.5" rx="1.5" fill="#5a3a1c"/>`,
    stable: `<path d="M3 11l9-6 9 6v10H3z" fill="#a8743c"/><path d="M3 11l9-6 9 6" stroke="#5a3a1c" stroke-width="2" fill="none" stroke-linejoin="round"/><rect x="8" y="13" width="8" height="8" fill="#5a3a1c"/><path d="M8 13l8 8M16 13l-8 8" stroke="#a8743c" stroke-width="1.2"/>`,
    field: `<rect x="2.5" y="4" width="19" height="16" rx="2" fill="#7a5230"/><path d="M5 8h14M5 12h14M5 16h14" stroke="#5c3b1f" stroke-width="1.6" stroke-linecap="round"/>`,
    fence: `<path d="M5 4v17M12 4v17M19 4v17" stroke="#8a5a33" stroke-width="2.4" stroke-linecap="round"/><path d="M3 9h18M3 15h18" stroke="#a8743c" stroke-width="2" stroke-linecap="round"/>`,
    beg: `<path d="M5 13c0-2 1.5-3 3-3h7c2 0 3.5 1.4 3.5 3.4V17c0 2.2-1.8 4-4 4H9c-2.2 0-4-1.8-4-4z" fill="#d9b48a"/><path d="M8 10V6.5a1.5 1.5 0 0 1 3 0V10M11 10V5.5a1.5 1.5 0 0 1 3 0V10M14 10V6.5a1.5 1.5 0 0 1 3 0V11" fill="#d9b48a" stroke="#9a7650" stroke-width=".8"/>`,
    star: `<path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.6l-5.6 3.2 1.3-6.2L3 9.3l6.3-.7z" fill="#f0c24b" stroke="#a3781c" stroke-width=".8" stroke-linejoin="round"/>`,
    // 大きな進歩
    fireplace: `<path d="M4 21V10h16v11z" fill="#b35a35"/><path d="M4 10h16" stroke="#7a3a20" stroke-width="2"/><path d="M12 19c-2.6 0-3.8-1.7-3.8-3.4 0-2.2 2-3 2.2-5.6 1.6 1 2.2 2.3 2 3.3.8-.6 1.2-1.5 1.2-2.3 1.4 1.2 2.2 2.6 2.2 4.4 0 1.9-1.4 3.6-3.8 3.6z" fill="#f0a531"/>`,
    hearth: `<path d="M5.5 10h13l-1 8.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5z" fill="#55595e"/><rect x="4" y="8.5" width="16" height="2.2" rx="1" fill="#3e4247"/><path d="M9 6c0-1.3 1-1.3 1-2.6M13 6c0-1.3 1-1.3 1-2.6" stroke="#c9c2b4" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M8 21h8" stroke="#f0a531" stroke-width="2" stroke-linecap="round"/>`,
    oven: `<path d="M3 21v-7a9 9 0 0 1 18 0v7z" fill="currentColor"/><path d="M8 21v-4.5a4 4 0 0 1 8 0V21z" fill="#3a2414"/><path d="M10 19.5c.8-1.6 3.2-1.6 4 0" stroke="#f0a531" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    chair: `<path d="M7 3v18M7 12h10v9M17 12V8" stroke="#8a5a33" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M7 4.5h6" stroke="#a8743c" stroke-width="2" stroke-linecap="round"/>`,
    pot: `<path d="M8.5 3.5h7v2.2c0 1 2.3 1.6 3.4 4.4 1.3 3.4-.2 8.3-3.3 10.4H8.4C5.3 18.4 3.8 13.5 5.1 10.1 6.2 7.3 8.5 6.7 8.5 5.7z" fill="#c4683c"/><path d="M5.6 11h12.8" stroke="#7f3d1d" stroke-width="1.2"/>`,
    basket: `<path d="M4 10h16l-2 10H6z" fill="#c99a52"/><path d="M5 13h14M5.6 16.5h12.8M9 10l.6 10M15 10l-.6 10" stroke="#8a6630" stroke-width="1"/><path d="M7 10a5 5 0 0 1 10 0" stroke="#8a6630" stroke-width="1.6" fill="none"/>`,
    well: `<rect x="5" y="13" width="14" height="8" rx="1" fill="#8f979e"/><path d="M5 16h14M9 13v8M15 13v8" stroke="#6f777e" stroke-width="1"/><path d="M6 13V6M18 13V6M4 6h16" stroke="#8a5a33" stroke-width="1.8" stroke-linecap="round"/><path d="M12 6v4" stroke="#5a3a1c" stroke-width="1"/><rect x="10.5" y="9.5" width="3" height="2.5" fill="#5a3a1c"/>`,
    // 線のアイコン（stroke: currentColor）
    'i-home': `<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>`,
    'i-log': `<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>`,
    'i-help': `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.3" r=".5"/>`
};

export const MAJOR_ICON = {
    fireplace2: 'fireplace', fireplace3: 'fireplace', hearth4: 'hearth', hearth5: 'hearth',
    clayOven: 'oven', stoneOven: 'oven', joinery: 'chair', pottery: 'pot', basket: 'basket', well: 'well'
};
export const MAJOR_TINT = { clayOven: '#c4572f', stoneOven: '#8f979e' };

export function symbolsSvg() {
    const body = Object.entries(SYMBOLS).map(([id, inner]) => `<symbol id="s-${id}" viewBox="0 0 24 24">${inner}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">${body}</svg>`;
}

export const sym = (name, cls = '', style = '') => `<svg class="sym ${cls}" aria-hidden="true"${style ? ` style="${style}"` : ''}><use href="#s-${name}"/></svg>`;
export const amountHtml = (name, n, cls = '') => `<span class="amt ${cls}">${sym(name)}<b>${n}</b></span>`;
export const majorIcon = (id, cls = '') => sym(MAJOR_ICON[id], cls, MAJOR_TINT[id] ? `color:${MAJOR_TINT[id]}` : '');
