/**
 * 自作の絵（SVG の文字列）・カードの効果の日本語の説明・記録の文。DOM に依存しない
 */

import { cardOf } from './cards.js';
import { SPACES, OFF_MARS, ROW_LENGTHS, RESOURCE_NAMES, TAG_NAMES, STANDARD_PROJECTS, MILESTONES, AWARDS } from './data.js';

export const RES_SHORT = { mc: 'M€', steel: '鋼鉄', titanium: 'チタン', plants: '植物', energy: '電力', heat: '熱' };
export const RES_COLORS = { mc: '#f2c94c', steel: '#a0703c', titanium: '#9aa3ad', plants: '#4caf50', energy: '#a259d9', heat: '#e5533d' };
export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#ecf0f1'];
const BONUS_TEXT = { steel: '鋼', titanium: 'チ', plants: '植', card: 'カ' };

// 六角のマスの中心（行ごとに半マスずつずらす）
const R = 20;
const W = Math.sqrt(3) * R;
export function hexCenter(id) {
    const [y, x] = id.split('-').map(Number);
    const offset = (9 - ROW_LENGTHS[y]) * W / 2;
    return { cx: 30 + offset + x * W, cy: 30 + y * R * 1.5 };
}
export const BOARD_SIZE = { width: 30 * 2 + 9 * W, height: 30 * 2 + 8 * R * 1.5 };
const hexPath = (cx, cy, r = R - 1) => Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

const TILE_FILL = { ocean: '#2b7fd4', greenery: '#3f9b3f', city: '#7f8c8d', special: '#5b4636' };
// 特別なタイルの色と短い名前（置いたカードで決まる）
export const SPECIAL_TILES = {
    lavaFlows: { fill: '#c0392b', label: '溶岩' }, moholeArea: { fill: '#5d4037', label: 'モホール' }, naturalPreserve: { fill: '#2e7d5b', label: '保護区' },
    nuclearZone: { fill: '#6d6d2e', label: '核' }, miningRights: { fill: '#7b5a3c', label: '採掘' }
};
// 火星の外のマスの位置（地図の左上と右上のすみ）
const OFF_MARS_AT = { phobos: { cx: 24, cy: 24 }, ganymede: { cx: BOARD_SIZE.width - 24, cy: 24 } };

function spaceSvg(id, { cx, cy }, t, base, extra, option) {
    const fill = t ? (t.type === 'special' ? SPECIAL_TILES[t.card]?.fill ?? TILE_FILL.special : TILE_FILL[t.type]) : base;
    const owner = t?.owner !== null && t?.owner !== undefined ? `<circle cx="${cx}" cy="${cy + (t.type === 'special' ? 7 : 0)}" r="5" fill="${PLAYER_COLORS[t.owner]}" stroke="#111" stroke-width="1"/>` : '';
    const icon = t?.type === 'city' ? `<path d="M${cx - 8} ${cy + 6}v-8h5v-4h6v6h5v6z" fill="#dfe6e9" stroke="#2d3436" stroke-width="1"/>${t.card === 'capital' ? `<text x="${cx}" y="${cy - 9}" class="bonus small">首都</text>` : ''}`
        : t?.type === 'greenery' ? `<path d="M${cx} ${cy - 9}l7 12h-14z" fill="#8bd17c" stroke="#245b24" stroke-width="1"/>`
        : t?.type === 'special' ? `<text x="${cx}" y="${cy + 1}" class="bonus tile-label">${SPECIAL_TILES[t.card]?.label ?? ''}</text>` : '';
    return `<g class="space ${option ? 'option' : ''}" data-space="${id}"><polygon points="${hexPath(cx, cy)}" fill="${fill}" stroke="#2a1208" stroke-width="1.2"/>${t ? '' : extra}${icon}${owner}</g>`;
}

