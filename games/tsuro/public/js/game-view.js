/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - 山は枚数だけ。並びは入れない
 * - 手札は自分の分だけ。ほかの人は枚数だけ（ゲームが終わっても、残った手札は見せない）
 * - 盤・駒・通った道・竜のタイルの持ち主は公開なので、全員に見せる
 * - シードは入れない
 */

import { DISTINCT_ROTATIONS } from './tiles.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const mine = seat !== null && seat !== undefined ? game.players[seat] : null;
    const myTurn = !over && game.phase === 'play' && game.current === seat;
    return {
        you: seat ?? null,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, alive: p.alive, out: p.out, outTurn: p.outTurn,
            handCount: p.hand.length, hand: p.id === seat ? [...p.hand] : null,
            mark: p.mark, pos: p.pos ? { ...p.pos } : null, trail: p.trail.map(s => [...s])
        })),
        board: game.board.map(b => b ? { ...b } : null),
        pileCount: game.pile.length,
        useDragon: game.useDragon,
        dragon: game.dragon,
        first: game.first,
        current: game.current,
        phase: game.phase,
        turn: game.turn,
        freeMarks: game.phase === 'place' ? game.freeMarks() : [],
        // 自分の番に置ける手（同じ形になる向きは1つにまとめる）。out：自分が脱落する。allowed：置ける
        moves: myTurn && mine ? movesFor(game, seat) : [],
        winners: game.winners ? [...game.winners] : null,
        over,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}

function movesFor(game, seat) {
    const list = [];
    game.players[seat].hand.forEach(tile => {
        for (let rot = 0; rot < DISTINCT_ROTATIONS[tile]; rot++) list.push({ tile, rot, out: game.selfOut(seat, tile, rot) });
    });
    const forced = list.every(m => m.out);
    return list.map(m => ({ ...m, allowed: forced || !m.out }));
}
