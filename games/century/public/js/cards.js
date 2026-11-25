/**
 * センチュリー：スパイスロード（基本ゲーム）のカードのデータ
 * 公開されている3つの実装（別々の作者の JavaScript・Python・Python）のデータを突き合わせ、完全に一致したもの
 * 香辛料は Y 黄（ターメリック）・R 赤（サフラン）・G 緑（カルダモン）・B 茶（シナモン）。この順に格が上がる
 *   P:… 香辛料を得る / T:入る>出る 交換 / U数 格上げ（その回数まで）
 */

export const SPICES = ['Y', 'R', 'G', 'B'];
export const SPICE_NAMES = ['黄', '赤', '緑', '茶'];

const count = (letters) => SPICES.map(s => [...letters].filter(c => c === s).length);

function parseMerchant(code) {
    if (code.startsWith('U')) return { kind: 'upgrade', upgrades: Number(code.slice(1)), in: [0, 0, 0, 0], out: [0, 0, 0, 0] };
    if (code.startsWith('P:')) return { kind: 'produce', upgrades: 0, in: [0, 0, 0, 0], out: count(code.slice(2)) };
    const [from, to] = code.slice(2).split('>');
    return { kind: 'trade', upgrades: 0, in: count(from), out: count(to) };
}

// 最初の手札（各自に1枚ずつ）：黄2個を得る・格上げ2回
const STARTING = ['P:YY', 'U2'];

// 商人カード43枚
const DECK = [
    'U3', 'P:G', 'P:B', 'P:YR', 'P:YG', 'P:RR', 'P:YYY', 'P:YYR', 'P:YYYY',
    'T:R>YYY', 'T:G>RR', 'T:G>YRR', 'T:G>YYYYR', 'T:B>GG', 'T:B>YRG', 'T:B>RRR', 'T:B>YYYG', 'T:B>YYRR',
    'T:YY>G', 'T:YY>RR', 'T:YR>B', 'T:RR>GG', 'T:RR>YYB', 'T:RR>YYYG', 'T:GG>BB', 'T:GG>RRB', 'T:GG>YYRB',
    'T:GG>YYRRR', 'T:BB>YRGGG', 'T:BB>RRRGG', 'T:YYY>B', 'T:YYY>RG', 'T:YYY>RRR', 'T:YYG>BB', 'T:RRR>BB',
    'T:RRR>YGB', 'T:RRR>GGG', 'T:RRR>YYGG', 'T:GGG>BBB', 'T:YYYY>GG', 'T:YYYY>GB', 'T:YYYYY>BB', 'T:YYYYY>GGG'
];

// 得点カード36枚（点数:必要な香辛料）
const POINTS = [
    '6:YYRR', '7:YYYRR', '8:YYGG', '8:RRRR', '8:YYRRR', '9:YYRB', '9:YYYGG', '10:YYBB', '10:RRGG', '10:RRRRR',
    '11:YYGGG', '11:YYYBB', '12:YRGB', '12:RRGB', '12:YGGB', '12:GGGG', '12:RRBB', '12:RRRGG', '13:RRGGG',
    '13:YYRRGG', '14:GGBB', '14:RRRBB', '14:YYBBB', '14:YYYRGB', '15:GGGGG', '15:YYRRBB', '16:BBBB', '16:RRBBB',
    '16:YRRRGB', '17:GGGBB', '17:YYGGBB', '18:GGBBB', '18:YRGGGB', '19:RRGGBB', '20:BBBBB', '20:YRGBBB'
];

// 商人カードの id は、最初の手札の2種類が 0・1（人数ぶん配る）、山が 2〜44
export const MERCHANTS = [...STARTING, ...DECK].map((code, id) => Object.freeze({ id, code, ...parseMerchant(code) }));
export const STARTING_IDS = [0, 1];
export const DECK_IDS = DECK.map((_, i) => i + 2);
export const POINT_CARDS = POINTS.map((text, id) => {
    const [points, cost] = text.split(':');
    return Object.freeze({ id, points: Number(points), cost: count(cost) });
});

// 手番の順に最初にもらう香辛料（黄・赤・緑・茶の数）
export const STARTING_SPICES = [[3, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0], [3, 1, 0, 0], [3, 1, 0, 0]];
