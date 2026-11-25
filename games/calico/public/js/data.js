/**
 * 部品のデータ（基本ゲーム）
 * - パッチ108枚：6色×6模様×3枚
 * - 盤4枚の縁の模様：有志の実装 Dancis-S/Calico-Boardgame のデータ（青と紫はルールブックの写真と一致。緑と黄は確かめられていない。README を参照）
 * - 目標タイル6種と点、猫10匹と点・条件：公式ルールブックと、有志の実装・作者の回答で照らし合わせた（README を参照）
 */

export const COLORS = ['yellow', 'pink', 'purple', 'sky', 'green', 'navy'];
export const PATTERNS = ['stripes', 'ferns', 'dots', 'flowers', 'quatrefoil', 'vines'];
export const COPIES = 3;

// パッチ：{ color, pattern }。id は 色×18＋模様×3＋写し
export const TILES = Object.freeze(COLORS.flatMap(color => PATTERNS.flatMap(pattern =>
    Array.from({ length: COPIES }, () => Object.freeze({ color, pattern })))));

// 盤の縁（BORDER の並び）。[色の番号, 模様の番号]
const B = (list) => Object.freeze(list.map(([c, p]) => Object.freeze({ color: COLORS[c], pattern: PATTERNS[p] })));
export const BOARDS = Object.freeze([
    {
        id: 'purple', name: '紫', edges: B([[0, 3], [1, 2], [2, 3], [0, 1], [3, 0], [1, 4], [4, 2], [3, 4], [5, 0], [4, 1], [1, 5], [3, 2],
            [2, 1], [0, 4], [2, 0], [5, 1], [4, 3], [0, 5], [2, 2], [5, 4], [4, 0], [1, 1], [3, 3], [5, 5]])
    },
    {
        id: 'blue', name: '青', edges: B([[1, 5], [0, 0], [3, 5], [1, 1], [2, 4], [0, 3], [4, 0], [4, 3], [5, 4], [3, 1], [2, 0], [0, 2],
            [2, 3], [3, 4], [1, 3], [5, 1], [4, 5], [1, 2], [3, 0], [5, 3], [4, 4], [0, 1], [2, 5], [5, 2]])
    },
    {
        id: 'green', name: '緑', edges: B([[5, 1], [0, 5], [4, 1], [5, 0], [2, 4], [0, 2], [3, 5], [2, 2], [1, 4], [3, 0], [0, 3], [2, 5],
            [4, 0], [5, 2], [4, 4], [1, 0], [3, 1], [5, 3], [4, 5], [1, 2], [3, 4], [0, 0], [2, 1], [1, 3]])
    },
    {
        id: 'yellow', name: '黄', edges: B([[4, 4], [5, 3], [0, 0], [2, 2], [5, 5], [4, 1], [1, 4], [1, 1], [2, 5], [0, 2], [4, 3], [5, 4],
            [3, 5], [2, 1], [0, 5], [3, 2], [1, 0], [2, 3], [0, 4], [3, 1], [1, 5], [4, 2], [5, 0], [3, 3]])
    }
]);

// 目標タイル（点はタイルの印刷の値。2020年版のルールブックの 8 は誤りと作者が答えている。README を参照）：
// まわりの6枚の色（または模様）の数の並び（多い順）と、点（色か模様の片方／両方）
export const GOALS = Object.freeze({
    diff: { label: '≠', counts: [1, 1, 1, 1, 1, 1], one: 10, both: 15, text: 'すべて違う' },
    aaaabb: { label: 'AAAA-BB', counts: [4, 2], one: 7, both: 14, text: '4つと2つ' },
    aaabbb: { label: 'AAA-BBB', counts: [3, 3], one: 7, both: 13, text: '3つと3つ' },
    aaabbc: { label: 'AAA-BB-C', counts: [3, 2, 1], one: 7, both: 11, text: '3つ・2つ・1つ' },
    aabbcc: { label: 'AA-BB-CC', counts: [2, 2, 2], one: 7, both: 11, text: '2つ・2つ・2つ' },
    aabbcd: { label: 'AA-BB-C-D', counts: [2, 2, 1, 1], one: 5, both: 7, text: '2つ・2つ・1つ・1つ' }
});
export const GOAL_IDS = Object.keys(GOALS);
// はじめての準備で使う目標（置き場の順）
export const BEGINNER_GOALS = ['diff', 'aabbcc', 'aaabbb'];

// 猫：点、・の数（ふつうの準備で、・の数ごとに1枚ずつ選ぶ）、条件（count：同じ模様のまとまりの枚数以上、line：まっすぐ n 枚、shape：形）
// 猫の札は両面で、裏表は同じ点どうし（ミリーとキャリー、ティビットとルミ、ココナッツとテコロテ、シーラとアーモンド、グウェンとレオ）
export const CATS = Object.freeze({
    millie: { name: 'ミリー', points: 3, dots: 1, kind: 'count', size: 3, back: 'callie' },
    tibbit: { name: 'ティビット', points: 5, dots: 1, kind: 'count', size: 4, back: 'rumi' },
    coconut: { name: 'ココナッツ', points: 7, dots: 2, kind: 'count', size: 5, back: 'tecolote' },
    cira: { name: 'シーラ', points: 9, dots: 2, kind: 'count', size: 6, back: 'almond' },
    gwen: { name: 'グウェン', points: 11, dots: 3, kind: 'count', size: 7, back: 'leo' },
    callie: { name: 'キャリー', points: 3, dots: 1, kind: 'shape', size: 3, shape: 'triangle', back: 'millie' },
    rumi: { name: 'ルミ', points: 5, dots: 1, kind: 'line', size: 3, back: 'tibbit' },
    tecolote: { name: 'テコロテ', points: 7, dots: 2, kind: 'line', size: 4, back: 'coconut' },
    almond: { name: 'アーモンド', points: 9, dots: 2, kind: 'shape', size: 5, shape: 'trapezoid', back: 'cira' },
    leo: { name: 'レオ', points: 11, dots: 3, kind: 'line', size: 5, back: 'gwen' }
});
export const CAT_IDS = Object.keys(CATS);
// 札（表の猫）。・の数ごとの組
export const CAT_TILES = { 1: ['millie', 'tibbit'], 2: ['coconut', 'cira'], 3: ['gwen'] };
export const BEGINNER_CATS = ['millie', 'tibbit', 'coconut'];

export const BUTTON_POINTS = 3;
export const RAINBOW_POINTS = 3;
export const HAND_SIZE = 2;
export const MARKET_SIZE = 3;
