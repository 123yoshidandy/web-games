// CPU どうしの対戦：多数のシードで最後まで戦わせ、止まらないことと、強さごとの勝ち数を出す
//   node scripts/cpu-match.mjs [--games 200]
// 解く速さは game.js の cpuFinishTime、宝石の列は cpu-player.js の chooseRow で決まる
// 人のいない対戦では、ラウンドの始まりで全員の結果が決まる（時計を待たない）

import {
    createGame, applyCommand, rankingOf, cpuFinishTime, pickerOf, puzzleOf,
    LEVELS, LEVEL_NAMES, ROUNDS, DEFAULT_TIME_LIMIT
} from '../public/js/game.js';
import { cpuCommand } from '../public/js/cpu-player.js';
import { solve } from '../public/js/solver.js';

const gamesArg = process.argv.indexOf('--games');
const GAMES = gamesArg > 0 ? Number(process.argv[gamesArg + 1]) : 200;
const MAX_STEPS = 500;

// 全員が同じ強さの CPU の対戦（ゲームの中の CPU の仕組みだけで進める）
function playSameLevel(count, seed, difficulty) {
    const state = createGame({ players: Array.from({ length: count }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true })), seed, difficulty });
    let steps = 0;
    while (state.phase !== 'end') {
        if (++steps > MAX_STEPS) throw new Error(`止まった（シード ${seed}）`);
        const next = cpuCommand(state);
        if (!next) throw new Error(`CPU が打てない（シード ${seed}、段階 ${state.phase}）`);
        const result = applyCommand(state, next.seat, next.command);
        if (!result.ok) throw new Error(result.error);
    }
    if (state.history.length !== ROUNDS) throw new Error(`ラウンドの数が違う（シード ${seed}）`);
    return steps;
}

// 席ごとに強さの違う対戦。各席は、その強さの CPU と同じ時刻で解答を送り、同じ選び方で列を選ぶ
function playMixed(levels, seed, difficulty) {
    const state = createGame({ players: levels.map(level => ({ name: level, isCPU: false })), seed, difficulty });
    let steps = 0;
    const run = (seat, command) => {
        const result = applyCommand(state, seat, command);
        if (!result.ok) throw new Error(result.error);
    };
    while (state.phase !== 'end') {
        if (++steps > MAX_STEPS) throw new Error(`止まった（シード ${seed}）`);
        if (state.phase === 'play') {
            const times = levels.map((level, seat) => cpuFinishTime({ seed: state.seed, round: state.round, seat, level, timeLimit: state.timeLimit, difficulty }));
            const order = times.map((t, seat) => ({ t, seat })).sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || a.seat - b.seat);
            for (const { t, seat } of order) {
                if (state.phase !== 'play') break;
                const puzzle = puzzleOf(state, seat);
                run(seat, t === null ? { type: 'giveUp', t: state.timeLimit } : { type: 'submit', placements: solve(puzzle.shape, puzzle.pieces)[0], t });
            }
        } else {
            const seat = pickerOf(state);
            state.level = levels[seat];
            state.players[seat].isCPU = true; // 列の選び方を、その強さの CPU にする
            const next = cpuCommand(state);
            state.players[seat].isCPU = false;
            run(next.seat, next.command);
        }
    }
    return state;
}

let stalls = 0;
const started = Date.now();
for (const difficulty of [3, 4]) {
    console.log(`# ピース${difficulty}つ・制限時間 ${DEFAULT_TIME_LIMIT / 1000}秒`);
    for (const level of LEVELS) {
        const times = [];
        for (let seed = 1; seed <= GAMES; seed++) {
            for (let round = 1; round <= ROUNDS; round++) times.push(cpuFinishTime({ seed, round, seat: 1, level, timeLimit: DEFAULT_TIME_LIMIT, difficulty }));
        }
        const solved = times.filter(t => t !== null);
        console.log(`  ${LEVEL_NAMES[level]}：解ける割合 ${(solved.length / times.length * 100).toFixed(0)}%、平均 ${(solved.reduce((a, b) => a + b, 0) / solved.length / 1000).toFixed(1)}秒`);
    }
    for (const count of [2, 3, 4]) {
        let maxSteps = 0;
        for (let seed = 1; seed <= GAMES; seed++) {
            try {
                maxSteps = Math.max(maxSteps, playSameLevel(count, seed * 7 + count, difficulty));
            } catch (error) {
                stalls++;
                console.log('  NG', error.message);
            }
        }
        console.log(`  CPU ${count}人 × ${GAMES}試合：最後まで進んだ（最大 ${maxSteps} 手）`);
    }
    const wins = Object.fromEntries(LEVELS.map(level => [level, 0]));
    for (let seed = 1; seed <= GAMES; seed++) {
        // 席の並びで有利不利が出ないよう、シードごとに席を回す
        const levels = LEVELS.map((_, i) => LEVELS[(i + seed) % LEVELS.length]);
        try {
            const state = playMixed(levels, seed, difficulty);
            rankingOf(state).filter(r => r.rank === 1).forEach(r => { wins[levels[r.seat]] += 1; });
        } catch (error) {
            stalls++;
            console.log('  NG', error.message);
        }
    }
    console.log(`  強さの違う3人 × ${GAMES}試合の1位（同点を含む）：${LEVELS.map(level => `${LEVEL_NAMES[level]} ${wins[level]}`).join('、')}`);
}
console.log(`止まった試合 ${stalls}（${((Date.now() - started) / 1000).toFixed(1)}秒）`);
process.exit(stalls > 0 ? 1 : 0);
