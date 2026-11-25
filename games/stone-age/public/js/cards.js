/**
 * ストーンエイジ（基本ゲーム）のデータ：資源・場所・文明カード36枚・建物28枚
 * 文明カードの上半分（すぐ得るもの）と下半分（終了時の得点）の組み合わせは、README の「資料」に書いた資料から決めた
 */

// 資源（食料は資源ではない）。value は建物と、川などで割る数
export const RESOURCES = ['wood', 'clay', 'stone', 'gold'];
export const RESOURCE_VALUE = { wood: 3, clay: 4, stone: 5, gold: 6 };
export const RESOURCE_NAME = { food: '食料', wood: '木', clay: '粘土', stone: '石', gold: '金' };

export const START_PEOPLE = 5;
export const START_FOOD = 12;
export const MAX_PEOPLE = 10;
export const MAX_AGRI = 10;
export const MAX_TOOL_TILES = 3;
export const MAX_TOOL_VALUE = 4;
export const CIV_SLOTS = 4;          // 文明カードの置き場（slot 0 が右端で、費用1）
export const STACK_SIZE = 7;         // 建物の山1つの枚数
export const STARVE_PENALTY = 10;

// 場所。resource：サイコロで得るもの（divisor で割る）、cap：置ける人数の合計
export const GATHER = {
    hunt: { resource: 'food', divisor: 2, cap: Infinity },
    forest: { resource: 'wood', divisor: 3, cap: 7 },
    clay: { resource: 'clay', divisor: 4, cap: 7 },
    quarry: { resource: 'stone', divisor: 5, cap: 7 },
    river: { resource: 'gold', divisor: 6, cap: 7 }
};
export const RESOURCE_SPOTS = ['forest', 'clay', 'quarry', 'river'];
export const VILLAGE = ['field', 'toolmaker', 'hut'];
export const PLACE_NAME = {
    hunt: '狩り場', forest: '森', clay: '粘土採り場', quarry: '石切り場', river: '川',
    field: '畑', toolmaker: '道具作り', hut: '小屋'
};

// 緑の文化（8種×2枚）と、砂色の倍率（4種）
export const CULTURES = ['healing', 'art', 'writing', 'pottery', 'time', 'transport', 'music', 'weaving'];
export const CULTURE_NAME = {
    healing: '医術', art: '芸術', writing: '文字', pottery: '土器',
    time: '日時計', transport: '運搬', music: '音楽', weaving: '機織り'
};
export const MULTIPLIERS = ['farmer', 'toolmaker', 'builder', 'shaman'];
export const MULTIPLIER_NAME = { farmer: '農民', toolmaker: '道具職人', builder: '小屋の建築家', shaman: 'シャーマン' };
export const MULTIPLIER_BASE = { farmer: '畑の段', toolmaker: '道具の値の合計', builder: '建物の数', shaman: '人の数' };

// ダイスのカード：出た目で受け取るもの
export const DIE_REWARD = { 1: 'wood', 2: 'clay', 3: 'stone', 4: 'gold', 5: 'tool', 6: 'agri' };

// 上半分の書き方
// diceAll：人数分のサイコロを振り、買った人から1つずつ選ぶ / food：食料 / res：資源 / resDice：2個振って資源
// points：3点 / tool：道具 / agri：畑+1 / extra：山の上のカード（下半分だけ）/ oneUse：使い切りの道具 / choice2：好きな資源2つ
const c = (top, bottom) => ({ top, bottom });
const culture = (name) => ({ culture: name });
const mult = (kind, n) => ({ mult: kind, n });

