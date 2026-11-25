import Game from '../public/js/game.js';
import { createSheet, writeHouse } from '../public/js/sheet.js';

export const players = (n = 1, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, seed = 1) => new Game(players(n), { seed });

// 紙を短い記法で作る：rows は通りごとの番号の並び（null は空き家）、fences は [通り, 位置] の一覧
export function sheetOf(rows = [[], [], []], fences = []) {
    const sheet = createSheet();
    rows.forEach((row, s) => row.forEach((n, h) => { if (n !== null && n !== undefined) writeHouse(sheet, s, h, n); }));
    fences.forEach(([s, i]) => { sheet.fences[s][i] = true; });
    return sheet;
}

// 今の手で、全員が使える組み合わせを1つ決める（num・eff と番号）
export function firstBuild(game, seat) {
    for (const combo of game.combos()) {
        for (const value of Game.values(combo)) {
            const sheet = game.players[seat].sheet;
            for (let s = 0; s < 3; s++) for (let h = 0; h < sheet.houses[s].length; h++) {
                const command = { type: 'build', num: combo.num, eff: combo.eff, value, street: s, house: h };
                if (!game.commandError(game.players[seat], command)) return command;
            }
        }
    }
    return null;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, turnNo: game.turnNo, plans: game.plans, phase: game.phase, results: game.results,
    winners: game.winners, logs: game.logs, events: game.events, commands: game.commands,
    shown: game.shown ?? null, drawn: game.drawn ?? null
});
