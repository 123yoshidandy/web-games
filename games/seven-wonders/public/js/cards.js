/**
 * カードと不思議のデータ（基本ゲーム・第1版）
 *
 * 資源：W 木材・S 石・C 粘土・O 鉱石（原材料）、G ガラス・L 織物・P パピルス（加工品）
 * 科学の記号：c コンパス・g 歯車・t 石板
 * cost：資源の文字を並べたもの（'WW' は木材 2 つ）、coins：お金の費用
 * players：そのカードが入る人数（[3, 4] なら 3 人以上で 1 枚、4 人以上でもう 1 枚）
 * produce：生産（producer の配列。producer は選べる資源の配列。['W','C'] は木材か粘土のどちらか 1 つ）
 * chain：この建物を持っていれば無料で建てられる、前の時代の建物（key）
 * 名前は日本語の一般的な訳（日本語版の名前は確かめていない）
 */

export const RAW = ['W', 'S', 'C', 'O'];
export const MANUFACTURED = ['G', 'L', 'P'];
export const RESOURCES = [...RAW, ...MANUFACTURED];
export const RESOURCE_NAMES = { W: '木材', S: '石', C: '粘土', O: '鉱石', G: 'ガラス', L: '織物', P: 'パピルス' };
export const SCIENCE_NAMES = { c: 'コンパス', g: '歯車', t: '石板' };
export const COLOR_NAMES = { brown: '原材料', grey: '加工品', blue: '市民', yellow: '商業', red: '軍事', green: '科学', purple: 'ギルド' };

const card = (key, name, age, color, players, extra = {}) => ({ key, name, age, color, players, cost: '', coins: 0, ...extra });
const one = r => [[r]];

