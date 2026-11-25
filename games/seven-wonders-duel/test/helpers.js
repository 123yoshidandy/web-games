import Game from '../public/js/game.js';

export const players = (cpu = false) => [{ name: 'P0', isCPU: cpu }, { name: 'P1', isCPU: true }];

// 席0が先手のゲーム
export const newGame = (seed = 1) => new Game(players(), { seed, startPlayer: 0 });

// ドラフトを、並んだ順に取って終える
export function skipDraft(game) {
    while (game.phase === 'draft') game.applyCommand(game.actors()[0], { type: 'pickWonder', wonder: game.draft.offer[0] });
    return game;
}

// 時代Iの最初の番から始まるゲーム
export const playGame = (seed = 1) => skipDraft(newGame(seed));

// 都市を決める（cards・coins・tokens・wonders は与えたものに置き換える）
export function setCity(game, seat, { cards, coins, tokens, wonders } = {}) {
    const p = game.players[seat];
    if (cards) p.cards = [...cards];
    if (coins !== undefined) p.coins = coins;
    if (tokens) p.tokens = [...tokens];
    if (wonders) p.wonders = wonders.map(w => (typeof w === 'string' ? { key: w, built: false, card: null } : { card: null, ...w }));
}

// 並びの slot に、カード key を置く（ほかの場所にあれば入れ替える）
export function placeCard(game, slot, key) {
    const other = game.structure.findIndex(s => s.key === key);
    if (other >= 0) game.structure[other].key = game.structure[slot].key;
    game.structure[slot].key = key;
    game.structure[slot].faceUp = true;
}

// 今取れるカードの番号（左から）
export const openSlots = (game) => game.accessibleSlots();

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
