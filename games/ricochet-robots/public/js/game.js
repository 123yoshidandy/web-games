/**
 * リコシェロボット（Ricochet Robots）のゲーム本体（DOM に依存しない。画面・サーバー・テストで同じものを使う）
 *
 * 早解き（race）：目標を1つずつめくり、全員が同時に「何手で着けるか」を考える
 * - 誰かが手数を宣言すると、砂時計（60秒）が動き出す。ほかの人は、時間内ならもっと少ない手数を宣言できる（自分の前の宣言より少なくだけ）
 * - 時間切れ（か全員がパス）で、少ない手数を宣言した人から実演する（同じ手数なら先に宣言した人）。宣言した手数以内で、
 *   目標の色のロボット（渦はどのロボットでも）を目標のマスに止めれば、目標のチップを得る。ロボットはそのまま残る
 * - 実演に失敗したら、ロボットを戻して次の人。全員が失敗したら、誰も得ない
 * - 誰も宣言しないまま時間（3分）が過ぎるか、全員がパスしたら、その目標は流す
 * 1人の練習（solo）：自分でロボットを動かして目標に着ける。最短の手数と比べて点にする（最短 3点、1手多いと 2点…、ヒント1回で -1点）
 *
 * 時間：操作にはすべて時刻（at）が付く（ローカルは止められる時計、オンラインはサーバーの時計）。ロジックは操作の時刻だけを見る
 * - 時刻はさかのぼらない（前の操作より前の時刻は、前の操作の時刻とみなす）。次の目標を見せる前に届いた宣言は、見せた時刻とみなす
 * - 時間切れは、時刻の付いた操作（timeout、席なし）で進める。CPU の宣言も、計画した時刻の付いた操作として入る
 * すべての操作は applyCommand を通し、受け付けた操作だけを記録する（Game.replay で同じ局面になる）。断る操作は状態を変えない
 */

import { generateBoard, placeRobots, slide, applyMoves, reached, isMoveList, targetInfo, TARGET_COUNT, ROBOT_NAMES, DIR_ARROWS } from './board.js';
import { createRandom, shuffle } from './random.js';
import { solve } from './solver.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const MODES = ['solo', 'race'];
export const TARGET_OPTIONS = [5, 9, 17];
export const DEFAULT_TARGETS = 9;
export const MAX_BID = 20;
export const START_DELAY_MS = 3000;   // 最初の目標を見せるまで
export const COUNTDOWN_MS = 60000;    // 最初の宣言からの砂時計
export const SEARCH_LIMIT_MS = 180000; // 誰も宣言しないとき、目標を流すまで
export const DEMO_LIMIT_MS = 60000;   // 実演の持ち時間
export const RESULT_MS = 5000;        // 結果を見せてから次の目標を見せるまで（早解き）
export const HINT_KINDS = ['first', 'count']; // 最初の1手・最短の手数
export const SOLO_BEST_POINTS = 3;

const COMMAND_TYPES = {
    race: ['declare', 'pass', 'demo', 'hint', 'timeout'],
    solo: ['move', 'undo', 'reset', 'giveup', 'hint', 'next']
};

