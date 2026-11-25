/**
 * カード・七不思議・進歩トークンのデータ（世界の七不思議デュエル 基本ゲーム）
 * 名前は日本語に訳したもの（訳は自分で付けた）。効果の文は自分で書いたもの
 *
 * 費用は文字列で書く：数字はコイン、W=木 C=粘土 S=石 G=ガラス P=パピルス（'2'、'WWG'、'3C' など）
 * 連鎖：chain は、持っていると次の時代のカードを無料にする印。free は、その印があれば無料で建てられる
 */

export const RESOURCES = ['wood', 'clay', 'stone', 'glass', 'papyrus'];
export const RESOURCE_NAMES = { wood: '木', clay: '粘土', stone: '石', glass: 'ガラス', papyrus: 'パピルス' };
const LETTERS = { W: 'wood', C: 'clay', S: 'stone', G: 'glass', P: 'papyrus' };

export const COLORS = ['brown', 'grey', 'blue', 'green', 'red', 'yellow', 'purple'];
export const COLOR_NAMES = { brown: '茶', grey: '灰', blue: '青', green: '緑', red: '赤', yellow: '黄', purple: '紫' };

export const SCIENCE = ['globe', 'wheel', 'sundial', 'mortar', 'compass', 'quill', 'law'];
export const SCIENCE_NAMES = {
    globe: '天球儀', wheel: '車輪', sundial: '日時計', mortar: '乳鉢', compass: '定規', quill: '羽ペン', law: '天秤'
};

// 費用の文字列を { coins, wood, ... } にする
export function parseCost(text = '') {
    const cost = { coins: 0 };
    RESOURCES.forEach(r => { cost[r] = 0; });
    const digits = text.match(/\d+/);
    if (digits) cost.coins = Number(digits[0]);
    for (const ch of text.replace(/\d+/g, '')) cost[LETTERS[ch]] += 1;
    return cost;
}

// 生む資源の文字列を { wood: 2 } の形にする
const parseProduce = (text) => {
    const out = {};
    for (const ch of text) out[LETTERS[ch]] = (out[LETTERS[ch]] ?? 0) + 1;
    return out;
};
const parseChoice = (text) => [...text].map(ch => LETTERS[ch]);

const card = (key, name, age, color, cost, effect = {}) => ({
    key, name, age, color, cost: parseCost(cost), costText: cost,
    produce: effect.produce ? parseProduce(effect.produce) : null,
    choice: effect.choice ? parseChoice(effect.choice) : null,
    reserve: effect.reserve ? parseChoice(effect.reserve) : null,
    vp: effect.vp ?? 0,
    shields: effect.shields ?? 0,
    science: effect.science ?? null,
    coins: effect.coins ?? 0,
    per: effect.per ?? null,       // 黄（時代III）：{ colors, coins } または { wonders: true, coins }
    guild: effect.guild ?? null,   // ギルド：{ count, coins, vp }
    chain: effect.chain ?? null,
    free: effect.free ?? null
});

