/**
 * ビュー：画面に渡す、JSON にできる状態
 * 盤面・ロボット・今の目標・宣言は全員に見える。目標をめくる順（山）とシードは入れない（先の目標が分かってしまうため）
 */

import { TARGET_COUNT } from './board.js';

const copyRound = round => ({
    number: round.number,
    target: round.target,
    cell: round.cell,
    revealAt: round.revealAt,
    phase: round.phase,
    deadline: round.deadline,
    bids: round.bids.map(bid => ({ ...bid })),
    done: [...round.done],
    queue: round.queue.map(entry => ({ ...entry })),
    demo: round.demo ? { ...round.demo } : null,
    attempts: round.attempts.map(attempt => ({ ...attempt, moves: attempt.moves.map(move => [...move]) })),
    hints: round.hints.map(list => [...list]),
    startRobots: [...round.startRobots],
    moves: round.moves.map(move => [...move]),
    optimum: round.optimum,
    winner: round.winner,
    endAt: round.endAt,
    solved: round.solved ?? null,
    time: round.time ?? null,
    points: round.points ?? null
});

export function createGameView(game, viewer = null) {
    const round = game.round;
    const used = new Set(game.rounds.map(done => done.target));
    if (round) used.add(round.target);
    return {
        mode: game.mode,
        viewer,
        phase: game.phase,
        clock: game.clock,
        startAt: game.options.startAt,
        silver: game.options.silver,
        level: game.options.level,
        targetTotal: game.targetTotal,
        players: game.players.map(player => ({
            seat: player.seat,
            name: player.name,
            isCPU: player.isCPU,
            chips: [...game.chips[player.seat]],
            penalty: game.penalties[player.seat],
            score: game.chips[player.seat].length - game.penalties[player.seat],
            done: round ? round.done[player.seat] : false,
            bid: round && game.mode === 'race' ? (game.bestBidOf(player.seat)?.count ?? null) : null
        })),
        board: { walls: [...game.board.walls], targets: game.board.targets.map(target => ({ ...target })) },
        robots: [...game.robots],
        round: round ? copyRound(round) : null,
        rounds: game.rounds.map(copyRound),
        remaining: [...Array(TARGET_COUNT).keys()].filter(id => !used.has(id)),
        logs: game.logs.map(entry => ({ ...entry })),
        commandCount: game.commands.length,
        result: game.phase === 'end' ? game.result() : null
    };
}