export const CARDS = [
    // ---------- 第1時代 ----------
    card('lumberYard', '材木置き場', 1, 'brown', [3, 4], { produce: one('W') }),
    card('stonePit', '石切り場', 1, 'brown', [3, 5], { produce: one('S') }),
    card('clayPool', '粘土の池', 1, 'brown', [3, 5], { produce: one('C') }),
    card('oreVein', '鉱脈', 1, 'brown', [3, 4], { produce: one('O') }),
    card('treeFarm', '植林地', 1, 'brown', [6], { coins: 1, produce: [['W', 'C']] }),
    card('excavation', '発掘場', 1, 'brown', [4], { coins: 1, produce: [['S', 'C']] }),
    card('clayPit', '粘土坑', 1, 'brown', [3], { coins: 1, produce: [['C', 'O']] }),
    card('timberYard', '木材所', 1, 'brown', [3], { coins: 1, produce: [['S', 'W']] }),
    card('forestCave', '森の洞窟', 1, 'brown', [5], { coins: 1, produce: [['W', 'O']] }),
    card('mine', '鉱山', 1, 'brown', [6], { coins: 1, produce: [['S', 'O']] }),
    card('loom1', '織機', 1, 'grey', [3, 6], { produce: one('L') }),
    card('glassworks1', 'ガラス工房', 1, 'grey', [3, 6], { produce: one('G') }),
    card('press1', '製紙所', 1, 'grey', [3, 6], { produce: one('P') }),
    card('pawnshop', '質屋', 1, 'blue', [4, 7], { vp: 3 }),
    card('baths', '浴場', 1, 'blue', [3, 7], { cost: 'S', vp: 3 }),
    card('altar', '祭壇', 1, 'blue', [3, 5], { vp: 2 }),
    card('theater', '劇場', 1, 'blue', [3, 6], { vp: 2 }),
    card('tavern', '酒場', 1, 'yellow', [4, 5, 7], { gain: { coins: 5 } }),
    card('eastTradingPost', '東の交易所', 1, 'yellow', [3, 7], { trade: { raw: ['right'] } }),
    card('westTradingPost', '西の交易所', 1, 'yellow', [3, 7], { trade: { raw: ['left'] } }),
    card('marketplace', '市場', 1, 'yellow', [3, 6], { trade: { manufactured: ['left', 'right'] } }),
    card('stockade', '柵', 1, 'red', [3, 7], { cost: 'W', shields: 1 }),
    card('barracks', '兵舎', 1, 'red', [3, 5], { cost: 'O', shields: 1 }),
    card('guardTower', '見張り塔', 1, 'red', [3, 4], { cost: 'C', shields: 1 }),
    card('apothecary', '薬屋', 1, 'green', [3, 5], { cost: 'L', science: 'c' }),
    card('workshop', '工房', 1, 'green', [3, 7], { cost: 'G', science: 'g' }),
    card('scriptorium', '写字室', 1, 'green', [3, 4], { cost: 'P', science: 't' }),

    // ---------- 第2時代 ----------
    card('sawmill', '製材所', 2, 'brown', [3, 4], { coins: 1, produce: [['W'], ['W']] }),
    card('quarry', '採石所', 2, 'brown', [3, 4], { coins: 1, produce: [['S'], ['S']] }),
    card('brickyard', 'れんが工場', 2, 'brown', [3, 4], { coins: 1, produce: [['C'], ['C']] }),
    card('foundry', '鋳造所', 2, 'brown', [3, 4], { coins: 1, produce: [['O'], ['O']] }),
    card('loom2', '織機', 2, 'grey', [3, 5], { produce: one('L') }),
    card('glassworks2', 'ガラス工房', 2, 'grey', [3, 5], { produce: one('G') }),
    card('press2', '製紙所', 2, 'grey', [3, 5], { produce: one('P') }),
    card('aqueduct', '水道橋', 2, 'blue', [3, 7], { cost: 'SSS', vp: 5, chain: ['baths'] }),
    card('temple', '神殿', 2, 'blue', [3, 6], { cost: 'WCG', vp: 3, chain: ['altar'] }),
    card('statue', '彫像', 2, 'blue', [3, 7], { cost: 'OOW', vp: 4, chain: ['theater'] }),
    card('courthouse', '裁判所', 2, 'blue', [3, 5], { cost: 'CCL', vp: 4, chain: ['scriptorium'] }),
    card('forum', '公会堂', 2, 'yellow', [3, 6, 7], { cost: 'CC', produce: [['G', 'L', 'P']], chain: ['eastTradingPost', 'westTradingPost'] }),
    card('caravansery', '隊商宿', 2, 'yellow', [3, 5, 6], { cost: 'WW', produce: [['W', 'S', 'O', 'C']], chain: ['marketplace'] }),
    card('vineyard', 'ぶどう園', 2, 'yellow', [3, 6], { gain: { per: 'brown', who: 'all', coins: 1 } }),
    card('bazar', 'バザール', 2, 'yellow', [4, 7], { gain: { per: 'grey', who: 'all', coins: 2 } }),
    card('walls', '城壁', 2, 'red', [3, 7], { cost: 'SSS', shields: 2 }),
    card('trainingGround', '練兵場', 2, 'red', [4, 6, 7], { cost: 'OOW', shields: 2 }),
    card('stables', '厩舎', 2, 'red', [3, 5], { cost: 'OCW', shields: 2, chain: ['apothecary'] }),
    card('archeryRange', '弓術場', 2, 'red', [3, 6], { cost: 'WWO', shields: 2, chain: ['workshop'] }),
    card('dispensary', '診療所', 2, 'green', [3, 4], { cost: 'OOG', science: 'c', chain: ['apothecary'] }),
    card('laboratory', '研究所', 2, 'green', [3, 5], { cost: 'CCP', science: 'g', chain: ['workshop'] }),
    card('library', '図書館', 2, 'green', [3, 6], { cost: 'SSL', science: 't', chain: ['scriptorium'] }),
    card('school', '学校', 2, 'green', [3, 7], { cost: 'WP', science: 't' }),

    // ---------- 第3時代 ----------
    card('pantheon', 'パンテオン', 3, 'blue', [3, 6], { cost: 'CCOGPL', vp: 7, chain: ['temple'] }),
    card('gardens', '庭園', 3, 'blue', [3, 4], { cost: 'CCW', vp: 5, chain: ['statue'] }),
    card('townHall', '市庁舎', 3, 'blue', [3, 5, 6], { cost: 'SSOG', vp: 6 }),
    card('palace', '宮殿', 3, 'blue', [3, 7], { cost: 'WSOCGPL', vp: 8 }),
    card('senate', '元老院', 3, 'blue', [3, 5], { cost: 'WWSO', vp: 6, chain: ['library'] }),
    card('haven', '港', 3, 'yellow', [3, 4], { cost: 'WOL', chain: ['forum'], gain: { per: 'brown', who: 'self', coins: 1 }, points: { per: 'brown', who: 'self', vp: 1 } }),
    card('lighthouse', '灯台', 3, 'yellow', [3, 6], { cost: 'SG', chain: ['caravansery'], gain: { per: 'yellow', who: 'self', coins: 1 }, points: { per: 'yellow', who: 'self', vp: 1 } }),
    card('chamberOfCommerce', '商工会議所', 3, 'yellow', [4, 6], { cost: 'CCP', gain: { per: 'grey', who: 'self', coins: 2 }, points: { per: 'grey', who: 'self', vp: 2 } }),
    card('arena', '闘技場', 3, 'yellow', [3, 5, 7], { cost: 'SSO', chain: ['dispensary'], gain: { per: 'stages', who: 'self', coins: 3 }, points: { per: 'stages', who: 'self', vp: 1 } }),
    card('fortifications', '要塞', 3, 'red', [3, 7], { cost: 'OOOS', shields: 3, chain: ['walls'] }),
    card('circus', '円形競技場', 3, 'red', [4, 5, 6], { cost: 'SSSO', shields: 3, chain: ['trainingGround'] }),
    card('arsenal', '武器庫', 3, 'red', [3, 4, 7], { cost: 'WWOL', shields: 3 }),
    card('siegeWorkshop', '攻城兵器工房', 3, 'red', [3, 5], { cost: 'CCCW', shields: 3, chain: ['laboratory'] }),
    card('lodge', '結社の館', 3, 'green', [3, 6], { cost: 'CCLP', science: 'c', chain: ['dispensary'] }),
    card('observatory', '天文台', 3, 'green', [3, 7], { cost: 'OOGL', science: 'g', chain: ['laboratory'] }),
    card('university', '大学', 3, 'green', [3, 4], { cost: 'WWGP', science: 't', chain: ['library'] }),
    card('academy', '学院', 3, 'green', [3, 7], { cost: 'SSSG', science: 'c', chain: ['school'] }),
    card('study', '書斎', 3, 'green', [3, 5], { cost: 'WPL', science: 'g', chain: ['school'] }),

    // ---------- ギルド（第3時代。人数 + 2 枚を無作為に入れる） ----------
    card('workersGuild', '労働者ギルド', 3, 'purple', [], { cost: 'OOCSW', points: { per: 'brown', who: 'neighbors', vp: 1 } }),
    card('craftsmensGuild', '職人ギルド', 3, 'purple', [], { cost: 'OOSS', points: { per: 'grey', who: 'neighbors', vp: 2 } }),
    card('tradersGuild', '商人ギルド', 3, 'purple', [], { cost: 'LPG', points: { per: 'yellow', who: 'neighbors', vp: 1 } }),
    card('philosophersGuild', '哲学者ギルド', 3, 'purple', [], { cost: 'CCCLP', points: { per: 'green', who: 'neighbors', vp: 1 } }),
    card('spiesGuild', '密偵ギルド', 3, 'purple', [], { cost: 'CCCG', points: { per: 'red', who: 'neighbors', vp: 1 } }),
    card('strategistsGuild', '戦略家ギルド', 3, 'purple', [], { cost: 'OOSL', points: { per: 'defeats', who: 'neighbors', vp: 1 } }),
    card('shipownersGuild', '船主ギルド', 3, 'purple', [], { cost: 'WWWGP', points: { per: 'brownGreyPurple', who: 'self', vp: 1 } }),
    card('scientistsGuild', '科学者ギルド', 3, 'purple', [], { cost: 'WWOOP', science: 'any' }),
    card('magistratesGuild', '行政官ギルド', 3, 'purple', [], { cost: 'WWWSL', points: { per: 'blue', who: 'neighbors', vp: 1 } }),
    card('buildersGuild', '建築家ギルド', 3, 'purple', [], { cost: 'SSCCG', points: { per: 'stages', who: 'all', vp: 1 } })
];