export const CARDS = Object.fromEntries([
    // ---- 時代I ----
    card('lumberYard', '木材置き場', 1, 'brown', '', { produce: 'W' }),
    card('loggingCamp', '伐採所', 1, 'brown', '1', { produce: 'W' }),
    card('clayPool', '粘土の池', 1, 'brown', '', { produce: 'C' }),
    card('clayPit', '粘土坑', 1, 'brown', '1', { produce: 'C' }),
    card('quarry', '石切り場', 1, 'brown', '', { produce: 'S' }),
    card('stonePit', '採石坑', 1, 'brown', '1', { produce: 'S' }),
    card('glassworks', 'ガラス工房', 1, 'grey', '1', { produce: 'G' }),
    card('press', '製紙所', 1, 'grey', '1', { produce: 'P' }),
    card('theater', '劇場', 1, 'blue', '', { vp: 3, chain: 'mask' }),
    card('altar', '祭壇', 1, 'blue', '', { vp: 3, chain: 'moon' }),
    card('baths', '浴場', 1, 'blue', 'S', { vp: 3, chain: 'drop' }),
    card('apothecary', '薬屋', 1, 'green', 'G', { science: 'wheel', vp: 1 }),
    card('workshop', '作業場', 1, 'green', 'P', { science: 'compass', vp: 1 }),
    card('scriptorium', '写本室', 1, 'green', '2', { science: 'quill', chain: 'book' }),
    card('pharmacist', '薬剤師', 1, 'green', '2', { science: 'mortar', chain: 'gear' }),
    card('stable', '厩舎', 1, 'red', 'W', { shields: 1, chain: 'horseshoe' }),
    card('garrison', '駐屯地', 1, 'red', 'C', { shields: 1, chain: 'sword' }),
    card('palisade', '柵', 1, 'red', '2', { shields: 1, chain: 'tower' }),
    card('guardTower', '見張り塔', 1, 'red', '', { shields: 1 }),
    card('tavern', '酒場', 1, 'yellow', '', { coins: 4, chain: 'jug' }),
    card('stoneReserve', '石の蓄え', 1, 'yellow', '3', { reserve: 'S' }),
    card('clayReserve', '粘土の蓄え', 1, 'yellow', '3', { reserve: 'C' }),
    card('woodReserve', '木の蓄え', 1, 'yellow', '3', { reserve: 'W' }),

    // ---- 時代II ----
    card('sawmill', '製材所', 2, 'brown', '2', { produce: 'WW' }),
    card('brickyard', 'れんが工場', 2, 'brown', '2', { produce: 'CC' }),
    card('shelfQuarry', '岩棚の石切り場', 2, 'brown', '2', { produce: 'SS' }),
    card('glassBlower', 'ガラス吹き', 2, 'grey', '', { produce: 'G' }),
    card('dryingRoom', '乾燥室', 2, 'grey', '', { produce: 'P' }),
    card('tribunal', '法廷', 2, 'blue', 'WWG', { vp: 5 }),
    card('statue', '彫像', 2, 'blue', 'CC', { vp: 4, free: 'mask', chain: 'column' }),
    card('temple', '神殿', 2, 'blue', 'WP', { vp: 4, free: 'moon', chain: 'sun' }),
    card('aqueduct', '水道橋', 2, 'blue', 'SSS', { vp: 5, free: 'drop' }),
    card('rostrum', '演壇', 2, 'blue', 'SW', { vp: 4, chain: 'scroll' }),
    card('library', '図書館', 2, 'green', 'SWG', { science: 'quill', vp: 2, free: 'book' }),
    card('dispensary', '調剤所', 2, 'green', 'CCS', { science: 'mortar', vp: 2, free: 'gear' }),
    card('school', '学校', 2, 'green', 'WPP', { science: 'wheel', vp: 1, chain: 'harp' }),
    card('laboratory', '研究所', 2, 'green', 'WGG', { science: 'compass', vp: 1, chain: 'lamp' }),
    card('horseBreeders', '馬の牧場', 2, 'red', 'CW', { shields: 1, free: 'horseshoe' }),
    card('barracks', '兵舎', 2, 'red', '3', { shields: 1, free: 'sword' }),
    card('archeryRange', '弓の訓練場', 2, 'red', 'SWP', { shields: 2, chain: 'target' }),
    card('paradeGround', '練兵場', 2, 'red', 'CCG', { shields: 2, chain: 'helmet' }),
    card('walls', '城壁', 2, 'red', 'SS', { shields: 2 }),
    card('forum', '広場', 2, 'yellow', '3C', { choice: 'GP' }),
    card('caravansery', '隊商宿', 2, 'yellow', '2GP', { choice: 'WCS' }),
    card('customsHouse', '税関', 2, 'yellow', '4', { reserve: 'GP' }),
    card('brewery', '醸造所', 2, 'yellow', '', { coins: 6, chain: 'barrel' }),

    // ---- 時代III ----
    card('palace', '宮殿', 3, 'blue', 'CSWGG', { vp: 7 }),
    card('townHall', '市庁舎', 3, 'blue', 'SSSWW', { vp: 7 }),
    card('obelisk', 'オベリスク', 3, 'blue', 'SSG', { vp: 5 }),
    card('gardens', '庭園', 3, 'blue', 'CCWW', { vp: 6, free: 'column' }),
    card('pantheon', 'パンテオン', 3, 'blue', 'CWPP', { vp: 6, free: 'sun' }),
    card('senate', '元老院', 3, 'blue', 'CCSP', { vp: 5, free: 'scroll' }),
    card('academy', '学園', 3, 'green', 'SWGG', { science: 'sundial', vp: 3 }),
    card('study', '書斎', 3, 'green', 'WWGP', { science: 'sundial', vp: 3 }),
    card('university', '大学', 3, 'green', 'CGP', { science: 'globe', vp: 2, free: 'harp' }),
    card('observatory', '天文台', 3, 'green', 'SPP', { science: 'globe', vp: 2, free: 'lamp' }),
    card('fortifications', '要塞', 3, 'red', 'SSCP', { shields: 2, free: 'tower' }),
    card('siegeWorkshop', '攻城兵器の工房', 3, 'red', 'WWWG', { shields: 2, free: 'target' }),
    card('circus', '競技場', 3, 'red', 'CCSS', { shields: 2, free: 'helmet' }),
    card('arsenal', '兵器庫', 3, 'red', 'CCCWW', { shields: 3 }),
    card('pretorium', '近衛兵の宿舎', 3, 'red', '8', { shields: 3 }),
    card('chamberOfCommerce', '商工会議所', 3, 'yellow', 'PP', { vp: 3, per: { colors: ['grey'], coins: 3 } }),
    card('port', '港', 3, 'yellow', 'WGP', { vp: 3, per: { colors: ['brown'], coins: 2 } }),
    card('armory', '武器庫', 3, 'yellow', 'SSG', { vp: 3, per: { colors: ['red'], coins: 1 } }),
    card('lighthouse', '灯台', 3, 'yellow', 'CCG', { vp: 3, per: { colors: ['yellow'], coins: 1 }, free: 'jug' }),
    card('arena', '闘技場', 3, 'yellow', 'CSW', { vp: 3, per: { wonders: true, coins: 2 }, free: 'barrel' }),

    // ---- ギルド（時代IIIに3枚） ----
    card('merchantsGuild', '商人のギルド', 3, 'purple', 'CWGP', { guild: { count: ['yellow'], coins: 1, vp: 1 } }),
    card('shipownersGuild', '船主のギルド', 3, 'purple', 'CSGP', { guild: { count: ['brown', 'grey'], coins: 1, vp: 1 } }),
    card('buildersGuild', '建築家のギルド', 3, 'purple', 'SSCWG', { guild: { count: ['wonders'], coins: 0, vp: 2 } }),
    card('magistratesGuild', '行政官のギルド', 3, 'purple', 'WWCP', { guild: { count: ['blue'], coins: 1, vp: 1 } }),
    card('scientistsGuild', '科学者のギルド', 3, 'purple', 'CCWW', { guild: { count: ['green'], coins: 1, vp: 1 } }),
    card('moneylendersGuild', '金貸しのギルド', 3, 'purple', 'SSWW', { guild: { count: ['money'], coins: 0, vp: 1 } }),
    card('tacticiansGuild', '戦術家のギルド', 3, 'purple', 'SSCP', { guild: { count: ['red'], coins: 1, vp: 1 } })
].map(c => [c.key, c]));

