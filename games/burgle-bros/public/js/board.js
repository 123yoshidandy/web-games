/**
 * 盤の描画（1つの階の 4×4 の部屋・壁・泥棒・見張り・部屋の絵柄）
 * 絵柄はすべて自作の簡単な SVG（線で描く）
 */

import { CELLS, SIZE, ROOMS, CHARACTERS, rowOf, colOf, wallKey, safeLine } from './data.js';
import { predictGuard, stairsCell, safeCell } from './rules.js';

const svg = (body, cls = 'ri') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

// 部屋の絵柄
export const ROOM_ICONS = {
    safe: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v2M12 14v2M8 12h2M14 12h2"/>'),
    stairs: svg('<path d="M4 20h4v-4h4v-4h4V8h4"/><path d="M15 4h5v5"/>'),
    atrium: svg('<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2"/><path d="M12 7v10M8 13l4 4 4-4"/>'),
    camera: svg('<rect x="3" y="8" width="13" height="9" rx="2"/><path d="M16 11l5-3v9l-5-3"/><circle cx="9" cy="12.5" r="2.2"/>'),
    fpComputer: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/><path d="M9 11a3 3 0 0 1 6 0M10.5 11a1.5 1.5 0 0 1 3 0"/>'),
    laserComputer: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/><path d="M7 10l3-2 3 4 3-3 2 2"/>'),
    motionComputer: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/><path d="M8 10a4 4 0 0 1 8 0M10 10a2 2 0 0 1 4 0"/>'),
    deadbolt: svg('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 12h9"/><rect x="15" y="10" width="4" height="4"/>'),
    fingerprint: svg('<path d="M7 18c1-2 1-5 1-7a4 4 0 0 1 8 0c0 3 0 6-1 8"/><path d="M10 19c.8-2 1-4 1-7a1 1 0 0 1 2 0c0 3-.2 5-1 7"/><path d="M5 14c.2-1 .2-2 .2-3a6.8 6.8 0 0 1 13.6 0"/>'),
    foyer: svg('<path d="M5 21V5l8-2v18"/><path d="M13 5h6v16"/><circle cx="10.5" cy="12" r=".8"/>'),
    keypad: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>'),
    lab: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>'),
    laser: svg('<path d="M3 6l18 4M3 12l18-2M3 18l18-4"/>'),
    lavatory: svg('<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>'),
    motion: svg('<circle cx="12" cy="14" r="1.6"/><path d="M8.5 10.5a5 5 0 0 1 7 0M6 8a8.5 8.5 0 0 1 12 0"/>'),
    secret: svg('<rect x="4" y="3" width="16" height="18"/><path d="M4 9h16M4 15h16M9 3v6M14 9v6M8 15v6"/>'),
    duct: svg('<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M6 10h12M6 14h12"/>'),
    thermo: svg('<path d="M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>'),
    walkway: svg('<path d="M3 9h18M3 15h18M7 9v6M12 9v6M17 9v6"/>')
};

const GUARD_ICON = '<svg class="guard-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a6 6 0 0 1 6 6v2H6V8a6 6 0 0 1 6-6z"/><path d="M4 10h16" /><circle cx="12" cy="15" r="5"/><path d="M9.5 15h5"/></svg>';

// 泥棒の駒（色と頭文字）
export function pawnHtml(char, extra = '', attrs = '') {
    const c = CHARACTERS[char];
    return `<span class="pawn ${extra}" ${attrs} style="--pc:${c.color}" title="${c.name}">${c.name[0]}</span>`;
}

export function guardHtml(extra = '', attrs = '') {
    return `<span class="guard ${extra}" ${attrs} title="見張り">${GUARD_ICON}</span>`;
}

