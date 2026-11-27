/**
 * 絵（すべてこのゲームのために描いた SVG）
 * 幽霊・僧の駒・村のタイルの印・効果の印・操作のアイコン
 */

export const COLOR_HEX = ['#d4524c', '#dcae35', '#4b9d5f', '#4a7cc9', '#4a4458'];
export const FACE_HEX = [...COLOR_HEX.slice(0, 4), '#2b2733', '#f4efe2'];

const svg = (body, { cls = 'line-icon', view = '0 0 24 24' } = {}) => `<svg viewBox="${view}" class="${cls}" aria-hidden="true">${body}</svg>`;

// 幽霊の姿（色で塗る）。魔王の化身は角と冠
export function ghostSvg(color, { incarnation = false } = {}) {
    const fill = COLOR_HEX[color];
    const horns = incarnation ? '<path d="M8 6 5 1.5 10 4.5M16 6l3-4.5-5 3" fill="#c33" stroke="#1a1820" stroke-width=".8"/>' : '';
    return `<svg viewBox="0 0 24 24" class="ghost-svg" aria-hidden="true">${horns}
        <path d="M4 21V11a8 8 0 0 1 16 0v10l-2.7-2-2.6 2-2.7-2-2.6 2-2.7-2z" fill="${fill}" stroke="#1a1820" stroke-width="1.1" stroke-linejoin="round"/>
        <ellipse cx="9.3" cy="11" rx="1.6" ry="2.1" fill="#fff"/><ellipse cx="14.7" cy="11" rx="1.6" ry="2.1" fill="#fff"/>
        <circle cx="9.6" cy="11.5" r=".9" fill="#1a1820"/><circle cx="15" cy="11.5" r=".9" fill="#1a1820"/>
        ${incarnation ? '<path d="M9 16q3 2 6 0" stroke="#fff" stroke-width="1.2" fill="none"/>' : '<ellipse cx="12" cy="16" rx="1.4" ry="1" fill="#1a1820" opacity=".7"/>'}
    </svg>`;
}

// 僧の駒
export function monkSvg(color, { dead = false } = {}) {
    const fill = dead ? '#777' : COLOR_HEX[color];
    return `<svg viewBox="0 0 24 24" class="monk-svg" aria-hidden="true">
        <path d="M5 22c0-6 3-9 7-9s7 3 7 9z" fill="${fill}" stroke="#14121c" stroke-width="1.2"/>
        <circle cx="12" cy="8" r="5" fill="#f1dcc0" stroke="#14121c" stroke-width="1.2"/>
        ${dead ? '<path d="M9.5 7.5l2 2M11.5 7.5l-2 2M12.5 7.5l2 2M14.5 7.5l-2 2" stroke="#14121c" stroke-width="1"/>' : '<path d="M10 8h.01M14 8h.01" stroke="#14121c" stroke-width="1.6" stroke-linecap="round"/>'}
    </svg>`;
}

// 憑き手（幽霊の色の、ゆらぐ手）
export function haunterSvg(color) {
    return `<svg viewBox="0 0 24 24" class="haunter-svg" aria-hidden="true">
        <path d="M6 22c-1-4 0-7 1-10l1-6c.3-1.5 2-1.5 2 0v5l1-7c.3-1.5 2-1.5 2 0l-.2 7 1.2-6c.3-1.4 2-1.2 1.9.2l-.8 7 1.3-3c.6-1.2 2.3-.6 1.9.7L16 18c-.6 2-1 3-1 4z"
            fill="${COLOR_HEX[color]}" stroke="#14121c" stroke-width="1.1" stroke-linejoin="round"/>
    </svg>`;
}

export function buddhaSvg() {
    return `<svg viewBox="0 0 24 24" class="buddha-svg" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#f6d77a" opacity=".35"/>
        <path d="M5 21c0-4 3-6 7-6s7 2 7 6z" fill="#e1b545" stroke="#5c4310" stroke-width="1"/>
        <circle cx="12" cy="9" r="4.2" fill="#ecc458" stroke="#5c4310" stroke-width="1"/>
        <circle cx="12" cy="4.2" r="1.4" fill="#ecc458" stroke="#5c4310" stroke-width="1"/>
        <path d="M10.3 9.5q1.7 1 3.4 0" stroke="#5c4310" stroke-width=".8" fill="none"/>
    </svg>`;
}

