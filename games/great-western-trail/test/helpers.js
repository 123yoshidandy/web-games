import Game from '../public/js/game.js';
import { MARKET_IDS } from '../public/js/data.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, seed = 1) => new Game(players(n), { seed });

// 手番を seat にして、移動の前（stage: move）から始める
export function setTurn(game, seat, stage = 'move') {
    game.state.turn = { seat, stage, used: [], mode: null, queue: [], autoEnd: false };
}

// 牧場主を置いて、その場所を使う段にする
export function standAt(game, seat, loc) {
    setTurn(game, seat, loc === 'KC' ? 'kc' : 'act');
    game.state.players[seat].loc = loc;
}

// 手札を決める（牛は品種の名前で。足りない分は、その人のカードの id を作り直さずに市場の牛の id を使う）
export function setHand(game, seat, breeds) {
    const p = game.state.players[seat];
    const pool = [...p.deck, ...p.hand, ...p.discard];
    const hand = [];
    breeds.forEach(b => {
        let i = pool.findIndex(id => id.includes(b));
        if (i < 0) {
            const id = MARKET_IDS.find(m => m.includes(b) && !hand.includes(m));
            hand.push(id);
            return;
        }
        hand.push(pool.splice(i, 1)[0]);
    });
    p.hand = hand;
    p.deck = pool;
    p.discard = [];
}

export function apply(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${JSON.stringify(command)}: ${game.lastError}`);
}

export const snapshot = (game) => JSON.stringify({ state: game.state, commands: game.commands, logs: game.logs });