// 1つの階の盤
// opts: { targets: Set（光らせる部屋のセル）, flash: Set, path: Set（見張りの次の道）, mark: 'move' | 'peek' | 'pick' }
export function floorHtml(v, f, opts = {}) {
    const fl = v.floors[f];
    const g = fl.guard;
    const targets = opts.targets ?? new Set();
    const flash = opts.flash ?? new Set();
    const path = opts.path ?? new Set();
    const safe = safeCell(v, f);
    const line = safe >= 0 ? new Set(safeLine(safe)) : new Set();
    // 1つ下の階の階段の真上（下りられる部屋）
    const downCell = f > 0 ? stairsCell(v, f - 1) : -1;
    const cells = [];
    for (let c = 0; c < CELLS; c++) {
        const t = fl.tiles[c];
        const r = rowOf(c);
        const col = colOf(c);
        const walls = [
            r > 0 && fl.walls.includes(wallKey(c, c - SIZE)) ? 'wt' : '',
            col < SIZE - 1 && fl.walls.includes(wallKey(c, c + 1)) ? 'wr' : '',
            r < SIZE - 1 && fl.walls.includes(wallKey(c, c + SIZE)) ? 'wb' : '',
            col > 0 && fl.walls.includes(wallKey(c, c - 1)) ? 'wl' : ''
        ].filter(Boolean).join(' ');
        const cls = ['tile', t.revealed ? `room ${t.type}` : 'hidden', walls, t.alarm ? 'alarm' : '', t.cracked ? 'cracked' : '',
            line.has(c) ? 'line' : '', targets.has(c) ? `target ${opts.mark ?? ''}` : '', flash.has(c) ? 'flash' : '', path.has(c) ? 'path' : ''].filter(Boolean).join(' ');
        let inner = '';
        if (t.revealed) {
            const room = ROOMS[t.type];
            inner += ROOM_ICONS[t.type] ?? '';
            inner += `<span class="rname">${room.short}</span>`;
            if (t.type !== 'safe') inner += `<span class="num${t.cracked ? ' ok' : ''}">${t.num}</span>`;
            if (t.type === 'safe') inner += (fl.safe.cracked ? '<span class="dice open">開</span>' : `<span class="dice"><i class="die"></i>${fl.safe.dice}</span>`);
            if (t.type === 'keypad' && t.open) inner += '<span class="badge open">開</span>';
            if (t.type === 'lavatory') inner += `<span class="badge">隠${t.lav}</span>`;
            if (t.type === 'lab' && t.used) inner += '<span class="badge dim">済</span>';
        } else {
            inner += '<span class="back"></span>';
        }
        if (downCell === c) inner += '<span class="badge down" title="下り階段">↓</span>';
        if (t.alarm) inner += '<span class="siren" aria-label="警報"></span>';
        if (g.active && g.dest === c) inner += '<span class="dest" title="見張りの行き先">◎</span>';
        const pawns = v.players.filter(p => !p.escaped && p.floor === f && p.cell === c);
        const people = pawns.map(p => pawnHtml(p.char, p.id === v.current ? 'cur' : '', `data-key="p${p.id}"`)).join('') + (g.active && g.cell === c ? guardHtml('', 'data-key="guard"') : '');
        if (people) inner += `<span class="people">${people}</span>`;
        cells.push(`<button type="button" class="${cls}" data-cell="${c}" aria-label="${t.revealed ? ROOMS[t.type].name : '未確認の部屋'}">${inner}</button>`);
    }
    return cells.join('');
}

// 見張りの次の道（今の手番の終わりに必ず通る部屋）
export function guardPath(v, f) {
    return predictGuard(v, f, 1).sure;
}

// タイトルの絵：夜の3階建ての建物（窓のいくつかに明かり）と、屋上の影
export function titleArtHtml() {
    const windows = [];
    for (let fl = 0; fl < 3; fl++) {
        for (let i = 0; i < 4; i++) {
            const lit = (fl * 4 + i) % 5 === 1;
            windows.push(`<rect x="${58 + i * 34}" y="${208 - fl * 56}" width="20" height="26" rx="2" class="${lit ? 'lit' : 'win'}"/>`);
        }
    }
    return `<svg class="title-svg" viewBox="0 0 260 300" aria-hidden="true">
        <circle cx="210" cy="50" r="22" class="moon"/>
        <rect x="40" y="90" width="180" height="190" class="bldg"/>
        <rect x="34" y="82" width="192" height="10" class="roof"/>
        ${windows.join('')}
        <rect x="114" y="250" width="32" height="30" class="door"/>
        <path d="M118 82v-22h24v22" class="hatch"/>
        <circle cx="130" cy="52" r="7" class="thief"/>
        <path d="M122 66l8-8 8 8" class="thief-line"/>
    </svg>`;
}
