/**
 * ウボンゴのルール（DOM に依存しない。画面・CPU・サーバー・テストで同じものを使う）
 *
 * 毎ラウンド、全員が自分のカード（盤面の形）を受け取り、共通のダイスの目で決まるピースで、盤面をちょうど埋める
 * 早く解いた順に、宝石のボードでコマを動かし（1位は3列まで、2位は2列、3位は1列）、止まった列の手前から宝石を2個取る
 * 9ラウンドで、1色をいちばん多く集めた人の勝ち（同じなら2番目に多い色、その次…で比べる）
 * 1人で遊ぶときはタイムアタック：9問を解く時間の合計を競う（宝石はなし）
 *
 * 状態はただのオブジェクト（JSON にできる）。操作は applyCommand(state, seat, command) だけで変える
 * 時刻はラウンドの始まりからのミリ秒（t）を操作に入れて渡す（画面では端末の時計、オンラインではサーバーの時計）
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）
 */

import { CARDS } from './puzzles.js';
import { isSolution } from './solver.js';
import { pieceSize } from './pieces.js';
import { shuffle } from './random.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const ROUNDS = 9;
export const GEM_COLORS = ['ruby', 'sapphire', 'emerald', 'amber', 'amethyst', 'pearl'];
export const COLOR_NAMES = { ruby: '赤', sapphire: '青', emerald: '緑', amber: '黄', amethyst: '紫', pearl: '白' };
export const GEM_ROWS = 6;
export const GEMS_PER_ROW = 12;
export const GEMS_PER_TAKE = 2;
export const REACH = [3, 2, 1];             // 解いた順に、コマを動かせる列の数（4位は動かさずに取る）
export const TIME_LIMITS = [60000, 90000, 120000];
export const DEFAULT_TIME_LIMIT = 90000;
export const HINT_PENALTY_MS = 10000;      // ヒント1回でタイムに足す時間
export const SKIP_PENALTY_MS = 60000;      // タイムアタックで問題を飛ばしたときに足す時間
export const LEVELS = ['easy', 'normal', 'hard'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
export const DIFFICULTIES = [3, 4];

// CPU が解くまでの時間（制限時間に対する割合の平均とばらつき）。制限時間を過ぎる回は解けない
const CPU_PACE = {
    easy: { mean: 0.8, spread: 0.35 },
    normal: { mean: 0.6, spread: 0.3 },
    hard: { mean: 0.4, spread: 0.2 }
};
const SOLO_PACE_BASE = 60000; // タイムアタックには制限時間がないので、CPU の基準（使わないが形をそろえる）

// ===== 乱数（状態に数で持ち、保存・復元できるようにする。mulberry32） =====

function nextRandom(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// CPU の時間は、ゲームの乱数を使わず、シード・ラウンド・席から作った別の乱数で決める
function cpuRandom(seed, round, seat) {
    let s = (seed ^ Math.imul(round, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA77)) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// CPU が解き終える時刻（ラウンドの始まりからのミリ秒）。解けないときは null
export function cpuFinishTime({ seed, round, seat, level = 'normal', timeLimit, difficulty = 3 }) {
    const random = cpuRandom(seed, round, seat);
    const pace = CPU_PACE[level] ?? CPU_PACE.normal;
    const base = timeLimit ?? SOLO_PACE_BASE;
    const harder = difficulty === 4 ? 1.08 : 1;
    const t = Math.round(base * harder * (pace.mean + pace.spread * (random() + random() - 1)));
    const time = Math.max(6000, t);
    return timeLimit && time > timeLimit ? null : time;
}

// ===== 始める =====

// players: [{ name, isCPU }]。1人ならタイムアタック
export function createGame({ players, seed, difficulty = 3, timeLimit = DEFAULT_TIME_LIMIT, level = 'normal', rounds = ROUNDS }) {
    if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は1〜4人です');
    if (!DIFFICULTIES.includes(difficulty)) throw new Error('ピースの数は3か4です');
    const mode = players.length === 1 ? 'solo' : 'race';
    const state = {
        mode,
        difficulty,
        timeLimit: mode === 'race' ? timeLimit : null,
        level: LEVELS.includes(level) ? level : 'normal',
        rounds,
        players: players.map(p => ({ name: String(p.name), isCPU: Boolean(p.isCPU) })),
        seed: seed >>> 0,
        rng: seed >>> 0,
        deck: [],
        round: 0,
        phase: 'play',
        die: 1,
        puzzles: [],
        results: [],
        hints: players.map(() => 0),
        cpuTimes: [],
        gemRows: [],
        pawns: [],
        gems: players.map(() => Object.fromEntries(GEM_COLORS.map(c => [c, 0]))),
        collect: null,
        history: [],
        logs: [],
        soloTotal: 0,
        startAt: null,
        pickAt: null
    };
    state.deck = shuffle(CARDS[difficulty].map(card => card.id), () => nextRandom(state));
    if (mode === 'race') {
        const gems = shuffle(GEM_COLORS.flatMap(color => Array(GEM_ROWS * GEMS_PER_ROW / GEM_COLORS.length).fill(color)), () => nextRandom(state));
        state.gemRows = Array.from({ length: GEM_ROWS }, (_, row) => gems.slice(row * GEMS_PER_ROW, (row + 1) * GEMS_PER_ROW));
        // コマは、なるべく離れた列から始める
        const spread = [[0], [1, 4], [0, 2, 5], [0, 2, 3, 5]][players.length - 1];
        state.pawns = spread.slice();
    }
    startRound(state);
    return state;
}

const cardById = (difficulty, id) => CARDS[difficulty].find(card => card.id === id);

// その席の今の問題 { id, shape, pieces }
export function puzzleOf(state, seat) {
    const entry = state.puzzles[seat];
    if (!entry) return null;
    const card = cardById(state.difficulty, entry.card);
    return { id: card.id, shape: card.shape, pieces: card.sets[entry.set] };
}

const isHuman = (state, seat) => !state.players[seat].isCPU;

function startRound(state) {
    state.round += 1;
    state.phase = 'play';
    state.collect = null;
    state.die = 1 + Math.floor(nextRandom(state) * 6);
    state.puzzles = state.players.map(() => {
        if (state.deck.length === 0) state.deck = shuffle(CARDS[state.difficulty].map(card => card.id), () => nextRandom(state));
        return { card: state.deck.pop(), set: state.die - 1 };
    });
    state.results = state.players.map(() => null);
    state.hints = state.players.map(() => 0);
    state.cpuTimes = state.players.map((p, seat) => (p.isCPU ? cpuFinishTime({ ...state, seat }) : null));
    log(state, `ラウンド ${state.round}：ダイスの目は ${state.die}`);
    if (state.mode === 'race' && state.players.every(p => p.isCPU)) resolveRound(state);
}

function log(state, text) {
    state.logs.push(text);
    if (state.logs.length > 300) state.logs.splice(0, state.logs.length - 300);
}

// ===== 時刻の進み =====

// 次に何かが起きる時刻（ラウンドの始まりからのミリ秒）：CPU が解く・時間切れ。なければ null
export function nextEventTime(state) {
    if (state.phase !== 'play' || state.mode !== 'race') return null;
    const pending = state.cpuTimes.filter((t, seat) => t !== null && state.results[seat] === null);
    return Math.min(state.timeLimit, ...pending);
}

// t までに解き終えた CPU の結果を書く
function finishCpus(state, t, events) {
    const due = state.cpuTimes
        .map((time, seat) => ({ time, seat }))
        .filter(({ time, seat }) => time !== null && time <= t && state.results[seat] === null)
        .sort((a, b) => a.time - b.time || a.seat - b.seat);
    for (const { time, seat } of due) {
        state.results[seat] = { solved: true, t: time, time };
        log(state, `${state.players[seat].name} が ${formatTime(time)} で解いた`);
        events.push({ type: 'solved', seat, time });
    }
}

// 人が全員、解いたかあきらめたら、残りの CPU は予定の時刻で結果を決めて、ラウンドを締める
function resolveIfHumansDone(state, events) {
    if (state.phase !== 'play') return;
    const humansDone = state.players.every((p, seat) => p.isCPU || state.results[seat] !== null);
    if (humansDone) resolveRound(state, events);
}

function resolveRound(state, events = []) {
    finishCpus(state, state.timeLimit ?? Infinity, events);
    state.results = state.results.map(result => result ?? { solved: false, reason: 'timeUp' });
    const order = state.results
        .map((result, seat) => ({ result, seat }))
        .filter(({ result }) => result.solved)
        .sort((a, b) => a.result.time - b.result.time || a.seat - b.seat)
        .map(({ seat }) => seat);
    state.history.push({ round: state.round, die: state.die, results: state.results.map(r => ({ ...r })), order, picks: [] });
    events.push({ type: 'roundEnd', order });
    if (order.length === 0) {
        log(state, '誰も解けなかった');
        nextRound(state, events);
        return;
    }
    state.phase = 'collect';
    state.collect = { order, index: 0 };
}

function nextRound(state, events) {
    if (state.round >= state.rounds) {
        state.phase = 'end';
        state.collect = null;
        events.push({ type: 'end' });
        const ranking = rankingOf(state);
        log(state, state.mode === 'solo'
            ? `タイムアタック終わり：合計 ${formatTime(state.soloTotal)}`
            : `終わり：${ranking.filter(r => r.rank === 1).map(r => state.players[r.seat].name).join('・')} の勝ち`);
        return;
    }
    startRound(state);
    events.push({ type: 'round', round: state.round });
}

// ===== 宝石 =====

export const pickerOf = (state) => (state.phase === 'collect' ? state.collect.order[state.collect.index] : null);
export const reachOf = (state) => (state.phase === 'collect' ? REACH[state.collect.index] ?? 0 : 0);

// 今の人が選べる列
export function reachableRows(state) {
    const seat = pickerOf(state);
    if (seat === null) return [];
    const reach = reachOf(state);
    const pawn = state.pawns[seat];
    const rows = [];
    for (let row = 0; row < GEM_ROWS; row++) if (Math.abs(row - pawn) <= reach) rows.push(row);
    const withGems = rows.filter(row => state.gemRows[row].length > 0);
    return withGems.length > 0 ? withGems : rows.filter(row => row === pawn);
}

// ===== 操作 =====

const ok = (events = []) => ({ ok: true, events });
const fail = (error) => ({ ok: false, error, events: [] });
const validTime = (t) => Number.isFinite(t) && t >= 0;

// seat：操作した人の席（時刻の進み tick・timeUp は null）
export function applyCommand(state, seat, command) {
    if (!command || typeof command !== 'object') return fail('操作の形が違います');
    if (state.phase === 'end') return fail('ゲームは終わっています');
    const own = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < state.players.length;
    switch (command.type) {
        case 'submit': {
            if (!own) return fail('席がありません');
            if (state.phase !== 'play') return fail('今は解く時間ではありません');
            if (state.results[seat] !== null) return fail('もう終えています');
            if (!validTime(command.t)) return fail('時刻がありません');
            if (state.mode === 'race' && command.t > state.timeLimit) return fail('時間切れです');
            const puzzle = puzzleOf(state, seat);
            if (!isSolution(puzzle.shape, puzzle.pieces, command.placements)) return fail('盤面が埋まっていません');
            const events = [];
            const t = Math.round(command.t);
            const time = t + state.hints[seat] * HINT_PENALTY_MS;
            if (state.mode === 'race') finishCpus(state, t, events);
            state.results[seat] = { solved: true, t, time };
            log(state, `${state.players[seat].name} が ${formatTime(time)} で解いた${state.hints[seat] ? `（ヒント${state.hints[seat]}回）` : ''}`);
            events.push({ type: 'solved', seat, time });
            if (state.mode === 'solo') finishSoloRound(state, time, events);
            else resolveIfHumansDone(state, events);
            return ok(events);
        }
        case 'giveUp': {
            if (!own) return fail('席がありません');
            if (state.phase !== 'play') return fail('今は解く時間ではありません');
            if (state.results[seat] !== null) return fail('もう終えています');
            if (!validTime(command.t)) return fail('時刻がありません');
            const events = [];
            if (state.mode === 'race') finishCpus(state, command.t, events);
            state.results[seat] = { solved: false, reason: 'giveUp' };
            if (state.mode === 'solo') {
                log(state, `問題を飛ばした（+${formatTime(SKIP_PENALTY_MS)}）`);
                finishSoloRound(state, Math.round(command.t) + state.hints[seat] * HINT_PENALTY_MS + SKIP_PENALTY_MS, events);
            } else {
                log(state, `${state.players[seat].name} はあきらめた`);
                resolveIfHumansDone(state, events);
            }
            return ok(events);
        }
        case 'hint': {
            if (!own) return fail('席がありません');
            if (state.phase !== 'play' || state.results[seat] !== null) return fail('今はヒントを使えません');
            state.hints[seat] += 1;
            return ok([{ type: 'hint', seat }]);
        }
        case 'tick': {
            if (state.mode !== 'race' || state.phase !== 'play') return fail('今は進める時間ではありません');
            if (!validTime(command.t)) return fail('時刻がありません');
            const events = [];
            finishCpus(state, command.t, events);
            if (command.t >= state.timeLimit) resolveRound(state, events);
            return ok(events);
        }
        case 'timeUp': {
            if (state.mode !== 'race' || state.phase !== 'play') return fail('今は時間切れにできません');
            const events = [];
            log(state, '時間切れ');
            resolveRound(state, events);
            return ok(events);
        }
        case 'pick': {
            if (!own) return fail('席がありません');
            if (state.phase !== 'collect') return fail('今は宝石を取る時間ではありません');
            if (pickerOf(state) !== seat) return fail('宝石を取る番ではありません');
            if (!reachableRows(state).includes(command.row)) return fail('その列には動けません');
            const events = [];
            const row = command.row;
            const gems = state.gemRows[row].splice(0, GEMS_PER_TAKE);
            gems.forEach(color => { state.gems[seat][color] += 1; });
            state.pawns[seat] = row;
            state.history[state.history.length - 1].picks.push({ seat, row, gems });
            log(state, `${state.players[seat].name} が ${row + 1}列目で ${gems.map(c => COLOR_NAMES[c]).join('・') || '宝石なし'} を取った`);
            events.push({ type: 'pick', seat, row, gems });
            state.collect.index += 1;
            if (state.collect.index >= state.collect.order.length) nextRound(state, events);
            return ok(events);
        }
        default:
            return fail('知らない操作です');
    }
}

function finishSoloRound(state, time, events) {
    state.soloTotal += time;
    state.history.push({ round: state.round, die: state.die, results: state.results.map(r => ({ ...r, time })), order: [], picks: [] });
    events.push({ type: 'roundEnd', order: [0] });
    nextRound(state, events);
}

// オンラインで抜けた人の席を CPU にする（その時刻 t より後に解くことにする）
export function takeOver(state, seat, t = 0) {
    state.players[seat].isCPU = true;
    const events = [];
    if (state.phase === 'play' && state.results[seat] === null) {
        const planned = cpuFinishTime({ ...state, seat });
        state.cpuTimes[seat] = planned === null ? null : Math.max(planned, Math.round(t) + 3000);
        if (state.cpuTimes[seat] !== null && state.cpuTimes[seat] > state.timeLimit) state.cpuTimes[seat] = null;
        resolveIfHumansDone(state, events);
    }
    log(state, `${state.players[seat].name} の席は CPU が続ける`);
    return events;
}

// ===== 結果 =====

// 宝石の数を多い色から並べたもの（同じなら次の色で比べる）
export const sortedCounts = (gems) => GEM_COLORS.map(c => gems[c]).sort((a, b) => b - a);
export const totalGems = (gems) => GEM_COLORS.reduce((sum, c) => sum + gems[c], 0);

function compareGems(a, b) {
    const x = sortedCounts(a);
    const y = sortedCounts(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
}

// 順位の一覧 [{ seat, rank }]（同じ順位がありうる）
export function rankingOf(state) {
    if (state.mode === 'solo') return [{ seat: 0, rank: 1, total: state.soloTotal }];
    const seats = state.players.map((_, seat) => seat).sort((a, b) => compareGems(state.gems[a], state.gems[b]) || a - b);
    const ranking = [];
    seats.forEach((seat, i) => {
        const same = i > 0 && compareGems(state.gems[seats[i - 1]], state.gems[seat]) === 0;
        ranking.push({ seat, rank: same ? ranking[i - 1].rank : i + 1, best: sortedCounts(state.gems[seat])[0] });
    });
    return ranking;
}

export const isOver = (state) => state.phase === 'end';

export function formatTime(ms) {
    const s = Math.max(0, ms) / 1000;
    if (s < 60) return `${s.toFixed(1)}秒`;
    const m = Math.floor(s / 60);
    return `${m}分${(s - m * 60).toFixed(1).padStart(4, '0')}秒`;
}

// ===== ビュー（その人に見せてよいものだけ。シード・乱数・山札・CPU の予定の時刻は入れない） =====

export function viewFor(state, seat = null) {
    const pending = nextEventTime(state);
    return {
        mode: state.mode,
        difficulty: state.difficulty,
        timeLimit: state.timeLimit,
        level: state.level,
        rounds: state.rounds,
        round: state.round,
        phase: state.phase,
        die: state.die,
        you: seat,
        players: state.players.map((p, i) => ({
            name: p.name,
            isCPU: p.isCPU,
            result: state.results[i],
            hints: state.hints[i],
            gems: state.gems[i],
            gemTotal: totalGems(state.gems[i]),
            pawn: state.pawns[i] ?? null
        })),
        puzzle: seat === null ? null : puzzleOf(state, seat),
        pieceCount: state.difficulty,
        gemRows: state.gemRows.map(row => row.slice()),
        collect: state.collect ? { order: state.collect.order.slice(), index: state.collect.index, picker: pickerOf(state), reach: reachOf(state), rows: reachableRows(state) } : null,
        history: state.history.map(h => ({ ...h, results: h.results.map(r => ({ ...r })), picks: h.picks.map(p => ({ ...p, gems: p.gems.slice() })) })),
        logs: state.logs.slice(),
        soloTotal: state.soloTotal,
        ranking: state.phase === 'end' ? rankingOf(state) : null,
        startAt: state.startAt,
        pickAt: state.pickAt,
        nextEventIn: pending
    };
}

// ===== 記録からの再現 =====

// commands: [{ seat, command }]。断られた操作があれば投げる
export function replay(options, commands) {
    const state = createGame(options);
    commands.forEach(({ seat, command }, i) => {
        const result = applyCommand(state, seat, command);
        if (!result.ok) throw new Error(`記録の ${i + 1} 番目の操作を再現できません：${result.error}`);
    });
    return state;
}

// 盤面の大きさ（描画用）
export const shapeSize = (shape) => ({ w: shape[0].length, h: shape.length });
export const areaOf = (pieces) => pieces.reduce((sum, id) => sum + pieceSize(id), 0);