export const AGE_CARDS = [1, 2, 3].map(age => Object.values(CARDS).filter(c => c.age === age && c.color !== 'purple').map(c => c.key));
export const GUILDS = Object.values(CARDS).filter(c => c.color === 'purple').map(c => c.key);

const wonder = (key, name, cost, effect = {}) => ({
    key, name, cost: parseCost(cost), costText: cost,
    vp: effect.vp ?? 0,
    coins: effect.coins ?? 0,
    loss: effect.loss ?? 0,          // 相手が失うコイン
    shields: effect.shields ?? 0,
    replay: !!effect.replay,
    choice: effect.choice ? parseChoice(effect.choice) : null,
    destroy: effect.destroy ?? null, // 相手のこの色のカードを1枚捨てさせる
    revive: !!effect.revive,         // 捨て札から1枚を無料で建てる
    library: !!effect.library        // 使われていない進歩トークンから3枚引いて1枚
});

export const WONDERS = Object.fromEntries([
    wonder('appianWay', 'アッピア街道', 'SSCCP', { coins: 3, loss: 3, replay: true, vp: 3 }),
    wonder('circusMaximus', '大競技場', 'SSWG', { destroy: 'grey', shields: 1, vp: 3 }),
    wonder('colossus', '巨像', 'CCCG', { shields: 2, vp: 3 }),
    wonder('greatLibrary', '大図書館', 'WWWGP', { library: true, vp: 4 }),
    wonder('greatLighthouse', '大灯台', 'WSPP', { choice: 'WCS', vp: 4 }),
    wonder('hangingGardens', '空中庭園', 'WWGP', { coins: 6, replay: true, vp: 3 }),
    wonder('mausoleum', '霊廟', 'CCGGP', { revive: true, vp: 2 }),
    wonder('piraeus', 'ピレウス港', 'WWSC', { choice: 'GP', replay: true, vp: 2 }),
    wonder('pyramids', 'ピラミッド', 'SSSP', { vp: 9 }),
    wonder('sphinx', 'スフィンクス', 'SCGG', { replay: true, vp: 6 }),
    wonder('statueOfZeus', 'ゼウス像', 'SWCPP', { destroy: 'brown', shields: 1, vp: 3 }),
    wonder('templeOfArtemis', 'アルテミス神殿', 'WSGP', { coins: 12, replay: true })
].map(w => [w.key, w]));
export const WONDER_ORDER = Object.keys(WONDERS);

