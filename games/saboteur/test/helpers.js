import Game, { CARDS } from '../public/js/game.js';
import { key } from '../public/js/board.js';

export const players = (n = 4, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 4, seed = 1) => new Game(players(n), { seed });

// 形とつながりからカードを探す（同じ形の n 番目）
export function pathCard(shape, connected = true, nth = 0) {
    return CARDS.filter(c => c.kind === 'path' && c.shape === shape && c.connected === connected)[nth].id;
}
export const actionCard = (kind, tools = null, nth = 0) => CARDS.filter(c => c.kind === kind && (!tools || c.tools.join() === tools.join()))[nth].id;

// 場面を作る：席 current の手番にし、手札を決める（使ったカードは山札から除く）。盤面に道を足す
export function setup(game, { hand, current = 0, paths = [], goalCards, broken } = {}) {
    if (goalCards) game.goals.forEach((g, i) => { g.card = goalCards[i]; });
    paths.forEach(([id, x, y, rotated = false]) => { game.board[key(x, y)] = { type: 'path', id, rotated, by: 0 }; });
    if (broken) broken.forEach((tools, seat) => { game.players[seat].broken = [...tools]; });
    if (hand) {
        game.players.forEach(p => { p.hand = p.hand.filter(id => !hand.includes(id)); });
        game.deck = game.deck.filter(id => !hand.includes(id));
        game.players[current].hand = [...hand];
    }
    game.current = current;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, board: game.board, goals: game.goals, deck: game.deck, goldDeck: game.goldDeck, round: game.round,
    current: game.current, phase: game.phase, history: game.history, logs: game.logs, events: game.events, commands: game.commands
});
