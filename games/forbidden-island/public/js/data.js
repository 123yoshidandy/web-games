/**
 * 禁断の島のデータ（島のタイル・宝・役割・カード・水位）
 * 名前は原作の意味をくみ、言い換えて付けた
 */

// 島は 6×6 のマスのうち、角を除いた 24 マス（上から 2・4・6・6・4・2 マス）
export const GRID = 6;
export const CELLS = [2, 3, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 32, 33];
export const rowOf = (cell) => Math.floor(cell / GRID);
export const colOf = (cell) => cell % GRID;
export const cellAt = (r, c) => (r >= 0 && r < GRID && c >= 0 && c < GRID ? r * GRID + c : -1);

// 宝（0〜3）。神殿2つのどちらかで、同じ宝のカード4枚と引き換えに手に入れる
export const TREASURES = [
    { key: 'earth', name: '大地の石', short: '石', color: '#8d6bb5' },
    { key: 'wind', name: '風の像', short: '像', color: '#5fae8a' },
    { key: 'fire', name: '炎の水晶', short: '晶', color: '#d9573b' },
    { key: 'ocean', name: '海の聖杯', short: '杯', color: '#3f86c9' }
];
export const TREASURE_KEYS = TREASURES.map(t => t.key);

// タイル（0〜23）。treasure はその宝の神殿、start はその役割の始まりの場所
export const TILES = [
    { key: 'fools', name: '愚者の発着場', start: 'pilot' },
    { key: 'bronze', name: '青銅の門', start: 'engineer' },
    { key: 'copper', name: '銅の門', start: 'explorer' },
    { key: 'silver', name: '銀の門', start: 'messenger' },
    { key: 'gold', name: '金の門', start: 'navigator' },
    { key: 'iron', name: '鉄の門', start: 'diver' },
    { key: 'moon', name: '月の神殿', treasure: 0 },
    { key: 'sun', name: '太陽の神殿', treasure: 0 },
    { key: 'whisper', name: 'ささやきの庭', treasure: 1 },
    { key: 'howl', name: 'うなりの庭', treasure: 1 },
    { key: 'embers', name: '残り火の洞窟', treasure: 2 },
    { key: 'shadows', name: '影の洞窟', treasure: 2 },
    { key: 'coral', name: '珊瑚の宮殿', treasure: 3 },
    { key: 'tidal', name: '潮の宮殿', treasure: 3 },
    { key: 'bridge', name: '砕け波の橋' },
    { key: 'cliffs', name: '見捨てられた崖' },
    { key: 'forest', name: '紅の森' },
    { key: 'dunes', name: '惑わしの砂丘' },
    { key: 'lagoon', name: '失われた入り江' },
    { key: 'marsh', name: '霧の沼' },
    { key: 'observatory', name: '天文台' },
    { key: 'phantom', name: '幻の岩' },
    { key: 'hollow', name: '黄昏の窪地' },
    { key: 'watchtower', name: '見張りの塔' }
].map((t, id) => ({ id, treasure: null, start: null, ...t }));
export const TILE_COUNT = TILES.length;
export const FOOLS = 0;
export const TEMPLES = TREASURES.map((_, k) => TILES.filter(t => t.treasure === k).map(t => t.id));

// 役割
export const ROLES = [
    { key: 'pilot', name: 'パイロット', color: '#3b7dd8', text: '手番に1回、1アクションで島のどこへでも飛べる' },
    { key: 'engineer', name: '技師', color: '#d64541', text: '1アクションで2か所を補強できる' },
    { key: 'explorer', name: '探検家', color: '#3fa34d', text: '斜めにも移動・補強できる' },
    { key: 'diver', name: 'ダイバー', color: '#4a4a52', text: '1アクションで、浸水や沈んだ場所を続けて抜けて移動できる' },
    { key: 'navigator', name: '航海士', color: '#e0b028', text: '1アクションで、ほかの人を2マスまで動かせる' },
    { key: 'messenger', name: '伝令', color: '#c9ccd4', text: '島のどこにいる仲間にも、宝のカードを渡せる' }
];
export const ROLE = Object.fromEntries(ROLES.map(r => [r.key, r]));

// カード：宝のカード（宝の key）・特別なカード（heli：ヘリで脱出、sand：土のう）・水位上昇（rise）
export const SPECIALS = {
    heli: { name: 'ヘリで脱出', text: '同じ場所にいる駒を、まとめて島のどこへでも運ぶ。宝が4つそろい全員が発着場にいれば、島から脱出して勝ち' },
    sand: { name: '土のう', text: '島のどこか1か所の浸水を戻す' }
};
export const TREASURE_DECK = [
    ...TREASURE_KEYS.flatMap(k => Array(5).fill(k)),
    'heli', 'heli', 'heli', 'sand', 'sand', 'rise', 'rise', 'rise'
];
export const isTreasureCard = (card) => TREASURE_KEYS.includes(card);
export const isSpecialCard = (card) => card === 'heli' || card === 'sand';
export const cardName = (card) => (isTreasureCard(card) ? TREASURES[TREASURE_KEYS.indexOf(card)].name : card === 'rise' ? '水位上昇' : SPECIALS[card].name);

// 水位（1〜10）。数は浸水のカードを引く枚数。10 に達すると島が沈んで負け
export const MAX_WATER = 10;
export const FLOOD_RATES = [0, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5];
export const LEVELS = {
    novice: { name: '見習い', water: 1 },
    normal: { name: '標準', water: 2 },
    elite: { name: '熟練', water: 3 },
    legendary: { name: '伝説', water: 4 }
};

export const ACTIONS_PER_TURN = 3;
export const HAND_LIMIT = 5;
export const START_CARDS = 2;
export const INITIAL_FLOODS = 6;
