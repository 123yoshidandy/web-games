/**
 * ビューから作る「見える範囲だけのゲーム」
 * Game の判定（置けるか、王国のつながり、争いの強さ）を、ビューの写しに当てて使う。CPU の先読みと画面の案内で使う
 * 見えないもの（ほかの人の手札・袋・ほかの人の点）は入れない。ほかの人の点は0から数え、手札は空にする
 */

import Game from './game.js';
import { COLORS } from './data.js';
import { CELL_COUNT, RIVER } from './board.js';

const quiet = () => {};

export function simFromView(view) {
    const sim = Object.create(Game.prototype);
    Object.assign(sim, {
        board: view.board.map(x => (x ? { ...x } : null)),
        treasures: [...view.treasures],
        monuments: view.monuments.map(m => ({ colors: [...m.colors], cell: m.cell })),
        players: view.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, cpuLevel: null,
            hand: p.hand ? [...p.hand] : [],
            leaders: { ...p.leaders },
            catastrophes: p.catastrophes,
            scores: p.scores ? { ...p.scores } : Object.fromEntries(COLORS.map(c => [c, 0])),
            treasures: p.treasures ?? 0
        })),
        bag: [],
        current: view.current,
        actionsLeft: 99, // 先読みでは手番を終えない（袋が見えないので）
        phase: view.phase,
        conflict: view.conflict ? structuredClone(view.conflict) : null,
        war: view.war ? structuredClone(view.war) : null,
        monumentChoice: view.monumentChoice ? structuredClone(view.monumentChoice) : null,
        turnNumber: view.turnNumber,
        winners: [], endReason: null,
        commands: [], logs: [], events: [], eventSeq: 0, lastError: null, cpuSalt: 0
    });
    sim.log = quiet;
    sim.emit = quiet;
    return sim;
}

export function cloneSim(sim) {
    const copy = Object.create(Game.prototype);
    Object.assign(copy, {
        ...sim,
        board: sim.board.map(x => (x ? { ...x } : null)),
        treasures: [...sim.treasures],
        monuments: sim.monuments.map(m => ({ colors: [...m.colors], cell: m.cell })),
        players: sim.players.map(p => ({ ...p, hand: [...p.hand], leaders: { ...p.leaders }, scores: { ...p.scores } })),
        conflict: sim.conflict ? structuredClone(sim.conflict) : null,
        war: sim.war ? structuredClone(sim.war) : null,
        monumentChoice: sim.monumentChoice ? structuredClone(sim.monumentChoice) : null,
        commands: []
    });
    copy.log = quiet;
    copy.emit = quiet;
    return copy;
}

// 置けるマスの一覧
export function tileCells(sim, seat, color) {
    const out = [];
    for (let c = 0; c < CELL_COUNT; c++) {
        if (sim.board[c] || (color === 'blue') !== RIVER.has(c)) continue;
        if (!sim.tileError(seat, color, c)) out.push(c);
    }
    return out;
}

export function leaderCells(sim, seat, color) {
    const out = [];
    for (let c = 0; c < CELL_COUNT; c++) {
        if (sim.board[c] || RIVER.has(c)) continue;
        if (!sim.leaderError(seat, color, c)) out.push(c);
    }
    return out;
}

export function catastropheCells(sim, seat) {
    const out = [];
    for (let c = 0; c < CELL_COUNT; c++) {
        if (!sim.catastropheError(seat, c)) out.push(c);
    }
    return out;
}
