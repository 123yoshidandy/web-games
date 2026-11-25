import Game from '../public/js/game.js';
import { CARD_TYPES, CHARACTER_ORDER } from '../public/js/cards.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0が王冠を持って始めるゲーム
export const newGame = (n = 4, seed = 1) => new Game(players(n), { seed, crown: 0 });

// 地区の種類から札を1枚取り出す（山から。山になければ、ほかの人の手札から取り、その人には山から補う）
export function takeCard(game, type) {
    let i = game.deck.findIndex(id => CARD_TYPES[id] === type);
    if (i >= 0) return game.deck.splice(i, 1)[0];
    for (const p of game.players) {
        i = p.hand.findIndex(id => CARD_TYPES[id] === type);
        if (i >= 0) {
            const id = p.hand[i];
            p.hand[i] = game.deck.shift();
            return id;
        }
    }
    throw new Error(`${type} が足りません`);
}

// 手札を決める（もとの手札は山の下へ）
export function setHand(game, seat, types) {
    const p = game.players[seat];
    game.deck.push(...p.hand);
    p.hand = [];
    p.hand = types.map(type => takeCard(game, type));
    return p.hand;
}

// 都市を決める（もとの都市は山の下へ）
export function setCity(game, seat, types) {
    const p = game.players[seat];
    game.deck.push(...p.city);
    p.city = [];
    p.city = types.map(type => takeCard(game, type));
    return p.city;
}

// 役割を選ぶ手順を進める。want：席ごとに選ぶ役割（足りない分は、だれも欲しがっていない役割から）
export function draftAs(game, want = {}) {
    const wanted = new Set(Object.values(want).flat());
    let guard = 0;
    while (game.phase === 'draft' && guard++ < 50) {
        const d = game.draft;
        const step = d.steps[d.step];
        const options = step.kind === 'pick' ? game.draftOptions() : d.available;
        const mine = (want[step.seat] ?? []).filter(c => !game.players[step.seat].characters.includes(c));
        let character;
        if (step.kind === 'pick') character = options.find(c => mine.includes(c)) ?? options.find(c => !wanted.has(c)) ?? options[0];
        else character = options.find(c => !wanted.has(c)) ?? options[0];
        if (!game.applyCommand(step.seat, { type: step.kind, character })) throw new Error(game.lastError);
    }
}

// 役割を選び、表や伏せた札に出ないように並べ替えてから選ぶ（startRound のあとに呼ぶ）
// 欲しい役割が表や伏せた札にあれば、残りの札と入れ替える
export function arrange(game, want) {
    const d = game.draft;
    const wanted = Object.values(want).flat();
    const swapOut = (list) => list.map(c => {
        if (!wanted.includes(c)) return c;
        const k = d.available.findIndex(x => !wanted.includes(x) && x !== 'king');
        const other = d.available[k];
        d.available[k] = c;
        return other;
    });
    d.faceUp = swapOut(d.faceUp);
    d.faceDown = swapOut(d.faceDown);
    d.available.sort((a, b) => CHARACTER_ORDER.indexOf(a) - CHARACTER_ORDER.indexOf(b));
    d.offers.forEach(list => list.forEach(o => { o.options = game.draftOptions(); }));
    draftAs(game, want);
}

// 今の手番の人
export const turnSeat = (game) => game.turn?.seat;

// 手番を終える（行動していなければ2金を取ってから）
export function finishTurn(game) {
    const seat = game.turn.seat;
    if (!game.turn.acted) game.applyCommand(seat, { type: 'gold' });
    if (game.phase === 'keep') game.applyCommand(seat, { type: 'keep', cards: game.drawn.slice(0, game.keepCount) });
    if (!game.applyCommand(seat, { type: 'end' })) throw new Error(game.lastError);
}

// 指定の役割の手番まで、ほかの手番を進める
export function playUntil(game, character) {
    let guard = 0;
    while (game.turn?.character !== character && guard++ < 20) finishTurn(game);
    if (game.turn?.character !== character) throw new Error(`${character} の手番になりません`);
}

// 全部の地区カードの数（山・手札・都市・引いた札・墓地で拾うか聞いている札）
export function totalCards(game) {
    return game.deck.length + game.drawn.length + (game.pendingGrave ? 1 : 0)
        + game.players.reduce((s, p) => s + p.hand.length + p.city.length, 0);
}

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
