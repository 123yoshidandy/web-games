import Game, { CARDS, COLORS, emptyTokens } from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));

// 席0から始まるゲーム
export const makeGame = (n = 2, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

// { white: 1 } → 6色そろった形
export const tokens = (partial = {}) => ({ ...emptyTokens(), ...partial });

// 指定の条件に合うカードの id
export const findCard = (predicate) => CARDS.find(predicate).id;

// ボーナスの色ごとに、その数だけカード（どれでもよい）を持たせる
export function giveBonuses(player, counts) {
    COLORS.forEach(color => {
        const ids = CARDS.filter(card => card.bonus === color && card.points === 0).map(card => card.id);
        for (let i = 0; i < (counts[color] ?? 0); i++) player.cards.push(ids[i % ids.length]);
    });
}

// 場の (level, slot) にカードを置く（山札と場から取り除いてから）
export function placeOnBoard(game, level, slot, cardId) {
    [1, 2, 3].forEach(l => {
        game.decks[l] = game.decks[l].filter(id => id !== cardId);
        game.board[l] = game.board[l].map(id => (id === cardId ? null : id));
    });
    game.board[level][slot] = cardId;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, bank: game.bank, decks: game.decks, board: game.board, nobles: game.nobles,
    current: game.current, phase: game.phase, turn: game.turn, finalRound: game.finalRound,
    logs: game.logs, events: game.events, commands: game.commands, nobleChoices: game.nobleChoices
});
