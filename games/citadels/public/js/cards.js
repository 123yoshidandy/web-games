/**
 * 役割と地区のデータ（あやつり人形の基本の8役と、基本の地区カード）
 * 説明の文は自分で書いたもの（公式の文は写していない）
 */

// 地区の色。収入の役割と対応する（紫は特殊地区で、収入の対象にならない）
export const COLORS = {
    yellow: { name: '貴族', short: '黄', hex: '#e3b53a' },
    blue: { name: '宗教', short: '青', hex: '#3d7cc9' },
    green: { name: '商業', short: '緑', hex: '#3f9a55' },
    red: { name: '軍事', short: '赤', hex: '#c8433a' },
    purple: { name: '特殊', short: '紫', hex: '#8a55b0' }
};
export const COLOR_ORDER = ['yellow', 'blue', 'green', 'red', 'purple'];

// 役割（rank は呼ばれる順）。income：その色の地区1つにつき1金
export const CHARACTERS = {
    assassin: { rank: 1, name: '暗殺者', color: '#4a4d57', text: '役割を1つ指名して殺す。殺された役割の人は、この巡の手番がなくなる' },
    thief: { rank: 2, name: '盗賊', color: '#8a5a32', text: '役割を1つ指名する（暗殺者と、殺された役割は選べない）。その役割の人が手番を始めるとき、持っている金をすべて奪う' },
    magician: { rank: 3, name: '奇術師', color: '#6a4aa0', text: 'ほかの人と手札をすべて交換するか、好きな枚数の手札を山の下に戻して、同じ枚数を引く' },
    king: { rank: 4, name: '王様', color: '#c99a1c', income: 'yellow', text: '王冠を受け取り、次の巡で最初に役割を選ぶ。黄の地区1つにつき1金' },
    bishop: { rank: 5, name: '司教', color: '#3d7cc9', income: 'blue', text: '将軍に地区を壊されない（司教が殺されたときを除く）。青の地区1つにつき1金' },
    merchant: { rank: 6, name: '商人', color: '#3f9a55', income: 'green', text: '行動のあとに1金。緑の地区1つにつき1金' },
    architect: { rank: 7, name: '建築家', color: '#b86a2c', text: '行動のあとに地区カードを2枚引く。地区を3つまで建てられる' },
    warlord: { rank: 8, name: '将軍', color: '#c8433a', income: 'red', text: '赤の地区1つにつき1金。地区を1つ、費用より1少ない金で壊せる（完成した都市と司教の都市は壊せない）' }
};
export const CHARACTER_ORDER = Object.keys(CHARACTERS).sort((a, b) => CHARACTERS[a].rank - CHARACTERS[b].rank);

// 地区。count：山の枚数。points：得点（書いていなければ費用と同じ）
export const DISTRICTS = {
    manor: { name: '屋敷', color: 'yellow', cost: 3, count: 5 },
    castle: { name: '城', color: 'yellow', cost: 4, count: 4 },
    palace: { name: '宮殿', color: 'yellow', cost: 5, count: 3 },
    temple: { name: '寺院', color: 'blue', cost: 1, count: 3 },
    church: { name: '教会', color: 'blue', cost: 2, count: 3 },
    monastery: { name: '修道院', color: 'blue', cost: 3, count: 3 },
    cathedral: { name: '大聖堂', color: 'blue', cost: 5, count: 2 },
    tavern: { name: '酒場', color: 'green', cost: 1, count: 5 },
    market: { name: '市場', color: 'green', cost: 2, count: 4 },
    tradingPost: { name: '商館', color: 'green', cost: 2, count: 3 },
    docks: { name: '波止場', color: 'green', cost: 3, count: 3 },
    harbor: { name: '港', color: 'green', cost: 4, count: 3 },
    townHall: { name: '市庁舎', color: 'green', cost: 5, count: 2 },
    watchtower: { name: '見張り塔', color: 'red', cost: 1, count: 3 },
    prison: { name: '牢獄', color: 'red', cost: 2, count: 3 },
    battlefield: { name: '戦場', color: 'red', cost: 3, count: 3 },
    fortress: { name: '要塞', color: 'red', cost: 5, count: 2 },
    hauntedCity: { name: '幽霊街', color: 'purple', cost: 2, count: 1, text: '得点を数えるとき、好きな色1つとして数える（最後の巡に建てたときを除く）' },
    keep: { name: '天守', color: 'purple', cost: 3, count: 2, text: '将軍に壊されない' },
    laboratory: { name: '研究所', color: 'purple', cost: 5, count: 1, text: '手番に1回、手札を1枚捨てて1金' },
    smithy: { name: '鍛冶屋', color: 'purple', cost: 5, count: 1, text: '手番に1回、2金を払って地区カードを3枚引く' },
    graveyard: { name: '墓地', color: 'purple', cost: 5, count: 1, text: '将軍がほかの地区を壊したとき、1金を払ってその地区を手札に加えられる（自分が将軍のときを除く）' },
    observatory: { name: '天文台', color: 'purple', cost: 5, count: 1, text: '行動で地区カードを引くとき、3枚引いて1枚残す（図書館もあれば2枚残す）' },
    schoolOfMagic: { name: '魔法学校', color: 'purple', cost: 6, count: 1, text: '収入を受け取るとき、好きな色として数える' },
    library: { name: '図書館', color: 'purple', cost: 6, count: 1, text: '行動で地区カードを引くとき、引いた札をすべて残す' },
    greatWall: { name: '城壁', color: 'purple', cost: 6, count: 1, text: 'ほかの地区を将軍が壊す費用が1増える' },
    university: { name: '大学', color: 'purple', cost: 6, count: 1, points: 8, text: '得点は8点' },
    dragonGate: { name: '竜の門', color: 'purple', cost: 6, count: 1, points: 8, text: '得点は8点' }
};
export const DISTRICT_ORDER = Object.keys(DISTRICTS);

// 山の全部の札。札の番号（0〜）から地区の種類を引く表
export const CARD_TYPES = DISTRICT_ORDER.flatMap(type => Array(DISTRICTS[type].count).fill(type));
export const CARD_COUNT = CARD_TYPES.length;

export const cardType = (id) => CARD_TYPES[id];
export const cardInfo = (id) => DISTRICTS[CARD_TYPES[id]];
export const districtPoints = (type) => DISTRICTS[type].points ?? DISTRICTS[type].cost;

export const STARTING_GOLD = 2;
export const STARTING_HAND = 4;
