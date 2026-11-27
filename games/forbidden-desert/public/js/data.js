/**
 * 禁断の砂漠のデータ（タイル・役割・装備・嵐のカード・嵐の目盛り）
 * 文はどれも、原作のカードを言い換えたもの
 */

export const SIZE = 5;                 // 5×5 のマス。真ん中の1マスが嵐の目
export const CELLS = SIZE * SIZE;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const ACTIONS_PER_TURN = 4;
export const SAND_TOTAL = 48;          // 砂の駒の数。置く砂がなくなったら、砂に埋もれて負け
export const BLOCKED = 2;              // 砂が2つ以上のタイルは、ふさがっている
// 最初に砂を置く8マス（嵐の目を囲むひし形）
export const START_SAND = [2, 6, 8, 10, 14, 16, 18, 22];
export const STORM_START = 12;

// 飛行機の部品（手がかりの2枚が表になると、置き場所がわかる）
export const PARTS = [
    { key: 'propeller', name: 'プロペラ', short: 'プ', color: '#d9773a' },
    { key: 'engine', name: 'エンジン', short: 'エ', color: '#8a6fd1' },
    { key: 'crystal', name: '太陽の結晶', short: '結', color: '#e0b630' },
    { key: 'compass', name: '航法装置', short: '航', color: '#3f9bb5' }
];

// 24枚のタイル。back は裏の絵（水の印と墜落地点は、裏からわかる）
// clue の axis：row はこの行に、col はこの列に部品がある
function buildTiles() {
    const tiles = [];
    const add = (kind, extra = {}) => tiles.push({ id: tiles.length, kind, ...extra });
    add('launch');
    add('crash');
    add('water');
    add('water');
    add('mirage');
    add('tunnel');
    add('tunnel');
    add('tunnel');
    PARTS.forEach(p => {
        add('clue', { part: p.key, axis: 'row' });
        add('clue', { part: p.key, axis: 'col' });
    });
    for (let i = 0; i < 8; i++) add('gear');
    return tiles.map(t => ({ ...t, back: t.kind === 'water' || t.kind === 'mirage' ? 'water' : t.kind === 'crash' ? 'crash' : 'desert' }));
}
export const TILES = buildTiles();
export const TILE_NAMES = {
    launch: '発射台', crash: '墜落地点', water: '井戸', mirage: '蜃気楼', tunnel: 'トンネル', clue: '手がかり', gear: '遺跡'
};
// 表にすると装備を1枚引けるタイル
export const GEAR_KINDS = ['gear', 'tunnel', 'crash'];

// 役割（water：水筒の最大）
export const ROLES = [
    { key: 'archeologist', name: '考古学者', water: 3, color: '#c8553d', text: '砂を取り除くとき、1回の行動で2つ取り除ける' },
    { key: 'climber', name: '登山家', water: 3, color: '#7a5c3e', text: 'ふさがったタイルにも出入りできる。移動のとき、同じタイルの仲間を1人連れて行ける。同じタイルにいる仲間も、ふさがったタイルから出られる' },
    { key: 'explorer', name: '探検家', water: 4, color: '#3d8c5a', text: '移動・砂の除去・砂の吹き飛ばしを、斜めにもできる' },
    { key: 'meteorologist', name: '気象学者', water: 4, color: '#5a6fc8', text: '1行動で、手番の終わりに引く嵐のカードを1枚減らせる' },
    { key: 'navigator', name: '航海士', water: 4, color: '#c8a23d', text: '1行動で、ほかの仲間1人を3マスまで動かせる（その仲間の移動の決まりで）' },
    { key: 'waterCarrier', name: '水運び', water: 5, color: '#3d8fc8', text: '掘り出した井戸で、1行動で水を2つくめる。となりのタイルの仲間にも水を渡せる' }
];
export const ROLE_BY_KEY = Object.fromEntries(ROLES.map(r => [r.key, r]));

// 装備のカード（12枚）
export const GEAR = [
    { key: 'blaster', name: '砂の吹き飛ばし', count: 3, text: '自分か、となりのタイルの砂をすべて取り除く' },
    { key: 'jetpack', name: 'ジェットパック', count: 3, text: 'ふさがっていない好きなタイルへ飛ぶ。同じタイルの仲間を1人連れて行ける' },
    { key: 'shield', name: '日よけ', count: 2, text: '次の自分の手番まで、自分のタイルにいる全員が日差しで水を失わない' },
    { key: 'terrascope', name: '地中鏡', count: 2, text: 'まだ掘り出していないタイルの下を1枚のぞく' },
    { key: 'reserve', name: '秘密の水', count: 1, text: '自分のタイルにいる全員が、水を2つ得る' },
    { key: 'throttle', name: '時間の加速', count: 1, text: 'この手番の行動が2つ増える' }
];
export const GEAR_BY_KEY = Object.fromEntries(GEAR.map(g => [g.key, g]));
// カードの番号 → 種類
export const GEAR_CARDS = GEAR.flatMap(g => Array.from({ length: g.count }, () => g.key));

// 嵐のカード（31枚）：風（4方向 × 1マス3枚・2マス2枚・3マス1枚）、嵐が強まる 3枚、日差しが照りつける 4枚
export const DIRS = {
    up: { dr: -1, dc: 0, name: '北', arrow: '↑' },
    down: { dr: 1, dc: 0, name: '南', arrow: '↓' },
    left: { dr: 0, dc: -1, name: '西', arrow: '←' },
    right: { dr: 0, dc: 1, name: '東', arrow: '→' }
};
function buildStorm() {
    const cards = [];
    Object.keys(DIRS).forEach(dir => [1, 1, 1, 2, 2, 3].forEach(n => cards.push({ kind: 'wind', dir, n })));
    for (let i = 0; i < 3; i++) cards.push({ kind: 'up' });
    for (let i = 0; i < 4; i++) cards.push({ kind: 'sun' });
    return cards.map((c, id) => ({ id, ...c }));
}
export const STORM_CARDS = buildStorm();

// 嵐の目盛り：手番の終わりに引く枚数の並び。最後を越えると嵐に飲まれて負け
// 原作も人数ごとに目盛りが違う。ここでは、人数が多いほど低い段を長くした（1人ごとの手番が回りにくいぶん、嵐をゆるくする）
// 段の値は原作の写しではなく、CPU 同士の勝率（見習い7割・標準4割以上）に合わせて決めた
export const METER = {
    2: [1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6],
    3: [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5],
    4: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5],
    5: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]
};

// 難易度：嵐の目盛りのどこから始めるか
export const LEVELS = {
    novice: { name: '見習い', start: 0 },
    normal: { name: '標準', start: 1 },
    elite: { name: '熟練', start: 2 },
    legendary: { name: '伝説', start: 3 }
};

export const rowOf = (pos) => Math.floor(pos / SIZE);
export const colOf = (pos) => pos % SIZE;
export const posAt = (r, c) => (r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1);

// となりのマス（diagonal なら斜めも）
export function adjacent(pos, diagonal = false) {
    const r = rowOf(pos);
    const c = colOf(pos);
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            if (dr && dc && !diagonal) continue;
            const p = posAt(r + dr, c + dc);
            if (p >= 0) out.push(p);
        }
    }
    return out;
}
