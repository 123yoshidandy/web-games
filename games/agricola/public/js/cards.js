/**
 * アグリコラ（ファミリー版）のデータ：行動スペース・ラウンドカード・大きな進歩・得点表
 * ファミリー版は、職業と小さい進歩を使わず、最初のボードの「ファミリー版」の面と、3〜5人ではファミリー版の行動カードを使う
 * 資料で分からなかった点は README の「資料」に書いた
 */

export const GOODS = ['wood', 'clay', 'reed', 'stone', 'grain', 'veg', 'food'];
export const BUILDING_RES = ['wood', 'clay', 'reed', 'stone'];
export const GOOD_NAME = { wood: '木', clay: 'レンガ', reed: '葦', stone: '石', grain: '穀物', veg: '野菜', food: '食料', sheep: '羊', boar: '猪', cattle: '牛' };

export const ROUNDS = 14;
export const HARVEST_ROUNDS = [4, 7, 9, 11, 13, 14];
export const MAX_FAMILY = 5;

// 行動スペース
// kind：acc（ためる。add に毎ラウンド足す）/ take（決まったものを取る）/ そのほかは名前の行動
// 名前は、画面に出す短い名前
export const SPACES = {
    // ボード（ファミリー版の面）
    build: { name: '増築', kind: 'build', text: '部屋（木5・葦2）と厩（木2）を好きなだけ' },
    start: { name: 'スタート', kind: 'start', text: 'スタートプレイヤーになる' },
    grain: { name: '穀物', kind: 'take', take: { grain: 1 }, text: '穀物1' },
    plow: { name: '畑を耕す', kind: 'plow', text: '畑を1つ耕す' },
    storehouse: { name: '貯蔵庫', kind: 'acc', add: { food: 1 }, text: '食料がたまる（毎ラウンド1）' },
    laborer: { name: '日雇い', kind: 'laborer', text: '食料1と、木・レンガ・葦・石のどれか1' },
    forest: { name: '森', kind: 'acc', add: { wood: 3 }, text: '木がたまる（毎ラウンド3）' },
    clayPit: { name: 'レンガ', kind: 'acc', add: { clay: 1 }, text: 'レンガがたまる（毎ラウンド1）' },
    reedBank: { name: '葦', kind: 'acc', add: { reed: 1 }, text: '葦がたまる（毎ラウンド1）' },
    fishing: { name: '漁', kind: 'acc', add: { food: 1 }, text: '食料がたまる（毎ラウンド1）' },
    // 3人の行動カード
    grove3: { name: '林', kind: 'acc', add: { wood: 2 }, text: '木がたまる（毎ラウンド2）' },
    hollow3: { name: '土取り場', kind: 'acc', add: { clay: 1 }, text: 'レンガがたまる（毎ラウンド1）' },
    quarry3: { name: '石1', kind: 'take', take: { stone: 1 }, text: '石1' },
    // 4人の行動カード
    copse4: { name: '雑木林', kind: 'acc', add: { wood: 1 }, text: '木がたまる（毎ラウンド1）' },
    grove4: { name: '林', kind: 'acc', add: { wood: 2 }, text: '木がたまる（毎ラウンド2）' },
    hollow4: { name: '土取り場', kind: 'acc', add: { clay: 2 }, text: 'レンガがたまる（毎ラウンド2）' },
    market4: { name: '市場', kind: 'take', take: { reed: 1, stone: 1, food: 1 }, text: '葦1・石1・食料1' },
    travel4: { name: '旅芸人', kind: 'acc', add: { food: 1 }, text: '食料がたまる（毎ラウンド1）' },
    // ラウンドカード
    sheep: { name: '羊', kind: 'animal', add: { sheep: 1 }, text: '羊がたまる（毎ラウンド1）' },
    sowBake: { name: '種まき・パン', kind: 'sowBake', text: '種をまく、パンを焼く（どちらか、両方）' },
    major: { name: '大きな進歩', kind: 'major', text: '大きな進歩を1つ' },
    fences: { name: '柵', kind: 'fences', text: '柵を建てる（1本に木1）' },
    family: { name: '家族を増やす', kind: 'family', text: '部屋が家族より多ければ、家族が1人増える' },
    stone1: { name: '石', kind: 'acc', add: { stone: 1 }, text: '石がたまる（毎ラウンド1）' },
    renoMajor: { name: '改築・進歩', kind: 'renoMajor', text: '家を改築し、そのあと大きな進歩も1つ' },
    veg: { name: '野菜', kind: 'take', take: { veg: 1 }, text: '野菜1' },
    boar: { name: '猪', kind: 'animal', add: { boar: 1 }, text: '猪がたまる（毎ラウンド1）' },
    cattle: { name: '牛', kind: 'animal', add: { cattle: 1 }, text: '牛がたまる（毎ラウンド1）' },
    stone2: { name: '石', kind: 'acc', add: { stone: 1 }, text: '石がたまる（毎ラウンド1）' },
    plowSow: { name: '耕す・種まき', kind: 'plowSow', text: '畑を1つ耕す、種をまく（どちらか、両方）' },
    urgent: { name: '急な家族', kind: 'urgent', text: '部屋がなくても、家族が1人増える' },
    renoFences: { name: '改築・柵', kind: 'renoFences', text: '家を改築し、そのあと柵も建てられる' }
};

