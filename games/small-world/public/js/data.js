/**
 * 種族・特殊能力・地形などの決まった値（基本セット：種族14・特殊能力20）
 * tokens：選んだときにもらう部隊の数（種族と特殊能力の合計を持つ）。max：箱に入っている部隊の数（増える種族の上限）
 */

export const RACES = {
    amazons: { name: 'アマゾネス', tokens: 6, max: 15, text: '征服のときだけ、部隊が4体多い（再配置の前に4体を戻す）' },
    dwarves: { name: 'ドワーフ', tokens: 3, max: 8, text: '鉱山の領域1つにつき、手番の終わりに1金。衰退しても続く' },
    elves: { name: 'エルフ', tokens: 6, max: 11, text: '征服されても、部隊を1体も失わない' },
    ghouls: { name: 'グール', tokens: 5, max: 10, text: '衰退しても部隊が減らず、次の番からも征服を続けられる' },
    giants: { name: '巨人', tokens: 6, max: 11, text: '自分のいる山に隣り合う領域は、1体少なく征服できる' },
    halflings: { name: 'ハーフリング', tokens: 6, max: 11, text: 'どこからでも地図に入れる。最初に征服した2つの領域に穴を掘り、そこは攻められない' },
    humans: { name: '人間', tokens: 5, max: 10, text: '農地の領域1つにつき、手番の終わりに1金' },
    orcs: { name: 'オーク', tokens: 5, max: 10, text: 'この番に征服した、だれかのいた領域1つにつき1金' },
    ratmen: { name: 'ネズミ人', tokens: 8, max: 13, text: '特別な力はないが、数が多い' },
    skeletons: { name: 'ガイコツ', tokens: 6, max: 20, text: 'この番に、だれかのいた領域を2つ征服するごとに、部隊が1体増える' },
    sorcerers: { name: '魔術師', tokens: 5, max: 18, text: '相手1人につき番に1回、隣の1体だけの領域を、自分の部隊に置き換えて奪う' },
    tritons: { name: '海の民', tokens: 6, max: 11, text: '海や湖に面した領域は、1体少なく征服できる' },
    trolls: { name: 'トロル', tokens: 5, max: 10, text: '自分の領域にトロルの巣を置き、守りが1増える。衰退しても残る' },
    wizards: { name: '魔法使い', tokens: 5, max: 10, text: '魔法の源の領域1つにつき、手番の終わりに1金' }
};

export const POWERS = {
    alchemist: { name: '錬金術の', tokens: 4, text: '手番の終わりに2金' },
    berserk: { name: '狂戦士の', tokens: 4, text: '征服の前に毎回サイコロを振り、出た目の分だけ少なく征服できる' },
    bivouacking: { name: '野営する', tokens: 5, text: '野営地5つを再配置のときに置き直せる。1つにつき守りが1増える' },
    commando: { name: '奇襲の', tokens: 4, text: 'どの領域も、1体少なく征服できる' },
    diplomat: { name: '外交の', tokens: 5, text: '番の終わりに、この番に攻めなかった相手を1人選ぶ。その人は次の番、あなたを攻められない' },
    dragon: { name: '竜使いの', tokens: 5, text: '番に1回、守りに関係なく1体で征服できる。竜のいる領域は攻められない' },
    flying: { name: '空飛ぶ', tokens: 5, text: '隣り合っていなくても、地図のどの領域でも征服できる' },
    forest: { name: '森の', tokens: 4, text: '森の領域1つにつき、手番の終わりに1金' },
    fortified: { name: '砦を築く', tokens: 3, text: '番に1つ砦を置ける（6つまで）。守りが1増え、砦1つにつき1金' },
    heroic: { name: '英雄の', tokens: 5, text: '再配置のときに英雄2人を置き、その領域は攻められない' },
    hill: { name: '丘の', tokens: 4, text: '丘の領域1つにつき、手番の終わりに1金' },
    merchant: { name: '商人の', tokens: 2, text: '領域1つにつき、手番の終わりにもう1金' },
    mounted: { name: '騎馬の', tokens: 5, text: '丘と農地は、1体少なく征服できる' },
    pillaging: { name: '略奪する', tokens: 5, text: 'この番に征服した、だれかのいた領域1つにつき1金' },
    seafaring: { name: '航海する', tokens: 5, text: '海と湖も征服できる（衰退しても残る）' },
    spirit: { name: '霊の', tokens: 5, text: '衰退しても、ほかの衰退した種族を消さずに並べて残せる' },
    stout: { name: '頑丈な', tokens: 4, text: '征服した番の終わりに、続けて衰退できる' },
    swamp: { name: '沼の', tokens: 4, text: '沼の領域1つにつき、手番の終わりに1金' },
    underworld: { name: '地底の', tokens: 5, text: '洞窟の領域は1体少なく征服でき、洞窟どうしは隣り合っているとみなす' },
    wealthy: { name: '裕福な', tokens: 4, text: 'この種族の最初の番の終わりに、一度だけ7金' }
};

export const RACE_IDS = Object.keys(RACES);
export const POWER_IDS = Object.keys(POWERS);

export const comboName = (race, power) => `${POWERS[power].name}${RACES[race].name}`;

export const TERRAINS = {
    farm: { name: '農地', color: '#e4cc72' },
    forest: { name: '森', color: '#4c8a45' },
    hill: { name: '丘', color: '#a7c461' },
    mountain: { name: '山', color: '#9a8f84' },
    swamp: { name: '沼', color: '#7c8a5c' },
    sea: { name: '海', color: '#3d78a8' },
    lake: { name: '湖', color: '#5b9bc7' }
};

export const SPECIALS = {
    magic: { name: '魔法の源' },
    mine: { name: '鉱山' },
    cavern: { name: '洞窟' }
};

export const isWater = (terrain) => terrain === 'sea' || terrain === 'lake';

// 人数ごとのラウンド数
export const ROUNDS = { 2: 10, 3: 10, 4: 9, 5: 8 };
export const START_COINS = 5;
export const ROW_SIZE = 6;
// 援軍のサイコロ（6面のうち3面は何もない）
export const DIE_FACES = [0, 0, 0, 1, 2, 3];
export const MAX_FORTS = 6;
export const MAX_CAMPS = 5;
export const MAX_HEROES = 2;
export const MAX_HOLES = 2;
export const AMAZON_BONUS = 4;
