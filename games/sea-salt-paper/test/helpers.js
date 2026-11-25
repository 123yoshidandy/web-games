import { CARDS } from '../public/js/cards.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// その種類のカードの id（color を指定すると、その色だけ）
export const idsOf = (type, color = null) => CARDS.filter(c => c.type === type && (color === null || c.color === color)).map(c => c.id);

// 'crab' のような種類の並びから、重ならないように id を選ぶ。{ type, color } でも指定できる
export function pick(...specs) {
    const used = new Set();
    return specs.map(spec => {
        const { type, color = null } = typeof spec === 'string' ? { type: spec } : spec;
        const id = idsOf(type, color).find(i => !used.has(i));
        if (id === undefined) throw new Error(`${type} が足りません`);
        used.add(id);
        return id;
    });
}

// カードを山札・捨て札・ほかの人の手札から抜く
export function removeEverywhere(game, ids) {
    game.deck = game.deck.filter(id => !ids.includes(id));
    game.discards = game.discards.map(pile => pile.filter(id => !ids.includes(id)));
    game.players.forEach(p => {
        p.hand = p.hand.filter(id => !ids.includes(id));
        p.duos = p.duos.filter(d => !d.some(id => ids.includes(id)));
    });
}

export function setHand(game, seat, ids) {
    removeEverywhere(game, ids);
    game.players[seat].hand = [...ids];
}

// 山札の上に決まったカードを置く
export function stackDeck(game, ids) {
    removeEverywhere(game, ids);
    game.deck.unshift(...ids);
}

// 捨て札の山の中身を決める（最後が一番上）
export function setPile(game, pile, ids) {
    removeEverywhere(game, ids);
    game.discards[pile] = [...ids];
}

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
