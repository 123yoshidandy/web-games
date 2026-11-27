/**
 * CPU と、時間で進む出来事（時間切れ・CPU の宣言）
 *
 * CPU は、目標ごとに「いつ・何手を見つけるか」の計画を立てる。計画はシードと目標の番号と席から決まる別の乱数で作り、
 * ゲームの乱数は使わない（同じ記録から同じ計画になり、再現がずれない）
 * - 最短の手数は探索（solver.js）で求める。強さによって、見つけるまでの時間と、最短を見つける割合が違う
 *   （最短でないときは 1〜数手多い手数で宣言し、あとで最短に気づいて宣言し直すこともある）
 * - 実演は、見つけた最短の手順で行う（宣言した手数以内なので成功する）
 * 時間で進む出来事は nextEvent で1つずつ取り出す。ローカルはタイマーで、サーバーは届いたメッセージのたびに（期限）確かめる
 * 人が全員パスしたら、残りは待たずに先へ進める（CPU の宣言は計画した時刻のまま入るので、結果は待った場合と同じ）
 */

import { solve } from './solver.js';
import { createRandom, mixSeed } from './random.js';
import { MAX_BID } from './game.js';

// miss：その目標はどうしても見えず、パスする割合（人も、ときどき詰まる）
// 見つけるまでの時間 = (base + perMove × 最短の手数) × ひらめきのばらつき（対数正規。spread が広いほど目標ごとの当たり外れが大きい）
// 人の速さに合わせる：6手の目標で、やさしい 約45秒・ふつう 約24秒・つよい 約15秒（手数が多いほど長くかかる）
export const CPU_LEVELS = {
    easy: { miss: 0.2, base: 22000, perMove: 3800, spread: 0.7, exact: 0.5, slack: 2, improve: 0.4, improveAfter: [10000, 25000], giveUp: 11, giveUpAfter: [80000, 140000] },
    normal: { miss: 0.15, base: 11000, perMove: 2200, spread: 0.7, exact: 0.62, slack: 2, improve: 0.45, improveAfter: [8000, 18000], giveUp: 15, giveUpAfter: [100000, 160000] },
    hard: { miss: 0.12, base: 7500, perMove: 1300, spread: 0.7, exact: 0.7, slack: 1, improve: 0.55, improveAfter: [4000, 10000], giveUp: MAX_BID, giveUpAfter: [120000, 170000] }
};
export const LEVEL_KEYS = ['easy', 'normal', 'hard'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };

const plans = new Map();
const PLAN_LIMIT = 100;

// 今の目標の最短の手順（目標を見せたときのロボットの位置から）
export function solveRound(game) {
    const round = game.round;
    return solve(game.board.walls, round.startRobots, round.target, round.cell);
}

// CPU の計画：{ solution, steps: [{ at, count }], passAt }
export function cpuPlan(game, seat) {
    const round = game.round;
    const wanted = game.players[seat]?.level ?? game.options.level;
    const levelKey = CPU_LEVELS[wanted] ? wanted : 'normal';
    const key = `${game.options.seed}|${round.number}|${round.revealAt}|${round.target}|${seat}|${levelKey}`;
    if (plans.has(key)) return plans.get(key);
    const level = CPU_LEVELS[levelKey];
    const random = createRandom(mixSeed(game.options.seed, round.number, round.target, seat + 1, LEVEL_KEYS.indexOf(levelKey)));
    const between = ([low, high]) => low + (high - low) * random();
    const solution = solveRound(game);
    let plan;
    if (!solution || solution.count > level.giveUp || random() < level.miss) {
        plan = { solution, steps: [], passAt: Math.round(round.revealAt + between(level.giveUpAfter)) };
    } else {
        const best = solution.count;
        const found = random() < level.exact ? best : best + 1 + Math.floor(random() * level.slack);
        // 正規分布の乱数（Box–Muller）で、ひらめきの当たり外れを作る
        const gauss = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
        const first = round.revealAt + (level.base + level.perMove * best) * Math.exp(gauss * level.spread);
        const steps = [{ at: Math.round(first), count: Math.min(found, MAX_BID) }];
        if (found > best && random() < level.improve) steps.push({ at: Math.round(first + between(level.improveAfter)), count: best });
        plan = { solution, steps, passAt: null };
    }
    plans.set(key, plan);
    if (plans.size > PLAN_LIMIT) plans.delete(plans.keys().next().value);
    return plan;
}