export const CARD_BY_KEY = Object.fromEntries(CARDS.map(c => [c.key, c]));
export const GUILDS = CARDS.filter(c => c.color === 'purple').map(c => c.key);

// 同じ名前の建物（第1時代と第2時代の織機など）は、1 つの都市に 1 つまで
export const sameName = (a, b) => CARD_BY_KEY[a].name === CARD_BY_KEY[b].name;

/**
 * 不思議（A 面・B 面）
 * resource：はじめから生産する資源（隣に売れる）
 * stages：段階ごとの { cost, vp, shields, coins, effect }
 *   effect：'rawChoice' 原材料を 1 つ選んで生産 / 'manufacturedChoice' 加工品を 1 つ選んで生産 / 'science' 科学の記号を 1 つ選ぶ
 *           'freeBuild' 各時代に 1 回、建物を無料で建てる / 'playLast' 各時代の 7 枚目も使える / 'buildDiscard' 捨て札から無料で建てる
 *           'tradeRaw' 両隣から原材料を 1 コインで買える / 'copyGuild' 終わりに隣のギルドを 1 つ写す
 */
export const WONDERS = [
    {
        key: 'rhodes', name: 'ロードス島の巨像', resource: 'O',
        A: [{ cost: 'WW', vp: 3 }, { cost: 'CCC', shields: 2 }, { cost: 'OOOO', vp: 7 }],
        B: [{ cost: 'SSS', shields: 1, vp: 3, coins: 3 }, { cost: 'OOOO', shields: 1, vp: 4, coins: 4 }]
    },
    {
        key: 'alexandria', name: 'アレクサンドリアの大灯台', resource: 'G',
        A: [{ cost: 'SS', vp: 3 }, { cost: 'OO', effect: 'rawChoice' }, { cost: 'GG', vp: 7 }],
        B: [{ cost: 'CC', effect: 'rawChoice' }, { cost: 'WW', effect: 'manufacturedChoice' }, { cost: 'SSS', vp: 7 }]
    },
    {
        key: 'ephesos', name: 'エフェソスのアルテミス神殿', resource: 'P',
        A: [{ cost: 'SS', vp: 3 }, { cost: 'WW', coins: 9 }, { cost: 'PP', vp: 7 }],
        B: [{ cost: 'SS', vp: 2, coins: 4 }, { cost: 'WW', vp: 3, coins: 4 }, { cost: 'PLG', vp: 5, coins: 4 }]
    },
    {
        key: 'babylon', name: 'バビロンの空中庭園', resource: 'C',
        A: [{ cost: 'CC', vp: 3 }, { cost: 'WWW', effect: 'science' }, { cost: 'CCCC', vp: 7 }],
        B: [{ cost: 'LC', vp: 3 }, { cost: 'GWW', effect: 'playLast' }, { cost: 'PCCC', effect: 'science' }]
    },
    {
        key: 'olympia', name: 'オリンピアのゼウス像', resource: 'W',
        A: [{ cost: 'WW', vp: 3 }, { cost: 'SS', effect: 'freeBuild' }, { cost: 'OO', vp: 7 }],
        B: [{ cost: 'WW', effect: 'tradeRaw' }, { cost: 'SS', vp: 5 }, { cost: 'LOO', effect: 'copyGuild' }]
    },
    {
        key: 'halicarnassus', name: 'ハリカルナッソスのマウソロス霊廟', resource: 'L',
        A: [{ cost: 'CC', vp: 3 }, { cost: 'OOO', effect: 'buildDiscard' }, { cost: 'LL', vp: 7 }],
        B: [{ cost: 'OO', vp: 2, effect: 'buildDiscard' }, { cost: 'CCC', vp: 1, effect: 'buildDiscard' }, { cost: 'GPL', effect: 'buildDiscard' }]
    },
    {
        key: 'giza', name: 'ギザのピラミッド', resource: 'S',
        A: [{ cost: 'SS', vp: 3 }, { cost: 'WWW', vp: 5 }, { cost: 'SSSS', vp: 7 }],
        B: [{ cost: 'WW', vp: 3 }, { cost: 'SSS', vp: 5 }, { cost: 'CCC', vp: 5 }, { cost: 'PSSSS', vp: 7 }]
    }
];
export const WONDER_BY_KEY = Object.fromEntries(WONDERS.map(w => [w.key, w]));

// その時代に、その人数で使うカード（ギルドは除く）。1 枚ごとに id を付ける
export function ageCards(age, players) {
    const result = [];
    CARDS.filter(c => c.age === age && c.color !== 'purple').forEach(c => {
        c.players.forEach(min => {
            if (players >= min) result.push(`${c.key}#${min}`);
        });
    });
    return result;
}

export const keyOf = id => id.split('#')[0];
export const cardOf = id => CARD_BY_KEY[keyOf(id)];

// 時代ごとの軍事の勝ちの点（負けは -1）
export const MILITARY_WIN = { 1: 1, 2: 3, 3: 5 };
