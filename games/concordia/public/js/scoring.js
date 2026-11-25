/**
 * 得点の計算（ゲームの終わりと、途中の見込みの両方で使う）
 * 持っているカード（手札と捨て札）の神ごとに、1枚あたりの点 × その神のカードの枚数
 * - ウェスタ：お金と品の値（商人の値段）の合計 10 につき 1
 * - ユピテル：れんが以外の都市の家 1 軒につき 1（最大 15）
 * - サトゥルヌス：家のある州 1 つにつき 1（最大は州の数）
 * - メルクリウス：家で生産する品の種類 1 つにつき 2（最大 10）
 * - マルス：盤上の植民者 1 人につき 2（最大 12）
 * - ミネルウァ：職人カードごとに、その品の都市の家 1 軒につきカードに書かれた点
 * コンコルディアのカードは 7 点
 */

import { GOODS, PRICE, CARD_TYPES, GODS, CONCORDIA_POINTS } from './cards.js';
import { CITIES, PROVINCES } from './map.js';

// 神ごとの「1枚あたりの点」（ミネルウァは職人カードごとに計算するので、ここでは品ごとの家の数を返す）
export function godValues(game, seat) {
    const p = game.players[seat];
    const myCities = CITIES.filter(c => game.houses[c.id].includes(seat));
    const goodsOf = myCities.map(c => game.cityGoods[c.id]);
    const wealth = p.money + GOODS.reduce((sum, g) => sum + p.goods[g] * PRICE[g], 0);
    const colonists = game.colonists.filter(c => c.owner === seat && (c.city !== null || c.road !== null)).length;
    return {
        vesta: Math.floor(wealth / 10),
        jupiter: Math.min(15, goodsOf.filter(g => g !== 'brick').length),
        saturnus: Math.min(PROVINCES.length, new Set(myCities.map(c => c.province)).size),
        mercurius: Math.min(10, new Set(goodsOf).size * 2),
        mars: Math.min(12, colonists * 2),
        housesByGood: Object.fromEntries(GOODS.map(g => [g, goodsOf.filter(x => x === g).length]))
    };
}

// その人の持っているカード（手札と捨て札）
export const ownedCards = (game, seat) => [...game.players[seat].hand, ...game.players[seat].discard];

// 得点の内訳 { gods: { vesta: { cards, each, points }, ... }, concordia, total }
export function scorePlayer(game, seat) {
    const values = godValues(game, seat);
    const gods = Object.fromEntries(GODS.map(god => [god, { cards: 0, each: 0, points: 0 }]));
    ownedCards(game, seat).forEach(id => {
        const type = CARD_TYPES[game.cards[id].type];
        const row = gods[type.god];
        row.cards += 1;
        if (type.god === 'minerva') {
            const points = type.minerva * values.housesByGood[type.good];
            row.points += points;
        } else {
            row.each = values[type.god];
            row.points += values[type.god];
        }
    });
    const concordia = game.players[seat].concordia ? CONCORDIA_POINTS : 0;
    const total = Object.values(gods).reduce((sum, row) => sum + row.points, 0) + concordia;
    return { gods, concordia, total };
}