// CPU の席の次の操作 { at, command }（なければ null）
export function cpuAction(game, seat) {
    const round = game.round;
    if (!round || game.phase === 'end' || game.mode !== 'race') return null;
    if (round.phase === 'demo') {
        if (round.demo.seat !== seat) return null;
        const { solution } = cpuPlan(game, seat);
        const moves = solution && solution.count <= round.demo.count ? solution.moves : [];
        return { at: round.demo.startAt, command: { type: 'demo', moves } };
    }
    if (!['search', 'countdown'].includes(round.phase) || round.done[seat]) return null;
    const plan = cpuPlan(game, seat);
    const own = game.bestBidOf(seat)?.count ?? Infinity;
    const lowest = game.lowestBid()?.count ?? Infinity;
    const pending = plan.steps.filter(step => step.count < own);
    const useful = pending.filter(step => step.count < lowest);
    if (!useful.length) {
        // 出せる手数がない（ほかの人がもっと少なく宣言した、見つからない）：計画の時刻にパスする
        const at = plan.passAt ?? pending[0]?.at ?? plan.steps.at(-1)?.at ?? round.revealAt;
        return { at, command: { type: 'pass' } };
    }
    return { at: useful[0].at, command: { type: 'declare', count: useful[0].count, final: useful.length === 1 } };
}

// 次に時間で起きる出来事 { seat（時間切れは null）, at, command, fastForward }。なければ null
export function nextEvent(game) {
    const round = game.round;
    if (game.phase === 'end' || game.mode !== 'race' || !round) return null;
    let best = null;
    const deadline = round.phase === 'demo' ? round.demo?.deadline : round.deadline;
    if (Number.isFinite(deadline)) best = { seat: null, at: deadline, command: { type: 'timeout' } };
    for (const player of game.players) {
        if (!player.isCPU) continue;
        const action = cpuAction(game, player.seat);
        if (action && (!best || action.at < best.at)) best = { seat: player.seat, at: action.at, command: action.command };
    }
    if (!best) return null;
    const thinking = ['search', 'countdown'].includes(round.phase);
    const humansDone = thinking && game.players.every(player => player.isCPU || round.done[player.seat]);
    // 人が全員パスしたあとに時間切れが先に来るなら、まだ終えていない CPU のパスにする（時間切れを待たずに先へ進める）
    if (humansDone && best.seat === null) {
        const waiting = game.players.find(player => player.isCPU && !round.done[player.seat]);
        if (waiting) best = { seat: waiting.seat, at: best.at, command: { type: 'pass' } };
    }
    best.command = { ...best.command, at: best.at };
    // 早送り：人が全員パスした、または出来事の時刻をゲームの時計がもう過ぎている（早送りのあとの CPU の実演など）
    best.fastForward = best.at <= game.clock || humansDone;
    return best;
}

export const isDue = (event, now) => event.fastForward || event.at <= now;

// 時刻 now までに起きる出来事を1つ進める（進めたら true）
// 早送りの出来事は、計画した時刻ではなく今の時刻で入れる（ゲームの時計を実際の時刻より先へ進めない。進めると次の目標を待たされる）
export function stepDue(game, now) {
    const event = nextEvent(game);
    if (!event || !isDue(event, now)) return false;
    const at = event.fastForward ? Math.min(event.at, now) : event.at;
    return game.applyCommand(event.seat, { ...event.command, at });
}

// 時刻 now までに起きる出来事を全部進める。進めた数を返す
export function runDue(game, now, limit = 200) {
    let count = 0;
    while (count < limit && stepDue(game, now)) count++;
    return count;
}

// 次に確かめる時刻（すぐなら game.clock、なければ null）
export function nextEventTime(game) {
    const event = nextEvent(game);
    if (!event) return null;
    return event.fastForward ? game.clock : event.at;
}

/**
 * おすすめの手（ヒント・テスト・オンラインの試験で使う）。その席が今できる操作。できなければ null
 * 早解き：最短の手数がまだ誰の宣言より少なければ宣言、そうでなければパス。実演の番なら最短の手順
 * 1人の練習：最短の手順の最初の1手
 */
export function suggest(game, seat) {
    const round = game.round;
    if (!round || game.phase === 'end') return null;
    if (game.mode === 'solo') {
        if (round.phase === 'result') return { type: 'next' };
        if (round.phase !== 'solve') return null;
        const solution = solve(game.board.walls, game.robots, round.target, round.cell);
        if (!solution) return { type: 'giveup' };
        const [robot, dir] = solution.moves[0];
        return { type: 'move', robot, dir };
    }
    if (round.phase === 'demo') {
        if (round.demo.seat !== seat) return null;
        const solution = solveRound(game);
        return { type: 'demo', moves: solution && solution.count <= round.demo.count ? solution.moves : [] };
    }
    if (!['search', 'countdown'].includes(round.phase) || round.done[seat]) return null;
    const solution = solveRound(game);
    const own = game.bestBidOf(seat)?.count ?? Infinity;
    const lowest = game.lowestBid()?.count ?? Infinity;
    if (solution && solution.count < lowest && solution.count < own) return { type: 'declare', count: solution.count };
    return { type: 'pass' };
}