// 村のタイルの印
const TILE_ART = {
    tea: '<path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2 2 0 0 1 0 4H16"/><path d="M8 7c0-1 1-1 1-2M11 7c0-1 1-1 1-2"/><path d="M4 21h14"/>',
    herb: '<path d="M12 21V9"/><path d="M12 13c-4 0-6-3-6-6 3 0 6 2 6 6z"/><path d="M12 11c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M8 21h8"/>',
    sorcerer: '<path d="M4 20 12 4l8 16z"/><circle cx="12" cy="14" r="2.5"/><path d="M12 9.5v1"/>',
    prayer: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5M12 15.5V20M4 12h4.5M15.5 12H20"/>',
    temple: '<path d="M12 3v3"/><path d="M8 9a4 4 0 0 1 8 0z"/><path d="M6 9h12l-1 4H7z"/><path d="M8 13v7h8v-7M5 20h14"/>',
    pavilion: '<path d="M3 9 12 4l9 5"/><path d="M5 9c2 2 12 2 14 0"/><path d="M7 11v9M17 11v9M4 20h16"/><path d="M9 15h6"/>',
    cemetery: '<path d="M7 20v-9a5 5 0 0 1 10 0v9"/><path d="M12 10v6M9.5 12.5h5"/><path d="M4 20h16"/>',
    altar: '<path d="M5 13h14v3H5zM7 16v4M17 16v4"/><path d="M9 13V9M15 13V9"/><path d="M9 7c-.8-1 0-2 0-2s.8 1 0 2zM15 7c-.8-1 0-2 0-2s.8 1 0 2z"/>',
    watch: '<path d="M9 4h6M10 4v2M14 4v2"/><rect x="8" y="6" width="8" height="11" rx="3"/><path d="M12 9v5M10 11.5h4"/><path d="M12 17v3M9 20h6"/>'
};
export const tileSvg = (key) => svg(TILE_ART[key], { cls: 'line-icon tile-icon' });

// 効果の印（幽霊の札の小さな印）
const EFFECT_ART = {
    haunter: '<path d="M7 20c-1-3 0-6 1-9l1-5h2v5l1-6h2l-.2 6 1.2-5h2l-.8 6 1.3-2h1.6l-2.1 5c-.6 2-1 3-1 5z"/>',
    summon: '<path d="M6 20V12a6 6 0 0 1 12 0v8"/><path d="M12 7V3M10 5h4"/>',
    curse: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M12 12h.01" stroke-width="3"/>',
    drain: '<path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.5 12 20 12 20z"/><path d="M12 9v6"/>',
    capture: '<rect x="5" y="9" width="11" height="11" rx="2"/><path d="M14 6l4-3M18 8l3-1"/>',
    block: '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>',
    haunt: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>',
    qi: '<path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.5 12 20 12 20z"/>',
    tao: '<circle cx="12" cy="12" r="7"/><path d="M12 5a3.5 3.5 0 0 1 0 7 3.5 3.5 0 0 0 0 7"/>',
    unhaunt: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>'
};
export const effectSvg = (key) => svg(EFFECT_ART[key], { cls: 'line-icon fx-icon' });

// 操作・画面のアイコン
export const ICONS = {
    home: svg('<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
    log: svg('<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
    'help-villager': svg('<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>'),
    exorcise: svg('<path d="M12 3 14 9h6l-5 3.8 2 6.2-5-3.8L7 19l2-6.2L4 9h6z"/>'),
    buddha: svg('<circle cx="12" cy="8" r="4"/><circle cx="12" cy="3.5" r="1"/><path d="M5 21c0-4 3-6 7-6s7 2 7 6z"/>'),
    mantra: svg('<path d="M7 3h10v18l-5-3-5 3z"/><path d="M10 8h4M10 12h4"/>'),
    pass: svg('<path d="M5 5l8 7-8 7z"/><path d="M17 5v14"/>')
};

// 道のダイスの面
export function dieSvg(face) {
    const fill = FACE_HEX[face];
    const pip = face === 5 ? '#b9ac8e' : '#fff';
    return `<svg viewBox="0 0 24 24" class="die-svg" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="${fill}" stroke="#14121c" stroke-width="1.2"/><circle cx="12" cy="12" r="3.2" fill="${pip}" opacity=".85"/></svg>`;
}

// 呪いのダイスの面
const CURSE_ART = { none: '', qi: EFFECT_ART.drain, tao: EFFECT_ART.tao, haunt: EFFECT_ART.haunt, ghost: EFFECT_ART.summon };
export function curseDieSvg(face) {
    return `<svg viewBox="0 0 24 24" class="die-svg curse" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="#1d1a24" stroke="#8b2f3a" stroke-width="1.4"/>
        <g transform="translate(5 5) scale(.58)" fill="none" stroke="#e88" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${CURSE_ART[face]}</g></svg>`;
}

// タイトルの絵：月夜の村と、漂う幽霊
export function titleArt() {
    const ghosts = [[44, 70, 0], [150, 50, 3], [250, 78, 1], [110, 112, 2], [205, 118, 4]]
        .map(([x, y, c], i) => `<g class="float f${i}" transform="translate(${x} ${y}) scale(1.6)">${ghostSvg(c).replace('<svg viewBox="0 0 24 24" class="ghost-svg" aria-hidden="true">', '').replace('</svg>', '')}</g>`).join('');
    return `<svg viewBox="0 0 300 180" class="title-svg" aria-hidden="true">
        <circle cx="240" cy="38" r="22" fill="#f3e6b8" opacity=".9"/>
        <path d="M0 150 40 128l30 14 34-24 40 20 36-18 44 22 30-12 46 20v30H0z" fill="#221e30"/>
        <path d="M20 160v-18l14-9 14 9v18zM120 160v-22l18-12 18 12v22zM220 160v-16l12-8 12 8v16z" fill="#2d283c" stroke="#3b3550"/>
        <path d="M30 152h8v8h-8zM132 150h12v10h-12zM228 152h8v8h-8z" fill="#f0c766" opacity=".75"/>
        ${ghosts}
    </svg>`;
}
