import Game, { cellKey } from '../public/js/game.js';
import { createRandom } from '../public/js/random.js';

export const PLAYERS = n => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: false }));
export const newGame = (n = 2, seed = 1, options = {}) => new Game(PLAYERS(n), { seed, ...options });

const LETTERS = { C: 'castle', W: 'wheat', F: 'forest', L: 'lake', G: 'grass', S: 'swamp', M: 'mine' };

// 王国を文字から作る。1行は空白区切りで、'C' が城、'W2' は王冠2つの小麦畑、'.' は空き
export function gridFrom(rows) {
    const tokens = rows.map(row => row.trim().split(/\s+/));
    let cx = 0;
    let cy = 0;
    tokens.forEach((row, y) => row.forEach((t, x) => {
        if (t === 'C') { cx = x; cy = y; }
    }));
    const grid = {};
    tokens.forEach((row, y) => row.forEach((t, x) => {
        if (t === '.') return;
        grid[cellKey(x - cx, y - cy)] = { terrain: LETTERS[t[0]], crowns: Number(t.slice(1) || 0) };
    }));
    return grid;
}

// 打てる手からランダムに選んで、最後まで進める
export function playRandom(game, seed, onStep = () => {}) {
    const random = createRandom(seed);
    let steps = 0;
    while (!game.isOver) {
        if (++steps > 1000) throw new Error('終わらない');
        const seat = game.currentSeat;
        let command;
        const line = game.pickLine;
        if (line) {
            const free = line.map((s, i) => (s.king === null ? i : -1)).filter(i => i >= 0);
            command = { type: 'pick', index: free[Math.floor(random() * free.length)] };
        } else {
            const moves = game.getLegalPlacements();
            command = moves.length ? { type: 'place', ...moves[Math.floor(random() * moves.length)] } : { type: 'discard' };
        }
        if (!game.applyCommand(seat, command)) throw new Error(game.lastError);
        onStep(game);
    }
    return steps;
}

export const snapshot = game => JSON.stringify({
    deck: game.deck, kings: game.kings, initialOrder: game.initialOrder, initialIndex: game.initialIndex,
    current: game.current, next: game.next, round: game.round, phase: game.phase, activeIndex: game.activeIndex,
    step: game.step, players: game.players, commands: game.commands, result: game.result
});
