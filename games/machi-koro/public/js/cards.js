/**
 * 施設とランドマークのデータ（基本ゲーム）
 * 色：blue（誰の番でも銀行から）・green（自分の番だけ銀行から）・red（ほかの人が振ったとき、振った人から）・purple（自分の番だけ、ほかの人から）
 * mark：ショッピングモールの対象（bread・cup）や、工場と市場が数える印（cow・gear・grain）
 */

export const ESTABLISHMENTS = {
    wheat: { name: '麦畑', color: 'blue', cost: 1, rolls: [1], gain: 1, mark: 'grain', count: 6, text: '誰の番でも、銀行から1コイン' },
    ranch: { name: '牧場', color: 'blue', cost: 1, rolls: [2], gain: 1, mark: 'cow', count: 6, text: '誰の番でも、銀行から1コイン' },
    bakery: { name: 'パン屋', color: 'green', cost: 1, rolls: [2, 3], gain: 1, mark: 'bread', count: 6, text: '自分の番に、銀行から1コイン' },
    cafe: { name: 'カフェ', color: 'red', cost: 2, rolls: [3], gain: 1, mark: 'cup', count: 6, text: 'ほかの人が出したら、その人から1コイン' },
    store: { name: 'コンビニ', color: 'green', cost: 2, rolls: [4], gain: 3, mark: 'bread', count: 6, text: '自分の番に、銀行から3コイン' },
    forest: { name: '森林', color: 'blue', cost: 3, rolls: [5], gain: 1, mark: 'gear', count: 6, text: '誰の番でも、銀行から1コイン' },
    stadium: { name: 'スタジアム', color: 'purple', cost: 6, rolls: [6], gain: 2, mark: 'major', count: 4, text: '自分の番に、ほかの全員から2コインずつ' },
    tv: { name: 'テレビ局', color: 'purple', cost: 7, rolls: [6], gain: 5, mark: 'major', count: 4, text: '自分の番に、選んだ1人から5コイン' },
    business: { name: 'ビジネスセンター', color: 'purple', cost: 8, rolls: [6], gain: 0, mark: 'major', count: 4, text: '自分の番に、紫以外の施設1つを、ほかの人の施設1つと交換できる' },
    cheese: { name: 'チーズ工場', color: 'green', cost: 5, rolls: [7], gain: 3, mark: 'factory', per: 'cow', count: 6, text: '自分の番に、自分の牧場1つにつき銀行から3コイン' },
    furniture: { name: '家具工場', color: 'green', cost: 3, rolls: [8], gain: 3, mark: 'factory', per: 'gear', count: 6, text: '自分の番に、自分の森林と鉱山1つにつき銀行から3コイン' },
    mine: { name: '鉱山', color: 'blue', cost: 6, rolls: [9], gain: 5, mark: 'gear', count: 6, text: '誰の番でも、銀行から5コイン' },
    family: { name: 'ファミレス', color: 'red', cost: 3, rolls: [9, 10], gain: 2, mark: 'cup', count: 6, text: 'ほかの人が出したら、その人から2コイン' },
    apple: { name: 'リンゴ園', color: 'blue', cost: 3, rolls: [10], gain: 3, mark: 'grain', count: 6, text: '誰の番でも、銀行から3コイン' },
    market: { name: '青果市場', color: 'green', cost: 2, rolls: [11, 12], gain: 2, mark: 'fruit', per: 'grain', count: 6, text: '自分の番に、自分の麦畑とリンゴ園1つにつき銀行から2コイン' }
};

// 市場の並び（出目の順。ルールブックの並べ方）
export const ESTABLISHMENT_ORDER = Object.keys(ESTABLISHMENTS);

export const LANDMARKS = {
    station: { name: '駅', cost: 4, text: 'サイコロを1個か2個、選んで振れる' },
    mall: { name: 'ショッピングモール', cost: 10, text: 'パンとカップの印の施設（パン屋・コンビニ・カフェ・ファミレス）で得るコインが、1つにつき+1' },
    park: { name: '遊園地', cost: 16, text: 'ゾロ目を出したら、この番のあとにもう1回自分の番' },
    tower: { name: '電波塔', cost: 22, text: '自分の番に1回、サイコロを振り直せる' }
};

export const LANDMARK_ORDER = Object.keys(LANDMARKS);

// 最初に持っている施設とコイン
export const STARTING_CARDS = { wheat: 1, bakery: 1 };
export const STARTING_COINS = 3;

// 紫（大施設）は、同じ種類を1人1つまで
export const isMajor = (key) => ESTABLISHMENTS[key]?.color === 'purple';

// 「印」で数える施設（工場と市場の効果）
export const MARK_MEMBERS = {
    cow: ['ranch'],
    gear: ['forest', 'mine'],
    grain: ['wheat', 'apple']
};

export const COLOR_NAMES = { blue: '青', green: '緑', red: '赤', purple: '紫' };

// 出目の表示（2–3 のように）
export const rollText = (key) => {
    const rolls = ESTABLISHMENTS[key].rolls;
    return rolls.length === 1 ? String(rolls[0]) : `${rolls[0]}–${rolls.at(-1)}`;
};
