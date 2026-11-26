/**
 * CPU：ダイスの組の選び方と、続けるか止めるかを決める
 * DOM に依存しない。ゲームの乱数は使わず、状態から作った別の乱数を使う（記録の再現がずれないように）
 *
 * 続けるか：バーストの確率 × 失う進み と、もう 1 回振ったときの見込みの進み を比べる
 * 強すぎないように、人間らしいゆらぎを入れる（LEVELS）
 *   caution   慎重さの幅（毎回この範囲から選ぶ。1 が損得の釣り合い。小さいほど攻める）
 *   noise     組の選び方に足すゆらぎ
 *   urgency   相手が勝ちそうなときに攻めるか
 */

import { createRandom } from './random.js';
import { COLUMNS, COLUMN_LENGTH, COLUMNS_TO_WIN, MAX_RUNNERS, moveOptions, simulate, bustChance } from './game.js';

export const LEVELS = {
    easy: { caution: [0.2, 3], noise: 0.45, newRunnerPenalty: 0, urgency: false },
    normal: { caution: [0.45, 1.7], noise: 0.15, newRunnerPenalty: 0.06, urgency: false },
    // 強さを測るための、ゆらぎのない CPU（画面では使わない）
    strong: { caution: [1, 1], noise: 0, newRunnerPenalty: 0.1, urgency: true },
    // 比べるための、でたらめに打つ CPU（画面では使わない）
    random: { caution: [0, 3], noise: 100, newRunnerPenalty: 0, urgency: false, randomStop: true },
    // 比べるための、初心者によくある打ち方（ランナーが 3 つ出たら止める。画面では使わない）
    naive: { caution: [1, 1], noise: 0, newRunnerPenalty: 0, urgency: false, stopAtThree: true }
};

const TOP_BONUS = 0.6; // 頂上に着く（列を取れる）ことの値打ち

function cpuRandom(game, seat) {
    return createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 2654435761) ^ Math.imul(seat + 1, 40503)) >>> 0);
}

// ランナーの進みの値打ち（列の長さに対する割合。頂上に着けば上乗せ）
function runnerValue(runners, base) {
    return Object.entries(runners).reduce((sum, [key, pos]) => {
        const col = Number(key);
        return sum + (pos - base(col)) / COLUMN_LENGTH[col] + (pos >= COLUMN_LENGTH[col] ? TOP_BONUS : 0);
    }, 0);
}

// 進め方の値打ち（進みの割合 − 新しいランナーを出す損）
function moveValue(option, state, cfg) {
    const next = simulate(option.sums, state.position, state.runners, state.claimed);
    const gain = runnerValue(next, col => (col in state.runners ? state.runners[col] : state.position(col)));
    const newRunners = Object.keys(next).length - Object.keys(state.runners).length;
    // ランナーが減るほど、次に進める列が減る（真ん中の列なら出やすいので損が小さい）
    const penalty = Object.keys(next).filter(c => !(c in state.runners)).reduce((s, c) => s + cfg.newRunnerPenalty * (1 + Math.abs(7 - Number(c)) / 5), 0);
    return gain - (newRunners > 0 ? penalty : 0);
}

export function chooseMove(game, seat, cfg = LEVELS.normal, random = cpuRandom(game, seat)) {
    const state = game.ruleState();
    let best = null;
    game.legalMoves().forEach(option => {
        const value = moveValue(option, state, cfg) + (random() * 2 - 1) * cfg.noise;
        if (!best || value > best.value) best = { option, value };
    });
    return best ? { type: 'move', pair: best.option.pair, sums: best.option.sums } : null;
}

// もう 1 回振ったときの見込みの進み（バーストしなかった場合の、一番よい進め方の平均）
const gainCache = new Map();
function expectedGain(state, cfg) {
    const key = COLUMNS.map(c => (c in state.runners ? `r${state.runners[c]}` : state.claimed[c] !== null ? 'x' : state.position(c))).join(',');
    if (gainCache.has(key)) return gainCache.get(key);
    let total = 0;
    let count = 0;
    for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) for (let c = b; c <= 6; c++) for (let d = c; d <= 6; d++) {
        // 並びの違いを重みで数える（同じ目の組み合わせの出やすさ）
        const weight = permutations([a, b, c, d]);
        const options = moveOptions([a, b, c, d], state);
        if (options.length === 0) continue;
        total += weight * Math.max(...options.map(o => moveValue(o, state, cfg)));
        count += weight;
    }
    const gain = count ? total / count : 0;
    if (gainCache.size > 5000) gainCache.clear();
    gainCache.set(key, gain);
    return gain;
}

function permutations(values) {
    const fact = n => (n <= 1 ? 1 : n * fact(n - 1));
    const counts = {};
    values.forEach(v => { counts[v] = (counts[v] ?? 0) + 1; });
    return Object.values(counts).reduce((p, n) => p / fact(n), fact(values.length));
}

// 続けるなら true
export function shouldContinue(game, seat, cfg = LEVELS.normal, random = cpuRandom(game, seat)) {
    const state = game.ruleState();
    const base = col => state.position(col);
    // 止めれば勝てるなら止める
    const tops = Object.entries(state.runners).filter(([c, pos]) => pos >= COLUMN_LENGTH[c]).length;
    if (game.claimedCount(seat) + tops >= COLUMNS_TO_WIN) return false;
    if (cfg.randomStop) return random() < 0.6;
    if (cfg.stopAtThree) return Object.keys(state.runners).length < MAX_RUNNERS;
    const p = bustChance(state);
    if (p === 0) return true;
    const atRisk = runnerValue(state.runners, base);
    const gain = expectedGain(state, cfg);
    let caution = cfg.caution[0] + random() * (cfg.caution[1] - cfg.caution[0]);
    // 相手があと 1 列で勝ちそうなら、攻める
    if (cfg.urgency && game.players.some(p2 => p2.id !== seat && game.claimedCount(p2.id) >= COLUMNS_TO_WIN - 1)) caution *= 0.6;
    // ランナーがまだ残っていれば、もう少し攻めやすい（次に新しい列でも進める）
    if (Object.keys(state.runners).length < MAX_RUNNERS) caution *= 0.9;
    return (1 - p) * gain > p * atRisk * caution;
}

// ヒント：人の番に、CPU（ふつう）が選ぶ操作（盤はすべて見えている）。手は打たない
export function suggest(game, seat) {
    if (game.isOver() || game.current !== seat) return null;
    if (game.phase === 'roll') return { type: 'roll' };
    if (game.phase === 'choose') return chooseMove(game, seat, LEVELS.normal);
    return { type: shouldContinue(game, seat, LEVELS.normal) ? 'roll' : 'stop' };
}

// CPU の番なら 1 手打つ。打てたら true
export function runCpuStep(game, levelOf = () => 'normal') {
    if (game.isOver()) return false;
    const seat = game.current;
    if (!game.players[seat].isCPU) return false;
    const cfg = LEVELS[levelOf(seat)] ?? LEVELS.normal;
    let command;
    if (game.phase === 'roll') command = { type: 'roll' };
    else if (game.phase === 'choose') command = chooseMove(game, seat, cfg);
    else command = { type: shouldContinue(game, seat, cfg) ? 'roll' : 'stop' };
    if (command && game.applyCommand(seat, command)) return true;
    // 想定外の断りでも止めない：一番単純な手を順に試す
    const fallback = [{ type: 'roll' }, { type: 'stop' }, ...game.legalMoves().map(o => ({ type: 'move', ...o }))];
    return fallback.some(c => game.applyCommand(seat, c));
}

export const isCpuTurn = game => !game.isOver() && game.players[game.current].isCPU;
