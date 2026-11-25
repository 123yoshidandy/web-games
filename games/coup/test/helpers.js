import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0の番から始まるゲーム
export const newGame = (n = 3, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

// 手札を決める（山の札と入れ替えて、全体の枚数を保つ）
// 山に足りなければ、まだ手札を決めていない人の手札から取り、その人には山から補う
export function setHand(game, seat, roles) {
    game.fixedSeats ??= new Set();
    game.fixedSeats.add(seat);
    const p = game.players[seat];
    game.deck.push(...p.hand);
    p.hand = [];
    roles.forEach(role => {
        let i = game.deck.indexOf(role);
        if (i < 0) {
            const donor = game.players.find(o => !game.fixedSeats.has(o.id) && o.hand.includes(role));
            if (!donor) throw new Error(`${role} が足りません`);
            const j = donor.hand.indexOf(role);
            const k = game.deck.findIndex(r => !roles.includes(r));
            donor.hand[j] = game.deck[k];
            game.deck[k] = role;
            i = k;
        }
        game.deck.splice(i, 1);
        p.hand.push(role);
    });
}

// 全部の札（手札・失った札・山・交換で引いた札）の数
export function totalCards(game) {
    return game.deck.length + game.drawn.length + game.players.reduce((s, p) => s + p.hand.length + p.lost.length, 0);
}

export const act = (game, action, target) => game.applyCommand(game.current, target === undefined ? { type: 'action', action } : { type: 'action', action, target });

// 答え待ちの全員に通させる
export function allowAll(game) {
    for (const seat of [...game.waiting]) game.applyCommand(seat, { type: 'allow' });
}

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, fixedSeats, ...rest } = game;
    return JSON.stringify(rest);
}
