import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0が親で始まるゲーム
export const newGame = (n = 3, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

// 手札を決める（ほかの人の手札と入れ替えて、全体の枚数と各自の枚数を保つ）
export function setHand(game, seat, kinds) {
    const p = game.players[seat];
    kinds.forEach((kind, i) => {
        if (p.hand[i] === kind) return;
        const donor = game.players.find(o => o.id !== seat && o.hand.includes(kind));
        const j = p.hand.indexOf(kind, i);
        if (j >= 0) {
            [p.hand[i], p.hand[j]] = [p.hand[j], p.hand[i]];
            return;
        }
        if (!donor) throw new Error(`${kind} が足りません`);
        const k = donor.hand.indexOf(kind);
        donor.hand[k] = p.hand[i];
        p.hand[i] = kind;
    });
}

// 全部のカード（手札・前のカード・除いたカード・渡している途中のカード）の数
export function totalCards(game) {
    return game.removed.length + (game.round ? 1 : 0) + game.players.reduce((s, p) => s + p.hand.length + p.table.length, 0);
}

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
