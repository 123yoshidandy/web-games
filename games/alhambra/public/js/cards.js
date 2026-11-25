/**
 * アルハンブラ（基本ゲーム）のデータ：建物タイル54枚・お金のカード・市場の通貨・得点の表
 *
 * 建物タイルの値段と城壁は、公開されている2つの実装を照らし合わせて作った
 * - lukfugl/alhambra の db/tiles.yml（城壁の4桁は 東・南・西・北 の順に読むと、もう一方と最もよく合う）
 * - MartienskieNum1/Alhambra-Server の src/main/resources/buildings.json
 * 54枚のうち53枚が一致した。食い違った「奴隷の家（arcades）の8」の1枚は、公式のルールブック（Queen Games）の
 * 5ページの図に描かれたタイル（右に城壁）で確かめ、lukfugl の「東」に従った
 * 得点の表は、MartienskieNum1 の ScoringTable.java・公式のルールブックの得点の表・ボードゲームアリーナの説明で一致
 */

// 建物の種類（安い順）。名前は日本語版の呼び名に合わせた
export const TYPES = ['pavilion', 'seraglio', 'arcades', 'chambers', 'garden', 'tower'];
export const TYPE_NAMES = { pavilion: 'あずまや', seraglio: '後宮', arcades: '奴隷の家', chambers: '宮殿', garden: '庭園', tower: '塔' };
export const TYPE_COUNTS = { pavilion: 7, seraglio: 7, arcades: 9, chambers: 9, garden: 11, tower: 11 };

// 通貨（市場の1〜4番の場所の順）
export const CURRENCIES = ['yellow', 'green', 'blue', 'orange'];
export const CURRENCY_NAMES = { yellow: '黄', green: '緑', blue: '青', orange: '橙' };

// 種類・値段・城壁のある辺（N 北・E 東・S 南・W 西）
const ROWS = `
pavilion 2 NEW|pavilion 3 SW|pavilion 4 ES|pavilion 5 NW|pavilion 6 N|pavilion 7 E|pavilion 8 -
seraglio 3 ESW|seraglio 4 NE|seraglio 5 SW|seraglio 6 ES|seraglio 7 W|seraglio 8 S|seraglio 9 -
arcades 4 NES|arcades 5 NW|arcades 6 SW|arcades 6 NE|arcades 7 ES|arcades 8 N|arcades 8 E|arcades 9 -|arcades 10 -
chambers 5 NSW|chambers 6 ES|chambers 7 SW|chambers 7 NE|chambers 8 NW|chambers 9 W|chambers 9 S|chambers 10 -|chambers 11 -
garden 6 ESW|garden 7 NSW|garden 8 NW|garden 8 SW|garden 8 NE|garden 9 E|garden 10 -|garden 10 N|garden 10 W|garden 11 -|garden 12 S
tower 7 NEW|tower 8 NES|tower 9 NW|tower 9 NE|tower 9 ES|tower 10 W|tower 11 -|tower 11 N|tower 11 S|tower 12 -|tower 13 E
`;

export const TILES = ROWS.trim().split(/[|\n]/).map((row, id) => {
    const [type, cost, walls] = row.trim().split(' ');
    return {
        id,
        type,
        cost: Number(cost),
        walls: { n: walls.includes('N'), e: walls.includes('E'), s: walls.includes('S'), w: walls.includes('W') }
    };
});
export const FOUNTAIN = 'F';   // 噴水（最初のタイル。城壁なし）

// お金のカード：4つの通貨 × 1〜9 × 3枚（2人なら各2枚）
export function moneyCards(copies = 3) {
    const cards = [];
    CURRENCIES.forEach(currency => {
        for (let value = 1; value <= 9; value++) {
            for (let i = 0; i < copies; i++) cards.push({ id: cards.length, currency, value });
        }
    });
    return cards;
}

// 得点の表。SCORING[回][種類] = [1位, 2位, 3位]
export const SCORING = [
    { pavilion: [1], seraglio: [2], arcades: [3], chambers: [4], garden: [5], tower: [6] },
    { pavilion: [8, 1], seraglio: [9, 2], arcades: [10, 3], chambers: [11, 4], garden: [12, 5], tower: [13, 6] },
    { pavilion: [16, 8, 1], seraglio: [17, 9, 2], arcades: [18, 10, 3], chambers: [19, 11, 4], garden: [20, 12, 5], tower: [21, 13, 6] }
];

export const START_MONEY = 20;     // 配るお金の合計（これ以上になるまで1枚ずつ）
export const TAKE_LIMIT = 5;       // 何枚か取るときの合計の上限
export const MARKET_SIZE = 4;
export const DIRK_START = 6;       // 2人のとき、ダークが最初に受け取る枚数
export const DIRK_AFTER_FIRST = 6; // 1回目の得点のあとに受け取る枚数
