import Game, { DECK_SIZE } from '../public/js/game.js';

export const versus = (seed = 1, { level = 'normal', cpus = 2, auto = false, ...options } = {}) => new Game(
    [{ name: 'あなた', auto }, ...Array.from({ length: cpus }, (_, i) => ({ name: `C${i + 1}`, isCPU: true }))],
    { seed, mode: 'cpu', level, ...options }
);

export const allCpu = (seed, count, options = {}) => new Game(
    Array.from({ length: count }, (_, i) => ({ name: `C${i}`, isCPU: true })),
    { seed, mode: 'cpu', ...options }
);

// 席ごとの表の山を決める（試しの局面を作る。山札から抜いて表の山に置く）
export function setPiles(game, piles) {
    piles.forEach((pile, seat) => {
        for (const card of pile) {
            for (const player of game.players) {
                const i = player.deck.indexOf(card);
                if (i >= 0) player.deck.splice(i, 1);
            }
        }
        game.players[seat].pile = [...pile];
    });
}

// 果物と数からカードの番号（同じ組の何枚目か）
export function card(fruit, count, nth = 0) {
    const counts = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
    const index = counts.findIndex((c, i) => c === count && counts.slice(0, i).filter(x => x === count).length === nth);
    return fruit * 14 + index;
}

export const totalCards = (game) => game.players.reduce((sum, p) => sum + p.deck.length + p.pile.length, 0) + game.pot.length;
export { DECK_SIZE };

export const snapshot = (game) => JSON.stringify({
    players: game.players, pot: game.pot, turn: game.turn, turnStartedAt: game.turnStartedAt, pauseUntil: game.pauseUntil,
    phase: game.phase, commands: game.commands, tableVersion: game.tableVersion, changedAt: game.changedAt, lastT: game.lastT,
    logs: game.logs, result: game.result
});
