/**
 * ポケモン・技・タイプ相性・マップのデータ
 * ステータスは種族値から、レベル50（個体値31・努力値0）として計算する
 */

export const W = 8;          // マップの横のマス数
export const H = 10;         // マップの縦のマス数
export const TEAM_SIZE = 6;
export const MOVE_SLOTS = 2;
export const MAX_RULES = 3;
export const MAX_ROUNDS = 30; // この数のターンで決着しなければ、残りHPの割合で判定
export const LOW_HP = 0.3;

export const TYPES = {
    normal: { name: 'ノーマル', color: '#a8a77a' },
    fire: { name: 'ほのお', color: '#ee8130' },
    water: { name: 'みず', color: '#6390f0' },
    electric: { name: 'でんき', color: '#e5c02a' },
    grass: { name: 'くさ', color: '#6fb446' },
    ice: { name: 'こおり', color: '#7fcfcb' },
    fighting: { name: 'かくとう', color: '#c22e28' },
    poison: { name: 'どく', color: '#a33ea1' },
    ground: { name: 'じめん', color: '#d0a94e' },
    flying: { name: 'ひこう', color: '#a98ff3' },
    psychic: { name: 'エスパー', color: '#f95587' },
    bug: { name: 'むし', color: '#a6b91a' },
    rock: { name: 'いわ', color: '#b6a136' },
    ghost: { name: 'ゴースト', color: '#735797' },
    dragon: { name: 'ドラゴン', color: '#6f35fc' },
    dark: { name: 'あく', color: '#705746' },
    steel: { name: 'はがね', color: '#9aa3b8' },
    fairy: { name: 'フェアリー', color: '#d685ad' }
};