export const BOARD_SPACES = ['build', 'start', 'grain', 'plow', 'storehouse', 'laborer', 'forest', 'clayPit', 'reedBank', 'fishing'];
export const PLAYER_CARDS = { 1: [], 2: [], 3: ['grove3', 'hollow3', 'quarry3'], 4: ['copse4', 'grove4', 'hollow4', 'market4', 'travel4'] };

// ラウンドカードの段階。段階の中の順番は、ゲームの初めにシャッフルする
export const STAGES = [
    ['sheep', 'sowBake', 'major', 'fences'],
    ['family', 'stone1', 'renoMajor'],
    ['veg', 'boar'],
    ['cattle', 'stone2'],
    ['plowSow', 'urgent'],
    ['renoFences']
];

// 大きな進歩（10枚）
// cook：調理の率（野菜・羊・猪・牛）、bake：パン1つあたりの食料と、1回のパンで焼ける数
// craft：収穫のときに1回、資源1を食料に。bonus：終わりに残った資源の数で点
export const MAJORS = [
    { id: 'fireplace2', name: 'かまど', cost: { clay: 2 }, points: 1, cook: { veg: 2, sheep: 2, boar: 2, cattle: 3 }, bake: { food: 2, max: Infinity } },
    { id: 'fireplace3', name: 'かまど', cost: { clay: 3 }, points: 1, cook: { veg: 2, sheep: 2, boar: 2, cattle: 3 }, bake: { food: 2, max: Infinity } },
    { id: 'hearth4', name: '調理場', cost: { clay: 4 }, points: 1, cook: { veg: 3, sheep: 2, boar: 3, cattle: 4 }, bake: { food: 3, max: Infinity }, upgrade: true },
    { id: 'hearth5', name: '調理場', cost: { clay: 5 }, points: 1, cook: { veg: 3, sheep: 2, boar: 3, cattle: 4 }, bake: { food: 3, max: Infinity }, upgrade: true },
    { id: 'clayOven', name: 'レンガ暖炉', cost: { clay: 3, stone: 1 }, points: 2, bake: { food: 5, max: 1 }, oven: true },
    { id: 'stoneOven', name: '石の暖炉', cost: { clay: 1, stone: 3 }, points: 3, bake: { food: 4, max: 2 }, oven: true },
    { id: 'joinery', name: '家具製作所', cost: { wood: 2, stone: 2 }, points: 2, craft: { res: 'wood', food: 2 }, bonus: { res: 'wood', steps: [3, 5, 7] } },
    { id: 'pottery', name: '製陶所', cost: { clay: 2, stone: 2 }, points: 2, craft: { res: 'clay', food: 2 }, bonus: { res: 'clay', steps: [3, 5, 7] } },
    { id: 'basket', name: 'かご製作所', cost: { reed: 2, stone: 2 }, points: 2, craft: { res: 'reed', food: 3 }, bonus: { res: 'reed', steps: [2, 4, 5] } },
    { id: 'well', name: '井戸', cost: { wood: 1, stone: 3 }, points: 4, well: 5 }
];
export const MAJOR = Object.fromEntries(MAJORS.map(m => [m.id, m]));
export const FIREPLACES = ['fireplace2', 'fireplace3'];

// 得点表。[しきい値の下限, 点] を大きい順に
const table = (rows) => (n) => {
    for (const [min, points] of rows) if (n >= min) return points;
    return -1;
};
export const SCORE = {
    fields: table([[5, 4], [4, 3], [3, 2], [2, 1]]),
    pastures: table([[4, 4], [3, 3], [2, 2], [1, 1]]),
    grain: table([[8, 4], [6, 3], [4, 2], [1, 1]]),
    veg: table([[4, 4], [3, 3], [2, 2], [1, 1]]),
    sheep: table([[8, 4], [6, 3], [4, 2], [1, 1]]),
    boar: table([[7, 4], [5, 3], [3, 2], [1, 1]]),
    cattle: table([[6, 4], [4, 3], [2, 2], [1, 1]])
};
export const BEGGING_PENALTY = 3;

export const hasAll = (have, cost) => Object.entries(cost).every(([k, n]) => (have[k] ?? 0) >= n);

// 盤面のタイルに出す短い名前
export const SHORT = {
    build: '増築', start: 'スタート', grain: '穀物', plow: '耕す', storehouse: '貯蔵庫', laborer: '日雇い',
    forest: '森', clayPit: 'レンガ', reedBank: '葦', fishing: '漁',
    grove3: '林', hollow3: '土取り', quarry3: '石1', copse4: '雑木林', grove4: '林', hollow4: '土取り', market4: '市場', travel4: '旅芸人',
    sheep: '羊', sowBake: '種・パン', major: '進歩', fences: '柵', family: '家族', stone1: '石', renoMajor: '改築進歩',
    veg: '野菜', boar: '猪', cattle: '牛', stone2: '石', plowSow: '耕す・種', urgent: '急な家族', renoFences: '改築・柵'
};