const CARD_LIST = [
    // ダイス（10枚）
    c({ kind: 'diceAll' }, culture('pottery')),
    c({ kind: 'diceAll' }, mult('builder', 1)),
    c({ kind: 'diceAll' }, mult('builder', 2)),
    c({ kind: 'diceAll' }, culture('writing')),
    c({ kind: 'diceAll' }, mult('toolmaker', 2)),
    c({ kind: 'diceAll' }, mult('toolmaker', 2)),   // 資料の一覧で抜けていた1枚（README）
    c({ kind: 'diceAll' }, mult('farmer', 1)),
    c({ kind: 'diceAll' }, mult('farmer', 2)),
    c({ kind: 'diceAll' }, culture('time')),
    c({ kind: 'diceAll' }, culture('transport')),
    // 食料（7枚）
    c({ kind: 'food', n: 7 }, culture('pottery')),
    c({ kind: 'food', n: 2 }, mult('builder', 2)),
    c({ kind: 'food', n: 4 }, mult('builder', 1)),
    c({ kind: 'food', n: 5 }, culture('healing')),
    c({ kind: 'food', n: 3 }, culture('weaving')),
    c({ kind: 'food', n: 1 }, culture('weaving')),
    c({ kind: 'food', n: 3 }, mult('farmer', 2)),
    // 資源（5枚）
    c({ kind: 'res', res: 'stone', n: 1 }, mult('farmer', 1)),
    c({ kind: 'res', res: 'stone', n: 2 }, culture('transport')),
    c({ kind: 'res', res: 'stone', n: 1 }, mult('shaman', 1)),
    c({ kind: 'res', res: 'gold', n: 1 }, mult('shaman', 1)),
    c({ kind: 'res', res: 'clay', n: 1 }, mult('shaman', 2)),
    // サイコロで資源（3枚）
    c({ kind: 'resDice', res: 'gold' }, culture('art')),
    c({ kind: 'resDice', res: 'wood' }, mult('shaman', 2)),
    c({ kind: 'resDice', res: 'stone' }, mult('shaman', 1)),
    // 3点（3枚）
    c({ kind: 'points', n: 3 }, mult('builder', 3)),
    c({ kind: 'points', n: 3 }, culture('music')),
    c({ kind: 'points', n: 3 }, culture('music')),
    // 道具（1枚）・畑（2枚）・追加のカード（1枚）
    c({ kind: 'tool' }, culture('art')),
    c({ kind: 'agri' }, mult('farmer', 1)),
    c({ kind: 'agri' }, culture('time')),
    c({ kind: 'extra' }, culture('writing')),
    // 使い切りの道具（3枚）
    c({ kind: 'oneUse', n: 4 }, mult('toolmaker', 1)),
    c({ kind: 'oneUse', n: 3 }, mult('toolmaker', 1)),
    c({ kind: 'oneUse', n: 2 }, mult('toolmaker', 2)),
    // 好きな資源2つ（1枚）
    c({ kind: 'choice2' }, culture('healing'))
];

export const CIV_CARDS = CARD_LIST.map((card, id) => ({ id, ...card }));

// 建物
// fixed：決まった資源 / count：n 個を kinds 種類で（値の合計が点）/ any：1〜7個を好きに（値の合計が点）
const fixed = (points, cost) => ({ kind: 'fixed', points, cost });
const BUILDING_LIST = [
    fixed(10, { wood: 2, clay: 1 }),
    fixed(11, { wood: 2, stone: 1 }),
    fixed(11, { wood: 1, clay: 2 }),
    fixed(12, { wood: 2, gold: 1 }),
    fixed(13, { wood: 1, stone: 2 }),
    fixed(13, { clay: 2, stone: 1 }),
    fixed(14, { clay: 2, gold: 1 }),
    fixed(14, { clay: 1, stone: 2 }),
    fixed(16, { stone: 2, gold: 1 }),
    ...[1, 2].flatMap(() => [
        fixed(12, { wood: 1, clay: 1, stone: 1 }),
        fixed(13, { wood: 1, clay: 1, gold: 1 }),
        fixed(14, { wood: 1, stone: 1, gold: 1 }),
        fixed(15, { clay: 1, stone: 1, gold: 1 })
    ]),
    ...[4, 5].flatMap(n => [1, 2, 3, 4].map(kinds => ({ kind: 'count', n, kinds }))),
    { kind: 'any', min: 1, max: 7 },
    { kind: 'any', min: 1, max: 7 },
    { kind: 'any', min: 1, max: 7 }
];

export const BUILDINGS = BUILDING_LIST.map((b, id) => ({ id, ...b }));

export const resourceCount = (res) => RESOURCES.reduce((s, r) => s + (res[r] ?? 0), 0);
export const resourceValue = (res) => RESOURCES.reduce((s, r) => s + (res[r] ?? 0) * RESOURCE_VALUE[r], 0);

// 建物の支払いが正しいか。正しければ得る点、だめなら null
export function buildingPoints(building, pay) {
    if (!isPay(pay)) return null;
    const count = resourceCount(pay);
    const kinds = RESOURCES.filter(r => pay[r] > 0).length;
    if (building.kind === 'fixed') {
        return RESOURCES.every(r => (pay[r] ?? 0) === (building.cost[r] ?? 0)) ? building.points : null;
    }
    if (building.kind === 'count') {
        return count === building.n && kinds === building.kinds ? resourceValue(pay) : null;
    }
    return count >= building.min && count <= building.max ? resourceValue(pay) : null;
}

// { wood, clay, stone, gold } の形で、0以上の整数だけか
export function isPay(pay) {
    if (!pay || typeof pay !== 'object') return false;
    return RESOURCES.every(r => pay[r] === undefined || (Number.isInteger(pay[r]) && pay[r] >= 0));
}

export const normalizePay = (pay) => Object.fromEntries(RESOURCES.map(r => [r, pay?.[r] ?? 0]));
