/**
 * カード・品・準備のデータ
 *
 * 確かめた資料
 * - カード（開始の7枚と、売り物の30枚の山 I〜V・費用・神・ミネルウァの点）：PD-Verlag の
 *   「Overview for all cards of Concordia (Starting cards and cards for sale)」（1枚の一覧の PDF）。絵で1枚ずつ読んだ
 * - 品の値段（れんが3・食料4・道具5・ワイン6・布7）：英語のルールブック（Rio Grande 版 1.1）の商人とウェスタの例
 * - 建築の費用（れんが1・食料2・道具3・ワイン4・布5 × 建てたあとの軒数）：同じルールブックの建築家
 * - 準備（倉庫に陸と海の植民者2人ずつ・食料2・布1・ワイン1・れんが1・道具1、お金は手番の順に 5・6・7…、
 *   山は人数より大きいローマ数字の山を抜く）：PD-Verlag の準備の紙を写した board-flow の準備の手順（124361.json）。
 *   ルールブックの「最初は倉庫の4マスが植民者で埋まる」「人数によって不要な売り物を抜く」と合う
 *
 * - 市場の置き場所の追加の費用（なし・好きな品・好きな品・布・布・好きな品＋布・布2つ）：GitHub の yav/concordia（実装）の値。
 *   ルールブックの例（1番目なし・3番目「好きな品」・4番目「布」・6番目「好きな品＋布」）と合う。2・5・7番目はほかの資料で確かめられていない
 * - 州のボーナスのお金の面のコインの数（布の州 1、ほか 2）：yav/concordia と Pianeer の戦略ガイドで一致
 */

export const GOODS = ['brick', 'food', 'tool', 'wine', 'cloth'];
export const GOOD_NAMES = { brick: 'れんが', food: '食料', tool: '道具', wine: 'ワイン', cloth: '布' };

// 建築の費用のお金（軒数を掛ける前）
export const BUILD_VALUE = { brick: 1, food: 2, tool: 3, wine: 4, cloth: 5 };
// 商人の売り買いの値段と、ウェスタで数える品の値
export const PRICE = { brick: 3, food: 4, tool: 5, wine: 6, cloth: 7 };
// 州のボーナスのお金の面のコインの数
export const BONUS_COINS = { brick: 2, food: 2, tool: 2, wine: 2, cloth: 1 };

export const GODS = ['vesta', 'jupiter', 'saturnus', 'mercurius', 'mars', 'minerva'];
export const GOD_NAMES = { vesta: 'ウェスタ', jupiter: 'ユピテル', saturnus: 'サトゥルヌス', mercurius: 'メルクリウス', mars: 'マルス', minerva: 'ミネルウァ' };

// カードの種類。kind は効果の種類、god は得点の神、cost は売り物の費用（赤い欄）
// 開始の7枚と売り物で神が違うもの（外交官など）は、種類を分ける
export const CARD_TYPES = {
    tribune: { kind: 'tribune', name: '護民官', god: 'mars' },
    architect: { kind: 'architect', name: '建築家', god: 'jupiter', cost: { tool: 1 } },
    prefect: { kind: 'prefect', name: '属州総督', god: 'saturnus', cost: { wine: 1 } },
    mercator: { kind: 'mercator', name: '商人', god: 'mercurius', money: 3 },
    mercator5: { kind: 'mercator', name: '商人', god: 'mercurius', money: 5, cost: { wine: 1 } },
    senator: { kind: 'senator', name: '元老院議員', god: 'vesta' },
    diplomat: { kind: 'diplomat', name: '外交官', god: 'jupiter' },
    diplomatSaturnusTool: { kind: 'diplomat', name: '外交官', god: 'saturnus', cost: { tool: 1 } },
    diplomatSaturnusFood: { kind: 'diplomat', name: '外交官', god: 'saturnus', cost: { food: 1 } },
    diplomatMercurius: { kind: 'diplomat', name: '外交官', god: 'mercurius', cost: { tool: 1 } },
    diplomatMars: { kind: 'diplomat', name: '外交官', god: 'mars', cost: { food: 1 } },
    colonist: { kind: 'colonist', name: '植民者', god: 'mars', cost: { food: 1 } },
    consul: { kind: 'consul', name: '執政官', god: 'jupiter', cost: { cloth: 1 } },
    mason: { kind: 'craftsman', name: '石工', god: 'minerva', good: 'brick', minerva: 3, cost: { food: 1 } },
    farmer: { kind: 'craftsman', name: '農夫', god: 'minerva', good: 'food', minerva: 3, cost: { food: 1, brick: 1 } },
    smith: { kind: 'craftsman', name: '鍛冶', god: 'minerva', good: 'tool', minerva: 3, cost: { tool: 1, brick: 1 } },
    vintner: { kind: 'craftsman', name: 'ぶどう酒造り', god: 'minerva', good: 'wine', minerva: 4, cost: { wine: 1, brick: 1 } },
    weaver: { kind: 'craftsman', name: '織工', god: 'minerva', good: 'cloth', minerva: 5, cost: { cloth: 1, brick: 1 } }
};

export const STARTING_HAND = ['tribune', 'architect', 'prefect', 'prefect', 'mercator', 'senator', 'diplomat'];

// 売り物の山（I〜V）。人数より大きい番号の山は使わない
export const MARKET_DECKS = {
    1: ['architect', 'prefect', 'mercator5', 'colonist', 'diplomatSaturnusTool', 'mason', 'farmer', 'smith'],
    2: ['architect', 'prefect', 'mercator5', 'colonist', 'consul', 'vintner', 'weaver'],
    3: ['architect', 'prefect', 'mercator5', 'colonist', 'diplomatSaturnusFood', 'consul'],
    4: ['architect', 'prefect', 'colonist', 'diplomatMercurius', 'consul'],
    5: ['prefect', 'mercator5', 'diplomatMars', 'consul']
};
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// 市場の山札：山ごとに切り、I を上にして重ねる。{ type, phase } の並び
export function buildMarketDeck(playerCount, random) {
    const deck = [];
    for (let phase = 1; phase <= playerCount; phase++) {
        const pile = MARKET_DECKS[phase].map(type => ({ type, phase }));
        for (let i = pile.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [pile[i], pile[j]] = [pile[j], pile[i]];
        }
        deck.push(...pile);
    }
    return deck;
}

// 市場の7か所の追加の費用（'any' は好きな品）。左から
export const DISPLAY_SURCHARGE = [[], ['any'], ['any'], ['cloth'], ['cloth'], ['any', 'cloth'], ['cloth', 'cloth']];

export const STORE_SIZE = 12;
export const HOUSES = 15;
export const COLONISTS = { land: 3, sea: 3 };
export const START_GOODS = { brick: 1, food: 2, tool: 1, wine: 1, cloth: 1 };
export const START_MONEY = [5, 6, 7, 8, 9];
export const CONCORDIA_POINTS = 7;
export const MERCATOR_MONEY = 3;
export const COLONIST_MONEY_BASE = 5;