// 地図の SVG（options のマスは光らせる）
export function boardSvg(view, options = []) {
    const opts = new Set(options);
    const cells = SPACES.map(s => {
        const at = hexCenter(s.id);
        const base = s.ocean ? '#1b4f7a' : s.reserved ? '#6e4a3a' : s.volcanic ? '#93432a' : '#b5562f';
        const bonus = s.bonus.length ? `<text x="${at.cx}" y="${at.cy + 4}" class="bonus">${s.bonus.map(b => BONUS_TEXT[b]).join('')}</text>` : '';
        const mark = s.reserved ? `<text x="${at.cx}" y="${at.cy - 6}" class="bonus small">ノクティス</text>` : s.volcanic ? `<path d="M${at.cx - 5} ${at.cy - 7}l5-6 5 6z" fill="#3a1408" opacity=".7"/>` : '';
        return spaceSvg(s.id, at, view.tiles[s.id], base, bonus + mark, opts.has(s.id));
    }).join('');
    const off = Object.entries(OFF_MARS).map(([id, o]) => {
        const at = OFF_MARS_AT[id];
        return spaceSvg(id, at, view.tiles[id], '#2c2340', '', opts.has(id)) + `<text x="${at.cx}" y="${at.cy + 27}" class="bonus small">${o.name}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${BOARD_SIZE.width.toFixed(0)} ${BOARD_SIZE.height.toFixed(0)}" class="board-svg" aria-label="タルシスの地図"><g id="board-layer">${cells}${off}</g></svg>`;
}

// タイルの名前（記録・置く場所を選ぶときの文）
export function tileName(tile, card) {
    if (tile === 'special') return `${cardOf(card).name}のタイル`;
    if (card === 'capital') return '首都';
    return { ocean: '海洋', greenery: '緑地', city: '都市' }[tile];
}

// 特別な置き場所の説明
const TILE_ON = {
    land: '陸', volcanic: '火山のマス', oceanSpace: '海洋のマス', isolated: 'どのタイルとも隣り合わないマス', mining: '鋼鉄かチタンの配置ボーナスのマス',
    nextTo2Cities: '都市 2 つの隣のマス', noctis: 'ノクティスの予約のマス', phobos: '火星の外（フォボス）', ganymede: '火星の外（ガニメデ）'
};

// ---------- カードの説明 ----------

const countText = v => {
    if (v.count === 'cities') return '（都市 1 つにつき 1）';
    if (v.count === 'citiesOnMars') return '（火星の上の都市 1 つにつき 1）';
    if (v.count === 'tagAtLeast') return `${v.else}（${TAG_NAMES[v.tag]}タグが ${v.min} つ以上なら ${v.then}）`;
    return `（${TAG_NAMES[v.tag]}タグ ${v.per} つにつき 1）`;
};
const prodText = p => Object.entries(p).map(([r, n]) => (typeof n === 'number' ? `${RES_SHORT[r]}${n > 0 ? '+' : ''}${n}` : `${RES_SHORT[r]}+${countText(n)}`)).join('・');

export function effectLines(e) {
    const lines = [];
    if (e.or) lines.push(`どちらかを選ぶ：${e.or.map(o => `生産 ${prodText(o.production)}`).join(' ／ ')}`);
    if (e.production) lines.push(`生産：${prodText(e.production)}`);
    if (e.stock) lines.push(`資源：${prodText(e.stock)}`);
    if (e.global?.temperature) lines.push(`温度 +${e.global.temperature} 段階`);
    if (e.global?.oxygen) lines.push(`酸素 +${e.global.oxygen}%`);
    if (e.tr) lines.push(`TR +${e.tr}`);
    if (e.ocean) lines.push(`海洋を ${e.ocean} 枚置く`);
    if (e.city) lines.push('都市を置く');
    if (e.greenery) lines.push(e.greenery.onOceanSpace ? '緑地を海洋のマスに置く' : '緑地を置く');
    if (e.tile) lines.push(`${e.tile.type === 'special' ? 'このカードのタイル' : { city: '都市', ocean: '海洋' }[e.tile.type]}を${e.tile.on === 'city' ? '' : `${TILE_ON[e.tile.on]}に`}置く`);
    if (e.productionAfter) lines.push(`そのあと生産：${prodText(e.productionAfter)}`);
    if (e.decreaseAnyProduction) lines.push(`だれかの${RES_SHORT[e.decreaseAnyProduction.resource]}の生産 -${e.decreaseAnyProduction.count}`);
    if (e.removeAnyPlants) lines.push(`だれかの植物を ${e.removeAnyPlants} まで取り除く`);
    if (e.draw) lines.push(`カードを ${e.draw} 枚引く`);
    if (e.removeAny) lines.push(`どれかのカードから${RESOURCE_KIND[e.removeAny.type]}を 1 つ取り除く`);
    if (e.addHere) lines.push(`このカードに${e.addHere === 1 ? '' : `${e.addHere} つ`}資源を載せる`);
    for (const a of [e.addAny ?? []].flat()) lines.push(`ほかのカードに${RESOURCE_KIND[a.type]}を ${a.count} 載せる`);
    if (e.searchForLife) lines.push('山札の一番上をめくり、微生物タグなら科学の資源を載せる');
    if (e.flood) lines.push('置いた海洋の隣のタイルの持ち主 1 人から 4 M€ を取り除いてよい');
    if (e.plantsOr) lines.push(`植物 +${e.plantsOr.plants}、または ${e.plantsOr.add.map(a => `ほかのカードに${RESOURCE_KIND[a.type]}を ${a.count}`).join('、または ')} 載せる`);
    if (e.insulation) lines.push('熱の生産を 1 以上好きなだけ減らし、同じだけ M€ の生産を増やす');
    return lines;
}

export const RESOURCE_KIND = { microbe: '微生物', animal: '動物', science: '科学' };

// 常時の効果・誘発の説明（カード名で行うもの）
export const ONGOING_TEXT = {
    adaptationTechnology: '温度・酸素・海洋の条件が 2 段階ゆるい', researchOutpost: 'カードの費用 -1 M€', shuttles: '宇宙タグのカードの費用 -2 M€',
    specialDesign: 'この世代に次に出すカード 1 枚は、温度・酸素・海洋の条件が 2 段階ゆるい', immigrantCity: 'だれかが都市を置くたびに M€ の生産 +1',
    arcticAlgae: 'だれかが海洋を置くたびに植物 +2', roverConstruction: 'だれかが都市を置くたびに +2 M€', optimalAerobraking: '宇宙タグのイベントを出すたびに +3 M€・熱 +3',
    decomposers: '植物・微生物・動物のタグを出すたびに、タグ 1 つにつきこのカードに微生物 +1', ecologicalZone: '動物・植物のタグを出すたびに、タグ 1 つにつきこのカードに動物 +1',
    herbivores: '自分が緑地を置くたびに、このカードに動物 +1', pets: 'だれかが都市を置くたびに、このカードに動物 +1（取り除かれない）'
};

// カードの行動の説明（払うもの → 効果）
export function actionLines(card, key) {
    const a = key === 'searchForLife' ? { spend: { mc: 1 }, effect: { searchForLife: true } } : card.action;
    if (!a) return [];
    return (a.or ?? [a]).map(v => {
        const spend = [v.spend?.mc ? `${v.spend.mc} M€${v.steel ? '（鋼鉄可）' : v.titanium ? '（チタン可）' : ''}` : '', v.spend?.energy ? `電力 ${v.spend.energy}` : '', v.spend?.here ? `このカードの資源 ${v.spend.here}` : ''].filter(Boolean).join('・');
        return `${spend ? `${spend} → ` : ''}${effectLines(v.effect).join('・')}`;
    });
}

export function reqText(card) {
    return (card.req ?? []).map(r => {
        if (r.tag) return `${TAG_NAMES[r.tag]}タグ ${r.count}`;
        if (r.temperature !== undefined) return `温度 ${r.temperature}℃ ${r.max ? '以下' : '以上'}`;
        if (r.oxygen !== undefined) return `酸素 ${r.oxygen}% ${r.max ? '以下' : '以上'}`;
        if (r.oceans !== undefined) return `海洋 ${r.oceans} ${r.max ? '以下' : '以上'}`;
        return '';
    }).join('・');
}

export function vpText(card) {
    if (typeof card.vp === 'number') return `${card.vp}点`;
    if (card.vp?.cities) return `都市${card.vp.per}つにつき1点`;
    if (card.vp?.tag) return `${TAG_NAMES[card.vp.tag]}タグ${card.vp.per}つにつき1点`;
    if (card.vp?.oceansNextTo) return '隣の海洋1つにつき1点';
    return '';
}

export const tagsText = tags => tags.map(t => TAG_NAMES[t]).join('・');
export const TYPE_NAMES = { automated: '自動', event: 'イベント', active: '効果' };

// ---------- 記録の文 ----------

export function describeEvent(e, view) {
    const name = s => (s === view.seat ? 'あなた' : view.players[s].name);
    switch (e.type) {
        case 'corp': return `${name(e.seat)}は${cardOf(e.corp).name}（カード${e.bought}枚を買った）`;
        case 'research': return `${name(e.seat)}がカードを${e.bought}枚買った`;
        case 'play': return `${name(e.seat)}が「${cardOf(e.card).name}」を出した`;
        case 'standard': return `${name(e.seat)}の標準プロジェクト：${STANDARD_PROJECTS[e.project].name}`;
        case 'convertPlants': return `${name(e.seat)}が植物を緑地にした`;
        case 'convertHeat': return `${name(e.seat)}が熱で温度を上げた`;
        case 'milestone': return `${name(e.seat)}がマイルストーン「${MILESTONES[e.key].name}」を取った`;
        case 'award': return `${name(e.seat)}が褒賞「${AWARDS[e.key].name}」に出資した`;
        case 'tile': return `${name(e.seat)}が${tileName(e.tile, e.card)}を置いた`;
        case 'temperature': return `温度が ${e.value}℃ に`;
        case 'oxygen': return `酸素が ${e.value}% に`;
        case 'decreaseProduction': return `${name(e.seat)}が${name(e.target)}の${RES_SHORT[e.resource]}の生産を -${e.n}`;
        case 'removePlants': return `${name(e.seat)}が${name(e.target)}の植物を ${e.n} 取り除いた`;
        case 'removeMc': return `${name(e.seat)}が${name(e.target)}の M€ を ${e.n} 取り除いた`;
        case 'pass': return `${name(e.seat)}はパス`;
        case 'cardAction': return `${name(e.seat)}が「${cardOf(e.card).name}」の行動を使った`;
        case 'addResource': return `${name(e.seat)}の「${cardOf(e.card).name}」に資源 +${e.n}`;
        case 'removeResource': return `${name(e.seat)}が${name(e.target)}の「${cardOf(e.card).name}」から資源を取り除いた`;
        case 'searchForLife': return `${name(e.seat)}の生命探査：「${cardOf(e.card).name}」をめくって${e.hit ? '見つけた' : '外れ'}`;
        case 'production': return null;
        case 'generation': return `― 第${e.generation}世代 ―`;
        case 'end': return `ゲーム終了：${e.winners.map(name).join('・')}の勝ち`;
        default: return null;
    }
}

export { RESOURCE_NAMES };