const secondsText = ms => `${(Math.max(0, ms) / 1000).toFixed(1)}秒`;

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, mode, targets, silver, level, startAt }
    constructor(players, options = {}) {
        // level は席ごとの CPU の強さ（CPU 同士の対戦で使う。なければ options.level）
        this.players = players.map((player, seat) => ({ seat, name: String(player.name ?? `P${seat + 1}`), isCPU: Boolean(player.isCPU), ...(player.level ? { level: player.level } : {}) }));
        const mode = MODES.includes(options.mode) ? options.mode : 'race';
        this.options = {
            seed: options.seed >>> 0,
            mode,
            targets: TARGET_OPTIONS.includes(options.targets) ? options.targets : DEFAULT_TARGETS,
            silver: Boolean(options.silver),
            level: options.level ?? 'normal',
            startAt: Number.isFinite(options.startAt) ? options.startAt : 0
        };
        this.mode = mode;
        const random = createRandom(this.options.seed);
        this.board = generateBoard(random);
        this.robots = placeRobots(random, this.options.silver ? 5 : 4, this.board.targets);
        this.deck = shuffle([...Array(TARGET_COUNT).keys()], random); // 目標をめくる順（隠す情報）
        this.targetTotal = Math.min(this.options.targets, TARGET_COUNT);
        this.chips = this.players.map(() => []);
        this.penalties = this.players.map(() => 0);
        this.rounds = [];         // 終わった目標
        this.round = null;
        this.clock = this.options.startAt;
        this.phase = 'playing';
        this.commands = [];
        this.logs = [];
        this.lastError = null;
        this.revealNext(this.options.startAt + START_DELAY_MS);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    isOver() {
        return this.phase === 'end';
    }

    targetCell(id) {
        return this.board.targets.find(target => target.id === id).cell;
    }

    log(at, text) {
        this.logs.push({ n: this.logs.length, at: at - this.options.startAt, text });
    }

    nameOf(seat) {
        return this.players[seat]?.name ?? '';
    }

    // ===== 目標をめくる =====

    revealNext(at) {
        if (this.rounds.length >= this.targetTotal) return this.finish(at);
        // ロボットがもう目標に乗っている目標は飛ばす（手数が 0 になるため）
        const index = this.deck.findIndex(id => !reached(id, this.targetCell(id), this.robots));
        if (index < 0) return this.finish(at);
        const [target] = this.deck.splice(index, 1);
        const cell = this.targetCell(target);
        const solo = this.mode === 'solo';
        this.round = {
            number: this.rounds.length + 1,
            target,
            cell,
            revealAt: at,
            phase: solo ? 'solve' : 'search',
            deadline: solo ? null : at + SEARCH_LIMIT_MS,
            bids: [],                                   // [{ seat, count, at }]
            done: this.players.map(() => false),        // もう宣言しない（パス）
            queue: [],                                  // 実演の順番
            demo: null,                                 // { seat, count, startAt, deadline }
            attempts: [],                               // [{ seat, count, moves, success, timeout? }]
            hints: this.players.map(() => []),
            startRobots: [...this.robots],
            moves: [],                                  // 1人の練習で動かした手
            optimum: solo ? (solve(this.board.walls, this.robots, target, cell)?.count ?? null) : null,
            winner: null,
            endAt: null
        };
        this.log(at, `目標 ${this.round.number}：${targetInfo(target).name}`);
    }

    finish(at) {
        this.phase = 'end';
        this.round = this.round?.phase === 'done' || this.round?.phase === 'result' ? this.round : null;
        this.log(at, 'ゲーム終了');
    }

    // ===== 操作 =====

    fail(message) {
        this.lastError = message;
        return false;
    }

    // seat：操作した席（時間切れは null）、command：{ type, at, ... }
    applyCommand(seat, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object') return this.fail('操作の形が正しくありません');
        if (!COMMAND_TYPES[this.mode].includes(command.type)) return this.fail('この遊び方ではできない操作です');
        if (!Number.isFinite(command.at)) return this.fail('時刻がありません');
        const system = command.type === 'timeout';
        if (system ? seat !== null : !(Number.isInteger(seat) && seat >= 0 && seat < this.players.length)) return this.fail('席が正しくありません');
        const at = Math.max(command.at, this.clock, this.round?.revealAt ?? 0);
        const handler = {
            declare: () => this.declare(seat, command, at),
            pass: () => this.pass(seat, at),
            demo: () => this.demonstrate(seat, command, at),
            timeout: () => this.timeout(at),
            hint: () => this.useHint(seat, command, at),
            move: () => this.soloMove(command, at),
            undo: () => this.soloUndo(),
            reset: () => this.soloReset(),
            giveup: () => this.soloGiveUp(at),
            next: () => this.soloNext(at)
        }[command.type];
        // 判定はすべて状態を変えずに行い、受け付けると決まってから変える（handler は、だめなら変えずに false を返す）
        if (!handler()) return false;
        this.clock = at;
        this.commands.push({ seat, command: { ...command } });
        return true;
    }

    // ===== 早解き =====

    bestBidOf(seat) {
        let best = null;
        for (const bid of this.round.bids) if (bid.seat === seat && (best === null || bid.count < best.count)) best = bid;
        return best;
    }

    lowestBid() {
        let best = null;
        for (const bid of this.round.bids) if (best === null || bid.count < best.count) best = bid;
        return best;
    }

    declare(seat, { count, final }, at) {
        const round = this.round;
        if (!['search', 'countdown'].includes(round?.phase)) return this.fail('今は宣言できません');
        if (round.done[seat]) return this.fail('この目標の宣言は終えています');
        if (!Number.isInteger(count) || count < 1 || count > MAX_BID) return this.fail(`手数は1〜${MAX_BID}で宣言してください`);
        const own = this.bestBidOf(seat);
        if (own && count >= own.count) return this.fail(`前の宣言（${own.count}手）より少ない手数にしてください`);
        round.bids.push({ seat, count, at });
        if (final) round.done[seat] = true;
        const elapsed = secondsText(at - round.revealAt);
        if (round.phase === 'search') {
            round.phase = 'countdown';
            round.deadline = at + COUNTDOWN_MS;
            this.log(at, `${elapsed} ${this.nameOf(seat)}：${count}手（砂時計スタート）`);
        } else {
            this.log(at, `${elapsed} ${this.nameOf(seat)}：${count}手`);
        }
        this.checkAllDone(at);
        return true;
    }

    pass(seat, at) {
        const round = this.round;
        if (!['search', 'countdown'].includes(round?.phase)) return this.fail('今はパスできません');
        if (round.done[seat]) return this.fail('もうパスしています');
        round.done[seat] = true;
        this.checkAllDone(at);
        return true;
    }

    checkAllDone(at) {
        const round = this.round;
        if (!round.done.every(Boolean)) return;
        if (round.bids.length) this.startDemo(at);
        else this.skipRound(at, '全員がパスしたので、この目標は流します');
    }

    timeout(at) {
        const round = this.round;
        if (round?.phase === 'search' && at >= round.deadline) {
            this.skipRound(at, '誰も宣言しなかったので、この目標は流します');
            return true;
        }
        if (round?.phase === 'countdown' && at >= round.deadline) {
            this.log(at, '時間切れ');
            this.startDemo(at);
            return true;
        }
        if (round?.phase === 'demo' && at >= round.demo.deadline) {
            const { seat, count } = round.demo;
            round.attempts.push({ seat, count, moves: [], success: false, timeout: true });
            this.log(at, `${this.nameOf(seat)}：実演の時間切れ`);
            this.nextDemo(at);
            return true;
        }
        return this.fail('まだ時間はあります');
    }

    // 実演の順番：各人のいちばん少ない宣言で、手数の少ない順（同じなら先に宣言した順。時刻が同じなら記録の順）
    startDemo(at) {
        const round = this.round;
        const best = this.players.map(player => this.bestBidOf(player.seat)).filter(Boolean);
        best.sort((a, b) => a.count - b.count || a.at - b.at || round.bids.indexOf(a) - round.bids.indexOf(b));
        round.queue = best.map(bid => ({ seat: bid.seat, count: bid.count }));
        round.phase = 'demo';
        round.deadline = null;
        this.nextDemo(at);
    }

    nextDemo(at) {
        const round = this.round;
        const next = round.queue.shift();
        if (!next) {
            round.demo = null;
            this.log(at, '誰も実演できなかったので、チップはなし');
            return this.endRound(at, null);
        }
        round.demo = { seat: next.seat, count: next.count, startAt: at, deadline: at + DEMO_LIMIT_MS };
    }

    demonstrate(seat, { moves }, at) {
        const round = this.round;
        if (round?.phase !== 'demo') return this.fail('今は実演できません');
        if (round.demo.seat !== seat) return this.fail('実演するのはほかの人です');
        if (!isMoveList(moves, this.robots.length, MAX_BID)) return this.fail('手順の形が正しくありません');
        const { count } = round.demo;
        const result = applyMoves(this.board.walls, this.robots, moves);
        const success = moves.length >= 1 && moves.length <= count && reached(round.target, round.cell, result.robots);
        round.attempts.push({ seat, count, moves: moves.map(move => [...move]), success });
        if (success) {
            this.robots = result.robots;
            this.chips[seat].push(round.target);
            this.log(at, `${this.nameOf(seat)}：${moves.length}手で成功（${moves.map(([r, d]) => ROBOT_NAMES[r] + DIR_ARROWS[d]).join(' ')}）`);
            this.endRound(at, seat);
        } else {
            this.log(at, moves.length ? `${this.nameOf(seat)}：実演に失敗（${count}手以内で着かない）` : `${this.nameOf(seat)}：実演をあきらめた`);
            this.nextDemo(at);
        }
        return true;
    }

    skipRound(at, message) {
        this.log(at, message);
        this.endRound(at, null);
    }

    endRound(at, winner) {
        const round = this.round;
        round.phase = 'done';
        round.winner = winner;
        round.endAt = at;
        round.demo = null;
        round.deadline = null;
        this.rounds.push(round);
        this.revealNext(at + RESULT_MS);
    }

    // ===== ヒント（最初の1手か、最短の手数。1つの目標で種類ごとに1回、1点引く） =====

    useHint(seat, { kind }, at) {
        const round = this.round;
        if (!HINT_KINDS.includes(kind)) return this.fail('ヒントの種類が正しくありません');
        const open = this.mode === 'solo' ? round?.phase === 'solve' : ['search', 'countdown'].includes(round?.phase) && !round.done[seat];
        if (!open) return this.fail('今はヒントを使えません');
        if (round.hints[seat].includes(kind)) return this.fail('このヒントはもう使っています');
        round.hints[seat].push(kind);
        if (this.mode === 'race') this.penalties[seat] += 1;
        this.log(at, `${this.nameOf(seat)}：ヒント（${kind === 'first' ? '最初の1手' : '最短の手数'}）-1点`);
        return true;
    }

    // ===== 1人の練習 =====

    soloMove({ robot, dir }, at) {
        const round = this.round;
        if (round?.phase !== 'solve') return this.fail('今は動かせません');
        if (!isMoveList([[robot, dir]], this.robots.length, 1)) return this.fail('動かし方が正しくありません');
        if (round.moves.length >= 60) return this.fail('手数が多すぎます。「最初から」でやり直してください');
        const to = slide(this.board.walls, this.robots, robot, dir);
        if (to === this.robots[robot]) return this.fail('その向きには動けません');
        this.robots[robot] = to;
        round.moves.push([robot, dir]);
        if (reached(round.target, round.cell, this.robots)) this.soloFinish(at, true);
        return true;
    }

    soloUndo() {
        const round = this.round;
        if (round?.phase !== 'solve' || !round.moves.length) return this.fail('戻す手がありません');
        round.moves.pop();
        this.robots = applyMoves(this.board.walls, round.startRobots, round.moves).robots;
        return true;
    }

    soloReset() {
        const round = this.round;
        if (round?.phase !== 'solve' || !round.moves.length) return this.fail('まだ動かしていません');
        round.moves = [];
        this.robots = [...round.startRobots];
        return true;
    }

    soloGiveUp(at) {
        const round = this.round;
        if (round?.phase !== 'solve') return this.fail('今はあきらめられません');
        round.moves = [];
        this.robots = [...round.startRobots];
        this.soloFinish(at, false);
        return true;
    }

    soloFinish(at, solved) {
        const round = this.round;
        round.phase = 'result';
        round.endAt = at;
        round.solved = solved;
        round.time = at - round.revealAt;
        const hints = round.hints[0].length;
        let points = 0;
        if (solved) {
            const extra = round.optimum === null ? 1 : round.moves.length - round.optimum;
            points = Math.max(0, SOLO_BEST_POINTS - Math.max(0, extra) - hints);
        }
        round.points = points;
        this.rounds.push(round);
        this.log(at, solved
            ? `${round.moves.length}手で到着（最短 ${round.optimum ?? '?'}手）${secondsText(round.time)} +${points}点`
            : `あきらめた（最短 ${round.optimum ?? '?'}手）`);
        if (this.rounds.length >= this.targetTotal) this.finish(at);
    }

    soloNext(at) {
        if (this.round?.phase !== 'result') return this.fail('まだ次へ進めません');
        this.revealNext(at);
        return true;
    }

    // ===== 結果 =====

    // 早解き：チップの数からヒントの数を引いた点で順位。1人の練習：点の合計とタイム
    result() {
        if (this.mode === 'solo') {
            const points = this.rounds.reduce((sum, round) => sum + round.points, 0);
            const time = this.rounds.reduce((sum, round) => sum + round.time, 0);
            const optimal = this.rounds.filter(round => round.solved && round.optimum !== null && round.moves.length === round.optimum).length;
            return { points, time, optimal, max: this.targetTotal * SOLO_BEST_POINTS, rounds: this.rounds.length };
        }
        const scores = this.players.map(player => this.chips[player.seat].length - this.penalties[player.seat]);
        const order = this.players.map(player => player.seat).sort((a, b) => scores[b] - scores[a] || a - b);
        const top = Math.max(...scores);
        const standings = order.map(seat => ({
            seat,
            score: scores[seat],
            chips: this.chips[seat].length,
            penalty: this.penalties[seat],
            rank: 1 + scores.filter(score => score > scores[seat]).length
        }));
        return { standings, winners: order.filter(seat => scores[seat] === top) };
    }
}