export const TOKENS = {
    agriculture: { key: 'agriculture', name: '農業', text: '6コインと4点' },
    architecture: { key: 'architecture', name: '建築', text: 'これから建てる七不思議は、資源が2つ少なくて済む' },
    economy: { key: 'economy', name: '経済', text: '相手が資源を買うのに払ったコインを受け取る' },
    law: { key: 'law', name: '法', text: '科学の印（天秤）1つ' },
    masonry: { key: 'masonry', name: '石工', text: 'これから建てる青のカードは、資源が2つ少なくて済む' },
    mathematics: { key: 'mathematics', name: '数学', text: '終わりに、進歩トークン1枚につき3点（これも含む）' },
    philosophy: { key: 'philosophy', name: '哲学', text: '7点' },
    strategy: { key: 'strategy', name: '戦略', text: 'これから建てる赤のカードは、盾が1つ多い' },
    theology: { key: 'theology', name: '神学', text: 'これから建てる七不思議は、すべて「もう1手」が付く' },
    urbanism: { key: 'urbanism', name: '都市計画', text: '6コイン。これから連鎖で無料で建てるたびに4コイン' }
};
export const TOKEN_ORDER = Object.keys(TOKENS);

// 時代ごとのカードの並べ方。上の行から順に、各行の左端の位置（カードの幅を2とする単位）と表か裏か
// カードは、すぐ下の行の、横に重なるカードに覆われる
const rowsOf = (spec) => spec.map(([count, start, faceUp]) => ({ count, start, faceUp }));
export const LAYOUTS = {
    1: rowsOf([[2, 4, true], [3, 3, false], [4, 2, true], [5, 1, false], [6, 0, true]]),
    2: rowsOf([[6, 0, true], [5, 1, false], [4, 2, true], [3, 3, false], [2, 4, true]]),
    3: [
        { count: 2, xs: [2, 4], faceUp: true },
        { count: 3, xs: [1, 3, 5], faceUp: false },
        { count: 4, xs: [0, 2, 4, 6], faceUp: true },
        { count: 2, xs: [1, 5], faceUp: false },
        { count: 4, xs: [0, 2, 4, 6], faceUp: true },
        { count: 3, xs: [1, 3, 5], faceUp: false },
        { count: 2, xs: [2, 4], faceUp: true }
    ]
};

// 並べ方を [{ row, x, faceUp }] の一覧にする（上の行から、左から順）
export function layoutSlots(age) {
    return LAYOUTS[age].flatMap((row, r) => {
        const xs = row.xs ?? Array.from({ length: row.count }, (_, i) => row.start + i * 2);
        return xs.map(x => ({ row: r, x, faceUp: row.faceUp }));
    });
}

export const STARTING_COINS = 7;
export const MAX_WONDERS = 7;
export const CARDS_PER_AGE = 20;
export const GUILDS_IN_AGE3 = 3;
// 軍事：中央を0として、相手の都に向かって進む。この位置に来たら相手がコインを失う（1回だけ）
export const MILITARY_TOKENS = [{ at: 3, coins: 2 }, { at: 6, coins: 5 }];
export const MILITARY_WIN = 9;
// ゲームの終わりの軍事の点：位置ごと
export const militaryPoints = (pos) => (pos >= 6 ? 10 : pos >= 3 ? 5 : pos >= 1 ? 2 : 0);
