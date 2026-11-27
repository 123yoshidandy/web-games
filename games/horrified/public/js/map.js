/**
 * 村の地図（SVG）。ビューから描く
 * 地点の丸の中に置かれたアイテム、上に英雄、右上に怪物、左下に村人、右下に棺を描く
 */

import { LOCATIONS, EDGES, ITEMS, MONSTER, HERO, VILLAGERS } from './data.js';

export const ITEM_COLORS = { red: '#e0524f', blue: '#4f8de0', yellow: '#e9c24a' };
export const MONSTER_GLYPH = { vampire: '吸', golem: '人', werewolf: '狼', mummy: 'ミ', fishman: '魚', invisible: '透' };

const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 怪物の目印（丸に1文字）
export function monsterBadge(key, x, y, r = 10, extra = '') {
    return `<g class="m-monster ${extra}" transform="translate(${x} ${y})"><circle r="${r}" fill="${MONSTER[key].color}"/>`
        + `<text class="m-glyph" y="${r * 0.36}" font-size="${r * 1.05}">${MONSTER_GLYPH[key]}</text></g>`;
}

// 村人の目印（小さな人）
const villagerIcon = (x, y) => `<g class="m-villager" transform="translate(${x} ${y})"><circle cy="-4" r="2.6"/><path d="M-3.6 3.6 Q0 -3 3.6 3.6 Z"/></g>`;

// 英雄・怪物・村人の位置（地図の座標）。英雄は席、怪物は番号、村人は番号 → [x, y]
export function heroPositions(view) {
    const pos = new Map();
    LOCATIONS.forEach((l, at) => {
        const here = view.players.filter(p => p.loc === at);
        here.forEach((p, k) => pos.set(p.id, [l.x - (here.length - 1) * 6 + k * 12, l.y - 20]));
    });
    return pos;
}

export function monsterPositions(view) {
    const pos = new Map();
    LOCATIONS.forEach((l, at) => {
        const here = view.monsters.map((m, i) => ({ ...m, i })).filter(m => !m.defeated && m.loc === at);
        here.forEach((m, k) => pos.set(m.i, [l.x + 15 + k * 9, l.y - 11 + k * 9]));
    });
    return pos;
}

export function villagerPositions(view) {
    const pos = new Map();
    LOCATIONS.forEach((l, at) => {
        view.villagers.map((v, k) => (v === at ? k : -1)).filter(k => k >= 0).forEach((id, k) => pos.set(id, [l.x - 17 - k * 6, l.y + 13]));
    });
    return pos;
}

// 地図全体。options: { targets（光らせる地点）, best（おすすめの地点）, focusLoc（選んだ地点）, mini（タイトルの絵）}
export function mapSvg(view, { targets = [], best = null, mini = false } = {}) {
    const parts = [];
    parts.push('<rect class="m-ground" x="0" y="0" width="360" height="300" rx="14"/>');
    parts.push('<g class="m-roads">' + EDGES.map(([a, b]) => `<line x1="${LOCATIONS[a].x}" y1="${LOCATIONS[a].y}" x2="${LOCATIONS[b].x}" y2="${LOCATIONS[b].y}"/>`).join('') + '</g>');
    const alive = view ? view.monsters.map((m, i) => ({ ...m, i })).filter(m => !m.defeated) : [];
    LOCATIONS.forEach((l, at) => {
        const cls = ['m-loc'];
        if (targets.includes(at)) cls.push('target');
        if (best === at) cls.push('recommended');
        const g = [`<g class="${cls.join(' ')}" data-loc="${at}" transform="translate(${l.x} ${l.y})">`];
        g.push('<circle class="m-ring" r="19"/>');
        g.push('<circle class="m-spot" r="15"/>');
        if (!mini) g.push(`<text class="m-label" y="27">${esc(l.name)}</text>`);
        if (view) {
            // 目的の地点（怪物の色の小さなひし形）
            alive.forEach(m => {
                const def = MONSTER[m.key];
                const places = m.key === 'vampire' ? def.coffins.filter((_, k) => !m.task[k]) : (!m.done && def.at !== undefined ? [def.at] : []);
                if (places.includes(at)) {
                    g.push(m.key === 'vampire'
                        ? `<rect class="m-coffin" x="8" y="7" width="7" height="11" rx="1.5" transform="rotate(-12 11 12)"/>`
                        : `<rect class="m-task" x="-17" y="-17" width="7" height="7" transform="rotate(45 -13.5 -13.5)" fill="${def.color}"/>`);
                }
            });
            // 置かれたアイテム
            const items = view.board[at];
            items.slice(0, 6).forEach((id, k) => {
                const cx = -7.5 + (k % 3) * 7.5;
                const cy = items.length > 3 ? (k < 3 ? -4 : 4) : 0;
                g.push(`<rect class="m-item" x="${cx - 3}" y="${cy - 3}" width="6" height="6" rx="1.2" fill="${ITEM_COLORS[ITEMS[id].color]}"/>`);
            });
            if (items.length > 6) g.push(`<text class="m-more" x="0" y="13">+${items.length - 6}</text>`);
            // 村人
            const vs = view.villagers.map((v, k) => (v === at ? k : -1)).filter(k => k >= 0);
            vs.forEach((id, k) => g.push(`<g class="vslot" data-vil="${id}">${villagerIcon(-17 - k * 6, 13)}</g>`));
        }
        g.push('</g>');
        parts.push(g.join(''));
    });
    if (view) {
        // 英雄（地点の上に並べる）
        LOCATIONS.forEach((l, at) => {
            const here = view.players.filter(p => p.loc === at);
            here.forEach((p, k) => {
                const x = l.x - (here.length - 1) * 6 + k * 12;
                const y = l.y - 20;
                const cls = ['m-hero'];
                if (p.id === view.current && view.phase !== 'end') cls.push('current');
                parts.push(`<g class="hslot" data-hero="${p.id}"><g class="${cls.join(' ')}" transform="translate(${x} ${y})"><circle cy="-3" r="4.2" fill="${HERO[p.hero].color}"/><path d="M-5 6 Q0 -4 5 6 Z" fill="${HERO[p.hero].color}"/></g></g>`);
            });
        });
        // 怪物（地点の右上）
        LOCATIONS.forEach((l, at) => {
            const here = alive.filter(m => m.loc === at);
            here.forEach((m, k) => parts.push(`<g class="mslot" data-mon="${m.i}">${monsterBadge(m.key, l.x + 15 + k * 9, l.y - 11 + k * 9, 10, m.i === view.frenzy ? 'frenzy' : '')}</g>`));
        });
    }
    return `<svg class="map-svg${mini ? ' mini' : ''}" viewBox="-4 -8 368 316" preserveAspectRatio="xMidYMid meet" role="img" aria-label="村の地図">${parts.join('')}</svg>`;
}

export { VILLAGERS };
