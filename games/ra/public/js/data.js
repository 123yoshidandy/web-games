/**
 * ラー（基本ゲーム）のデータ
 * タイルの内訳・太陽駒の組・ラーのトラックの長さ・点の表は、ルールブック（Rio Grande 2008 年の英語版）と有志の実装で照らし合わせた（README を参照）
 * 説明の文は自分で書いたもの（公式の文は写していない）
 */

// タイルの種類。group：手元の並べ方と点の数え方のまとまり
export const TILES = {
    ra: { name: 'ラー', group: 'ra', count: 30, bg: '#9e2a1f' },
    god: { name: '神', group: 'god', count: 8, bg: '#2b7a78' },
    gold: { name: '金', group: 'gold', count: 5, bg: '#3a2a14' },
    pharaoh: { name: 'ファラオ', group: 'pharaoh', count: 25, bg: '#2a3d6b' },
    nile: { name: 'ナイル河', group: 'river', count: 25, bg: '#2f6ea8' },
    flood: { name: '洪水', group: 'river', count: 12, bg: '#2f6ea8' },
    astronomy: { name: '天文学', group: 'civ', count: 5, bg: '#6b4a8c' },
    agriculture: { name: '農業', group: 'civ', count: 5, bg: '#6b4a8c' },
    writing: { name: '文字', group: 'civ', count: 5, bg: '#6b4a8c' },
    religion: { name: '宗教', group: 'civ', count: 5, bg: '#6b4a8c' },
    art: { name: '芸術', group: 'civ', count: 5, bg: '#6b4a8c' },
    fortress: { name: '要塞', group: 'monument', count: 5, bg: '#c9a96b' },
    obelisk: { name: 'オベリスク', group: 'monument', count: 5, bg: '#c9a96b' },
    palace: { name: '宮殿', group: 'monument', count: 5, bg: '#c9a96b' },
    pyramid: { name: 'ピラミッド', group: 'monument', count: 5, bg: '#c9a96b' },
    temple: { name: '神殿', group: 'monument', count: 5, bg: '#c9a96b' },
    statue: { name: '像', group: 'monument', count: 5, bg: '#c9a96b' },
    stepPyramid: { name: '階段ピラミッド', group: 'monument', count: 5, bg: '#c9a96b' },
    sphinx: { name: 'スフィンクス', group: 'monument', count: 5, bg: '#c9a96b' },
    funeral: { name: '葬式', group: 'disaster', count: 2, bg: '#2a2421', hits: 'ファラオ' },
    drought: { name: '干ばつ', group: 'disaster', count: 2, bg: '#2a2421', hits: '洪水（なければナイル河）' },
    unrest: { name: '内乱', group: 'disaster', count: 4, bg: '#2a2421', hits: '文明' },
    earthquake: { name: '地震', group: 'disaster', count: 2, bg: '#2a2421', hits: 'モニュメント' }
};
export const TILE_ORDER = Object.keys(TILES);
export const CIVS = TILE_ORDER.filter(t => TILES[t].group === 'civ');
export const MONUMENTS = TILE_ORDER.filter(t => TILES[t].group === 'monument');
export const DISASTERS = TILE_ORDER.filter(t => TILES[t].group === 'disaster');
// 災害が捨てさせるタイル
export const DISASTER_TARGETS = { funeral: ['pharaoh'], drought: ['flood', 'nile'], unrest: CIVS, earthquake: MONUMENTS };

// 太陽駒の組（人数ごと）。中央には最初に1を置く
export const SUN_SETS = {
    2: [[9, 6, 5, 2], [8, 7, 4, 3]],
    3: [[13, 8, 5, 2], [12, 9, 6, 3], [11, 10, 7, 4]],
    4: [[13, 6, 2], [12, 7, 3], [11, 8, 4], [10, 9, 5]],
    5: [[16, 7, 2], [15, 8, 3], [14, 9, 4], [13, 10, 5], [12, 11, 6]]
};
// ラーのトラックの長さ（このラーが置かれたら時代が終わる）
export const RA_TRACK = { 2: 6, 3: 8, 4: 9, 5: 10 };
export const AUCTION_MAX = 8;
export const EPOCHS = 3;
export const START_SCORE = 10;

// 点
export const POINTS = {
    god: 2, gold: 3, pharaohMost: 5, pharaohFewest: -2, noCiv: -5,
    civ: { 3: 5, 4: 10, 5: 15 },
    monumentKinds: [0, 1, 2, 3, 4, 5, 6, 10, 15],
    monumentSame: { 3: 5, 4: 10, 5: 15 },
    sunMost: 5, sunFewest: -5
};
