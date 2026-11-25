/**
 * ブラス：バーミンガムの数表（産業タイル・町・つながり・商人・カード）
 * 町の位置（x, y）は地図の座標。人数（players）より少ない人数では、その町・商人を使わない
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const HAND_SIZE = 8;
export const START_MONEY = 17;
export const START_INCOME_SPACE = 10;   // 収入の段の 10 マス目が、収入 £0
export const LOAN_AMOUNT = 30;
export const CANAL_COST = 3;
export const RAIL_COST = 5;
export const DOUBLE_RAIL_COST = 15;
export const MERCHANT_LINK_VP = 2;      // 商人の町に隣り合うリンクの得点
export const COAL_MARKET_SIZE = 14;     // £1〜£7 が2マスずつ。空なら £8
export const IRON_MARKET_SIZE = 10;     // £1〜£5 が2マスずつ。空なら £6
export const COAL_MARKET_START = 13;
export const IRON_MARKET_START = 8;

export const INDUSTRY_ORDER = ['cotton', 'manufacturer', 'pottery', 'coal', 'iron', 'brewery'];

// 産業タイル（プレイヤーボードの表）。count は枚数、link はリンクの得点、income は売ったり使い切ったりして裏返したときに進む収入のマス
// beer は売るときに要るビール、produce は置いたときに乗る資源（醸造所は運河の時代 1、鉄道の時代 2）
// canalOnly：鉄道の時代には建てられない。railOnly：運河の時代には建てられない。noDevelop：開発で外せない
const t = (level, count, cost, coal, iron, vp, link, income, extra = {}) => ({ level, count, cost, coal, iron, vp, link, income, ...extra });

export const INDUSTRIES = {
    cotton: {
        name: '綿工場', short: '綿', sell: true,
        tiles: [
            t(1, 3, 12, 0, 0, 5, 1, 5, { beer: 1, canalOnly: true }),
            t(2, 2, 14, 1, 0, 5, 2, 4, { beer: 1 }),
            t(3, 3, 16, 1, 1, 9, 1, 3, { beer: 1 }),
            t(4, 3, 18, 1, 1, 12, 1, 2, { beer: 1 })
        ]
    },
    manufacturer: {
        name: '製造所', short: '製', sell: true,
        tiles: [
            t(1, 1, 8, 1, 0, 3, 2, 5, { beer: 1, canalOnly: true }),
            t(2, 2, 10, 0, 1, 5, 1, 1, { beer: 1 }),
            t(3, 1, 12, 2, 0, 4, 0, 4, { beer: 0 }),
            t(4, 1, 8, 0, 1, 3, 1, 6, { beer: 1 }),
            t(5, 2, 16, 1, 0, 8, 2, 2, { beer: 2 }),
            t(6, 1, 20, 0, 0, 7, 1, 6, { beer: 1 }),
            t(7, 1, 16, 1, 1, 9, 0, 4, { beer: 0 }),
            t(8, 2, 20, 0, 2, 11, 1, 1, { beer: 1 })
        ]
    },
    pottery: {
        name: '陶器', short: '陶', sell: true,
        tiles: [
            t(1, 1, 17, 0, 1, 10, 1, 5, { beer: 1, canalOnly: true, noDevelop: true }),
            t(2, 1, 0, 1, 0, 1, 1, 1, { beer: 1 }),
            t(3, 1, 22, 2, 0, 11, 1, 5, { beer: 2, noDevelop: true }),
            t(4, 1, 0, 1, 0, 1, 1, 1, { beer: 1 }),
            t(5, 1, 24, 2, 0, 20, 1, 5, { beer: 2, railOnly: true })
        ]
    },
    coal: {
        name: '炭鉱', short: '炭', resource: 'coal',
        tiles: [
            t(1, 1, 5, 0, 0, 1, 2, 4, { produce: 2, canalOnly: true }),
            t(2, 2, 7, 0, 0, 2, 1, 7, { produce: 3 }),
            t(3, 2, 8, 0, 1, 3, 1, 6, { produce: 4 }),
            t(4, 2, 10, 0, 1, 4, 1, 5, { produce: 5 })
        ]
    },
    iron: {
        name: '製鉄所', short: '鉄', resource: 'iron',
        tiles: [
            t(1, 1, 5, 1, 0, 3, 1, 3, { produce: 4, canalOnly: true }),
            t(2, 1, 7, 1, 0, 5, 1, 3, { produce: 4 }),
            t(3, 1, 9, 1, 0, 7, 1, 2, { produce: 5 }),
            t(4, 1, 12, 1, 0, 9, 1, 1, { produce: 6 })
        ]
    },
    brewery: {
        name: '醸造所', short: '酒', resource: 'beer',
        tiles: [
            t(1, 2, 5, 0, 1, 4, 2, 4, { canalOnly: true }),
            t(2, 2, 7, 0, 1, 5, 2, 5),
            t(3, 2, 9, 0, 1, 7, 2, 5),
            t(4, 1, 9, 0, 1, 10, 2, 5)
        ]
    }
};

export const tileDef = (industry, level) => INDUSTRIES[industry].tiles[level - 1];

// 町。slots は建てる場所ごとに、建てられる産業。cards は [2人, 3人, 4人] のときの場所カードの枚数
const C = 'cotton';
const M = 'manufacturer';
const P = 'pottery';
const K = 'coal';
const I = 'iron';
const B = 'brewery';

export const LOCATIONS = {
    leek: { name: 'リーク', x: 400, y: 70, players: 3, cards: [0, 2, 2], slots: [[C, M], [C, K]] },
    stoke: { name: 'ストーク', x: 215, y: 175, players: 3, cards: [0, 3, 3], slots: [[C, M], [P, I], [M]] },
    belper: { name: 'ベルパー', x: 700, y: 70, players: 4, cards: [0, 0, 2], slots: [[C, M], [K], [P]] },
    derby: { name: 'ダービー', x: 740, y: 215, players: 4, cards: [0, 0, 3], slots: [[C, B], [C, M], [I]] },
    stone: { name: 'ストーン', x: 220, y: 320, players: 3, cards: [0, 2, 2], slots: [[C, B], [M, K]] },
    uttoxeter: { name: 'アトックスター', x: 470, y: 270, players: 3, cards: [0, 1, 2], slots: [[M, B], [C, B]] },
    stafford: { name: 'スタッフォード', x: 205, y: 460, players: 2, cards: [2, 2, 2], slots: [[M, B], [P]] },
    burton: { name: 'バートン', x: 640, y: 410, players: 2, cards: [2, 2, 2], slots: [[M, K], [B]] },
    cannock: { name: 'キャノック', x: 380, y: 560, players: 2, cards: [2, 2, 2], slots: [[M, K], [K]] },
    tamworth: { name: 'タムワース', x: 720, y: 600, players: 2, cards: [1, 1, 1], slots: [[C, K], [C, K]] },
    walsall: { name: 'ウォルソール', x: 500, y: 700, players: 2, cards: [1, 1, 1], slots: [[I, M], [M, B]] },
    wolverhampton: { name: 'ウルヴァーハンプトン', x: 250, y: 720, players: 2, cards: [2, 2, 2], slots: [[M], [M, K]] },
    coalbrookdale: { name: 'コールブルックデール', x: 120, y: 880, players: 2, cards: [3, 3, 3], slots: [[I, B], [I], [K]] },
    dudley: { name: 'ダドリー', x: 330, y: 880, players: 2, cards: [2, 2, 2], slots: [[K], [I]] },
    birmingham: { name: 'バーミンガム', x: 590, y: 890, players: 2, cards: [3, 3, 3], slots: [[C, M], [M], [I], [M]] },
    nuneaton: { name: 'ナニートン', x: 860, y: 740, players: 2, cards: [1, 1, 1], slots: [[M, B], [C, K]] },
    coventry: { name: 'コヴェントリー', x: 860, y: 960, players: 2, cards: [3, 3, 3], slots: [[P], [M, K], [I, M]] },
    kidderminster: { name: 'キダーミンスター', x: 190, y: 1040, players: 2, cards: [2, 2, 2], slots: [[C, K], [C]] },
    worcester: { name: 'ウスター', x: 330, y: 1190, players: 2, cards: [2, 2, 2], slots: [[C], [C]] },
    redditch: { name: 'レディッチ', x: 600, y: 1090, players: 2, cards: [1, 1, 1], slots: [[M, K], [I]] },
    farm1: { name: '農場', x: 110, y: 590, players: 2, cards: [0, 0, 0], slots: [[B]], farm: true },
    farm2: { name: '農場', x: 90, y: 1170, players: 2, cards: [0, 0, 0], slots: [[B]], farm: true }
};

// 商人の町。slots は商人タイルを置く数、bonus は商人のビールで売ったときのおまけ
export const MERCHANTS = {
    warrington: { name: 'ウォリントン', x: 60, y: 70, players: 3, slots: 2, bonus: { type: 'money', amount: 5 } },
    nottingham: { name: 'ノッティンガム', x: 930, y: 120, players: 4, slots: 2, bonus: { type: 'vp', amount: 3 } },
    shrewsbury: { name: 'シュルーズベリー', x: 40, y: 740, players: 2, slots: 1, bonus: { type: 'vp', amount: 4 } },
    gloucester: { name: 'グロスター', x: 470, y: 1290, players: 2, slots: 2, bonus: { type: 'develop' } },
    oxford: { name: 'オックスフォード', x: 850, y: 1160, players: 2, slots: 2, bonus: { type: 'income', amount: 2 } }
};

// 商人タイル（人数ごとに足す）。any はどの品でも買う。blank は何も買わない
export const MERCHANT_TILES = {
    2: ['cotton', 'manufacturer', 'any', 'blank', 'blank'],
    3: ['pottery', 'manufacturer'],
    4: ['cotton', 'any']
};

// つながり（リンク）。canal・rail は、運河・鉄道を引けるか。ends は端の町（3つの町にまたがるものもある）
const link = (id, ends, canal = true, rail = true) => ({ id, ends, canal, rail });
export const LINKS = [
    link('warrington-stoke', ['warrington', 'stoke']),
    link('leek-stoke', ['leek', 'stoke']),
    link('leek-belper', ['leek', 'belper'], false, true),
    link('stoke-stone', ['stoke', 'stone']),
    link('stone-uttoxeter', ['stone', 'uttoxeter'], false, true),
    link('stone-stafford', ['stone', 'stafford']),
    link('stone-burton', ['stone', 'burton']),
    link('uttoxeter-derby', ['uttoxeter', 'derby'], false, true),
    link('belper-derby', ['belper', 'derby'], false, true),
    link('derby-nottingham', ['derby', 'nottingham']),
    link('derby-burton', ['derby', 'burton']),
    link('stafford-cannock', ['stafford', 'cannock']),
    link('burton-cannock', ['burton', 'cannock'], false, true),
    link('burton-tamworth', ['burton', 'tamworth']),
    link('burton-walsall', ['burton', 'walsall'], true, false),
    link('cannock-farm1', ['cannock', 'farm1']),
    link('cannock-wolverhampton', ['cannock', 'wolverhampton']),
    link('cannock-walsall', ['cannock', 'walsall']),
    link('wolverhampton-coalbrookdale', ['wolverhampton', 'coalbrookdale']),
    link('wolverhampton-dudley', ['wolverhampton', 'dudley']),
    link('wolverhampton-walsall', ['wolverhampton', 'walsall']),
    link('coalbrookdale-shrewsbury', ['coalbrookdale', 'shrewsbury']),
    link('coalbrookdale-kidderminster', ['coalbrookdale', 'kidderminster']),
    link('walsall-birmingham', ['walsall', 'birmingham']),
    link('walsall-tamworth', ['walsall', 'tamworth'], false, true),
    link('tamworth-birmingham', ['tamworth', 'birmingham']),
    link('tamworth-nuneaton', ['tamworth', 'nuneaton']),
    link('nuneaton-coventry', ['nuneaton', 'coventry'], false, true),
    link('nuneaton-birmingham', ['nuneaton', 'birmingham'], false, true),
    link('birmingham-coventry', ['birmingham', 'coventry']),
    link('birmingham-oxford', ['birmingham', 'oxford']),
    link('birmingham-redditch', ['birmingham', 'redditch'], false, true),
    link('birmingham-worcester', ['birmingham', 'worcester']),
    link('birmingham-dudley', ['birmingham', 'dudley']),
    link('dudley-kidderminster', ['dudley', 'kidderminster']),
    link('kidderminster-worcester', ['kidderminster', 'worcester', 'farm2']),
    link('worcester-gloucester', ['worcester', 'gloucester']),
    link('redditch-gloucester', ['redditch', 'gloucester']),
    link('redditch-oxford', ['redditch', 'oxford'])
];
export const LINK_BY_ID = Object.fromEntries(LINKS.map(l => [l.id, l]));

// 産業カード。cards は [2人, 3人, 4人] の枚数
export const INDUSTRY_CARDS = [
    { industries: [I], cards: [4, 4, 4] },
    { industries: [K], cards: [2, 2, 3] },
    { industries: [B], cards: [5, 5, 5] },
    { industries: [C, M], cards: [0, 6, 8] },
    { industries: [P], cards: [2, 2, 3] }
];

export const WILD_COUNT = 4;    // ワイルドカード（場所・産業）の枚数

export const PLAYER_COLORS = ['#d9534f', '#3f7fd6', '#e2b33c', '#4fae6a'];
export const PLAYER_COLOR_NAMES = ['赤', '青', '黄', '緑'];

export const placeName = (id) => (LOCATIONS[id] ?? MERCHANTS[id])?.name ?? id;
