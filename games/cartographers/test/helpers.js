import Game, { SIZE, newBoard } from '../public/js/game.js';

// 盤を文字で作る。F 森・V 村・A 畑・W 水・X 異形・M 山・. 空き。足りない行・列は空き
// mountains: false で、地図に印刷された山を置かない
const LETTERS = { F: 'forest', V: 'village', A: 'farm', W: 'water', X: 'monster', M: 'mountain', '.': null };
export function board(rows = [], { mountains = true } = {}) {
    const b = mountains ? newBoard() : new Array(SIZE * SIZE).fill(null);
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch !== ' ' && ch in LETTERS && (LETTERS[ch] !== null || mountains === false)) b[r * SIZE + c] = LETTERS[ch];
    }));
    return b;
}

// すべて埋まった盤（except のマスだけ空き）
export const fullBoard = (terrain = 'farm', except = []) => newBoard().map((t, cell) => (except.includes(cell) ? null : t ?? terrain));

export const cell = (r, c) => r * SIZE + c;

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));

export const makeGame = (n = 2, seed = 1) => new Game(players(n), { seed });

// 今のカードを差し替える（探索カード）
export function setCard(game, id, { ruins = false } = {}) {
    game.card = { kind: 'explore', id };
    game.phase = 'explore';
    game.ruins = ruins;
    game.pending = game.players.map(p => p.id);
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, edicts: game.edicts, deck: game.deck, card: game.card, ruins: game.ruins, pending: game.pending,
    targets: game.targets, phase: game.phase, season: game.season, time: game.time, logs: game.logs, events: game.events, commands: game.commands
});