// 攻撃する技のタイプ → { 2倍のタイプ, 0.5倍のタイプ, 0倍のタイプ }
const CHART = {
    normal: [[], ['rock', 'steel'], ['ghost']],
    fire: [['grass', 'ice', 'bug', 'steel'], ['fire', 'water', 'rock', 'dragon'], []],
    water: [['fire', 'ground', 'rock'], ['water', 'grass', 'dragon'], []],
    electric: [['water', 'flying'], ['electric', 'grass', 'dragon'], ['ground']],
    grass: [['water', 'ground', 'rock'], ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'], []],
    ice: [['grass', 'ground', 'flying', 'dragon'], ['fire', 'water', 'ice', 'steel'], []],
    fighting: [['normal', 'ice', 'rock', 'dark', 'steel'], ['poison', 'flying', 'psychic', 'bug', 'fairy'], ['ghost']],
    poison: [['grass', 'fairy'], ['poison', 'ground', 'rock', 'ghost'], ['steel']],
    ground: [['fire', 'electric', 'poison', 'rock', 'steel'], ['grass', 'bug'], ['flying']],
    flying: [['grass', 'fighting', 'bug'], ['electric', 'rock', 'steel'], []],
    psychic: [['fighting', 'poison'], ['psychic', 'steel'], ['dark']],
    bug: [['grass', 'psychic', 'dark'], ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'], []],
    rock: [['fire', 'ice', 'flying', 'bug'], ['fighting', 'ground', 'steel'], []],
    ghost: [['psychic', 'ghost'], ['dark'], ['normal']],
    dragon: [['dragon'], ['steel'], ['fairy']],
    dark: [['psychic', 'ghost'], ['fighting', 'dark', 'fairy'], []],
    steel: [['ice', 'rock', 'fairy'], ['fire', 'water', 'electric', 'steel'], []],
    fairy: [['fighting', 'dragon', 'dark'], ['fire', 'poison', 'steel'], []]
};

// 技のタイプが、相手のタイプ（1つか2つ）に与える倍率
export function effectiveness(moveType, defenderTypes) {
    const [twice, half, zero] = CHART[moveType];
    return defenderTypes.reduce((m, t) => m * (zero.includes(t) ? 0 : twice.includes(t) ? 2 : half.includes(t) ? 0.5 : 1), 1);
}

// 技：cat は p（物理：こうげき÷ぼうぎょ）か s（特殊：とくこう÷とくぼう）。range は届くマス数（縦横の歩数）
export const MOVES = {
    bodyslam: { name: 'のしかかり', type: 'normal', cat: 'p', power: 85, acc: 100, range: 1 },
    hypervoice: { name: 'ハイパーボイス', type: 'normal', cat: 's', power: 90, acc: 100, range: 2 },
    flamethrower: { name: 'かえんほうしゃ', type: 'fire', cat: 's', power: 90, acc: 100, range: 2 },
    fireblast: { name: 'だいもんじ', type: 'fire', cat: 's', power: 110, acc: 85, range: 3 },
    firepunch: { name: 'ほのおのパンチ', type: 'fire', cat: 'p', power: 75, acc: 100, range: 1 },
    firefang: { name: 'ほのおのキバ', type: 'fire', cat: 'p', power: 65, acc: 95, range: 1 },
    surf: { name: 'なみのり', type: 'water', cat: 's', power: 90, acc: 100, range: 2 },
    hydropump: { name: 'ハイドロポンプ', type: 'water', cat: 's', power: 110, acc: 80, range: 3 },
    waterfall: { name: 'たきのぼり', type: 'water', cat: 'p', power: 80, acc: 100, range: 1 },
    thunderbolt: { name: '10まんボルト', type: 'electric', cat: 's', power: 90, acc: 100, range: 2 },
    thunder: { name: 'かみなり', type: 'electric', cat: 's', power: 110, acc: 70, range: 3 },
    thunderpunch: { name: 'かみなりパンチ', type: 'electric', cat: 'p', power: 75, acc: 100, range: 1 },
    wildcharge: { name: 'ワイルドボルト', type: 'electric', cat: 'p', power: 90, acc: 100, range: 1 },
    energyball: { name: 'エナジーボール', type: 'grass', cat: 's', power: 90, acc: 100, range: 2 },
    leafblade: { name: 'リーフブレード', type: 'grass', cat: 'p', power: 90, acc: 100, range: 1 },
    icebeam: { name: 'れいとうビーム', type: 'ice', cat: 's', power: 90, acc: 100, range: 2 },
    blizzard: { name: 'ふぶき', type: 'ice', cat: 's', power: 110, acc: 70, range: 3 },
    icepunch: { name: 'れいとうパンチ', type: 'ice', cat: 'p', power: 75, acc: 100, range: 1 },
    icefang: { name: 'こおりのキバ', type: 'ice', cat: 'p', power: 65, acc: 95, range: 1 },
    iciclecrash: { name: 'つららおとし', type: 'ice', cat: 'p', power: 85, acc: 90, range: 1 },
    crosschop: { name: 'クロスチョップ', type: 'fighting', cat: 'p', power: 100, acc: 80, range: 1 },
    brickbreak: { name: 'かわらわり', type: 'fighting', cat: 'p', power: 75, acc: 100, range: 1 },
    aurasphere: { name: 'はどうだん', type: 'fighting', cat: 's', power: 80, acc: 100, range: 3 },
    focusblast: { name: 'きあいだま', type: 'fighting', cat: 's', power: 120, acc: 70, range: 2 },
    sludgebomb: { name: 'ヘドロばくだん', type: 'poison', cat: 's', power: 90, acc: 100, range: 2 },
    earthquake: { name: 'じしん', type: 'ground', cat: 'p', power: 100, acc: 100, range: 1 },
    earthpower: { name: 'だいちのちから', type: 'ground', cat: 's', power: 90, acc: 100, range: 2 },
    airslash: { name: 'エアスラッシュ', type: 'flying', cat: 's', power: 75, acc: 95, range: 2 },
    wingattack: { name: 'つばさでうつ', type: 'flying', cat: 'p', power: 60, acc: 100, range: 1 },
    psychic: { name: 'サイコキネシス', type: 'psychic', cat: 's', power: 90, acc: 100, range: 2 },
    zenheadbutt: { name: 'しねんのずつき', type: 'psychic', cat: 'p', power: 80, acc: 90, range: 1 },
    xscissor: { name: 'シザークロス', type: 'bug', cat: 'p', power: 80, acc: 100, range: 1 },
    bugbuzz: { name: 'むしのさざめき', type: 'bug', cat: 's', power: 90, acc: 100, range: 2 },
    rockslide: { name: 'いわなだれ', type: 'rock', cat: 'p', power: 75, acc: 90, range: 2 },
    stoneedge: { name: 'ストーンエッジ', type: 'rock', cat: 'p', power: 100, acc: 80, range: 2 },
    shadowball: { name: 'シャドーボール', type: 'ghost', cat: 's', power: 80, acc: 100, range: 2 },
    shadowclaw: { name: 'シャドークロー', type: 'ghost', cat: 'p', power: 70, acc: 100, range: 1 },
    dragonclaw: { name: 'ドラゴンクロー', type: 'dragon', cat: 'p', power: 80, acc: 100, range: 1 },
    dragonpulse: { name: 'りゅうのはどう', type: 'dragon', cat: 's', power: 85, acc: 100, range: 3 },
    darkpulse: { name: 'あくのはどう', type: 'dark', cat: 's', power: 80, acc: 100, range: 2 },
    crunch: { name: 'かみくだく', type: 'dark', cat: 'p', power: 80, acc: 100, range: 1 },
    nightslash: { name: 'つじぎり', type: 'dark', cat: 'p', power: 70, acc: 100, range: 1 },
    ironhead: { name: 'アイアンヘッド', type: 'steel', cat: 'p', power: 80, acc: 100, range: 1 },
    irontail: { name: 'アイアンテール', type: 'steel', cat: 'p', power: 100, acc: 75, range: 1 },
    meteormash: { name: 'コメットパンチ', type: 'steel', cat: 'p', power: 90, acc: 90, range: 1 },
    flashcannon: { name: 'ラスターカノン', type: 'steel', cat: 's', power: 80, acc: 100, range: 2 },
    moonblast: { name: 'ムーンフォース', type: 'fairy', cat: 's', power: 95, acc: 100, range: 2 },
    dazzlinggleam: { name: 'マジカルシャイン', type: 'fairy', cat: 's', power: 80, acc: 100, range: 2 },
    playrough: { name: 'じゃれつく', type: 'fairy', cat: 'p', power: 90, acc: 90, range: 1 }
};

// ポケモン：base は種族値 [HP, こうげき, ぼうぎょ, とくこう, とくぼう, すばやさ]。pool は覚えられる技（先の2つが最初の組）
export const SPECIES = {
    venusaur: { name: 'フシギバナ', short: 'フシ', types: ['grass', 'poison'], base: [80, 82, 83, 100, 100, 80], pool: ['energyball', 'sludgebomb', 'earthpower', 'leafblade'] },
    charizard: { name: 'リザードン', short: 'リザ', types: ['fire', 'flying'], base: [78, 84, 78, 109, 85, 100], pool: ['flamethrower', 'airslash', 'fireblast', 'dragonclaw'] },
    blastoise: { name: 'カメックス', short: 'カメ', types: ['water'], base: [79, 83, 100, 85, 105, 78], pool: ['surf', 'icebeam', 'hydropump', 'darkpulse'] },
    pikachu: { name: 'ピカチュウ', short: 'ピカ', types: ['electric'], base: [35, 55, 40, 50, 50, 90], pool: ['thunderbolt', 'wildcharge', 'thunder', 'irontail'] },
    gengar: { name: 'ゲンガー', short: 'ゲン', types: ['ghost', 'poison'], base: [60, 65, 60, 130, 75, 110], pool: ['shadowball', 'sludgebomb', 'thunderbolt', 'focusblast'] },
    snorlax: { name: 'カビゴン', short: 'カビ', types: ['normal'], base: [160, 110, 65, 65, 110, 30], pool: ['bodyslam', 'earthquake', 'crunch', 'icepunch'] },
    dragonite: { name: 'カイリュー', short: 'リュ', types: ['dragon', 'flying'], base: [91, 134, 95, 100, 100, 80], pool: ['dragonclaw', 'earthquake', 'thunderpunch', 'wingattack'] },
    gyarados: { name: 'ギャラドス', short: 'ギャ', types: ['water', 'flying'], base: [95, 125, 79, 60, 100, 81], pool: ['waterfall', 'crunch', 'earthquake', 'icefang'] },
    lapras: { name: 'ラプラス', short: 'ラプ', types: ['water', 'ice'], base: [130, 85, 80, 85, 95, 60], pool: ['surf', 'icebeam', 'thunder', 'blizzard'] },
    alakazam: { name: 'フーディン', short: 'フー', types: ['psychic'], base: [55, 50, 45, 135, 95, 120], pool: ['psychic', 'shadowball', 'focusblast', 'dazzlinggleam'] },
    machamp: { name: 'カイリキー', short: 'リキ', types: ['fighting'], base: [90, 130, 80, 65, 85, 55], pool: ['crosschop', 'rockslide', 'brickbreak', 'thunderpunch'] },
    golem: { name: 'ゴローニャ', short: 'ゴロ', types: ['rock', 'ground'], base: [80, 120, 130, 55, 65, 45], pool: ['earthquake', 'rockslide', 'stoneedge', 'firepunch'] },
    arcanine: { name: 'ウインディ', short: 'ウイ', types: ['fire'], base: [90, 110, 80, 100, 80, 95], pool: ['flamethrower', 'crunch', 'wildcharge', 'firefang'] },
    jolteon: { name: 'サンダース', short: 'サン', types: ['electric'], base: [65, 65, 60, 110, 95, 130], pool: ['thunderbolt', 'shadowball', 'thunder', 'bugbuzz'] },
    scizor: { name: 'ハッサム', short: 'ハッ', types: ['bug', 'steel'], base: [70, 130, 100, 55, 80, 65], pool: ['xscissor', 'ironhead', 'brickbreak', 'wingattack'] },
    tyranitar: { name: 'バンギラス', short: 'バン', types: ['rock', 'dark'], base: [100, 134, 110, 95, 100, 61], pool: ['stoneedge', 'crunch', 'earthquake', 'rockslide'] },
    lucario: { name: 'ルカリオ', short: 'ルカ', types: ['fighting', 'steel'], base: [70, 110, 70, 115, 70, 90], pool: ['aurasphere', 'flashcannon', 'dragonpulse', 'zenheadbutt'] },
    garchomp: { name: 'ガブリアス', short: 'ガブ', types: ['dragon', 'ground'], base: [108, 130, 95, 80, 85, 102], pool: ['dragonclaw', 'earthquake', 'stoneedge', 'firefang'] },
    gardevoir: { name: 'サーナイト', short: 'サナ', types: ['psychic', 'fairy'], base: [68, 65, 65, 125, 115, 80], pool: ['psychic', 'moonblast', 'dazzlinggleam', 'thunderbolt'] },
    metagross: { name: 'メタグロス', short: 'メタ', types: ['steel', 'psychic'], base: [80, 135, 130, 95, 90, 70], pool: ['meteormash', 'zenheadbutt', 'earthquake', 'thunderpunch'] },
    sylveon: { name: 'ニンフィア', short: 'ニン', types: ['fairy'], base: [95, 65, 65, 110, 130, 60], pool: ['moonblast', 'hypervoice', 'shadowball', 'dazzlinggleam'] },
    weavile: { name: 'マニューラ', short: 'マニ', types: ['dark', 'ice'], base: [70, 120, 65, 45, 85, 125], pool: ['iciclecrash', 'nightslash', 'brickbreak', 'icefang'] },
    sceptile: { name: 'ジュカイン', short: 'ジュカ', types: ['grass'], base: [70, 85, 65, 105, 85, 120], pool: ['energyball', 'dragonpulse', 'leafblade', 'focusblast'] },
    mimikyu: { name: 'ミミッキュ', short: 'ミミ', types: ['ghost', 'fairy'], base: [55, 90, 80, 50, 105, 96], pool: ['playrough', 'shadowclaw', 'zenheadbutt', 'brickbreak'] }
};

export const SPECIES_IDS = Object.keys(SPECIES);

// レベル50・個体値31・努力値0 の実数値
export function statsOf(speciesId) {
    const [hp, atk, def, spa, spd, spe] = SPECIES[speciesId].base;
    const other = (b) => Math.floor((2 * b + 31) / 2) + 5;
    return { hp: Math.floor((2 * hp + 31) / 2) + 60, atk: other(atk), def: other(def), spa: other(spa), spd: other(spd), spe: other(spe) };
}

// 移動力は素早さの種族値で決まる（100以上=5、60〜99=4、59以下=3マス）
export function moveRangeOf(speciesId) {
    const spe = SPECIES[speciesId].base[5];
    return spe >= 100 ? 5 : spe >= 60 ? 4 : 3;
}

// 戦術ルールの条件と行動
export const CONDITIONS = {
    inRange: '射程内に敵がいる',
    lowHp: '自分のHPが30%以下',
    adjacent: '敵が隣接している',
    always: '常時'
};
export const ACTIONS = {
    weakest: '最も弱い敵を攻撃',
    nearest: '最も近い敵を攻撃',
    kite: '敵から離れて攻撃',
    wait: '待機する'
};
export const DEFAULT_RULES = [
    { cond: 'lowHp', act: 'kite' },
    { cond: 'inRange', act: 'weakest' },
    { cond: 'always', act: 'nearest' }
];

// 最初の手持ち（編成を変えていないとき）
export const DEFAULT_TEAM = ['charizard', 'blastoise', 'venusaur', 'pikachu', 'snorlax', 'gengar']
    .map(id => ({ id, moves: SPECIES[id].pool.slice(0, MOVE_SLOTS), rules: DEFAULT_RULES.map(r => ({ ...r })) }));

// マップ：通れない岩の場所 [x, y]。点対称にして、両軍の条件をそろえる
export const MAPS = [
    { name: 'くさはら', blocks: [[2, 4], [5, 5], [6, 4], [1, 5]] },
    { name: 'いわば', blocks: [[3, 3], [4, 6], [0, 4], [7, 5], [5, 4], [2, 5]] },
    { name: 'もり', blocks: [[1, 3], [6, 6], [3, 4], [4, 5], [6, 2], [1, 7]] }
];

// 最初の並び：席0は下の端、席1は上の端（点対称）
export function startCell(seat, i) {
    return seat === 0 ? { x: 1 + i, y: H - 1 } : { x: W - 2 - i, y: 0 };
}
