/**
 * 五目並べ（2人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる
 *
 * ルール（自由ルール）
 * - 黒と白が交互に、線の交点に石を1つずつ置く。黒が先。置いた石は動かさず、取りもない
 * - 縦・横・斜めのどれかに、自分の石を5つ以上並べたら勝ち（長連も勝ち。禁じ手はない）
 * - 盤が埋まったら引き分け。投了もできる
 * - どちらの席が黒か（options.black）は、決めていなければシード（options.seed）で決める。シードはこれにしか使わない
 *
 * 操作（applyCommand）
 * - move { sq }：手番の人が石を置く
 * - resign：投了（手番でなくてもよい）
 *
 * 持ち時間（options.clock。clock.js）
 * - 時計が進むのは手番の人だけ。操作のたびに、かかった時間（ミリ秒）を記録に残す
 * - 時間切れは記録の { type: 'timeout' }（端末からは送れない）。相手の勝ち
 * - 時刻は持たない。手番が始まった時刻（turnStartedAt）は、コントローラーとサーバーが外から入れる
 */

import { BLACK, WHITE, EMPTY, SIZES, COLOR_NAME, createBoard, winningLine, isFull, sqName } from './rules.js';
import { createRandom } from './random.js';
import { normalizeClock, createClockSides, limitOf, spend } from './clock.js';

export const PLAYERS = 2;
const MAX_LOGS = 400;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = { move: ['sq'], resign: [] };

export const DEFAULT_OPTIONS = { size: 15 };

// 持ち時間の選び方（タイトル画面とロビー。この順に並べる。名前を '3' のような数字だけにすると、オブジェクトの中で 'none' より前に並んでしまう）
// 切れ負けと、フィッシャー（1手ごとに秒を足す）
export const CLOCK_PRESETS = {
    none: { label: 'なし', clock: null },
    '3m': { label: '3分', clock: { main: 180000 } },
    '5m': { label: '5分', clock: { main: 300000 } },
    '10m': { label: '10分', clock: { main: 600000 } },
    '3m+2s': { label: '3分+2秒', clock: { main: 180000, increment: 2000 } },
    '5m+5s': { label: '5分+5秒', clock: { main: 300000, increment: 5000 } }
};
export const clockOption = (key) => (Object.hasOwn(CLOCK_PRESETS, key) ? CLOCK_PRESETS[key].clock : null);

// シードから、黒の席を決める（同じシードなら同じ席）
export const blackSeatOf = (seed) => (createRandom(seed)() < 0.5 ? 0 : 1);

// オプションを確かめてそろえる（変な値は断る）。持ち時間（clock）は、あるときだけ入れる
export function normalizeOptions(options = {}) {
    const size = options.size ?? DEFAULT_OPTIONS.size;
    if (!SIZES.includes(size)) throw new Error('盤の大きさが正しくありません');
    const seed = options.seed ?? 0;
    if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32) throw new Error('シードが正しくありません');
    const black = options.black ?? blackSeatOf(seed);
    if (black !== 0 && black !== 1) throw new Error('黒の席が正しくありません');
    const clock = normalizeClock(options.clock);
    return clock ? { size, seed, black, clock } : { size, seed, black };
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]。options: { size, seed, black（黒の席。なければシードで決める）, clock（なければ時計なし） }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        this.options = normalizeOptions(options);
        this.clockConfig = this.options.clock ? { ...this.options.clock } : null;
        this.clock = this.clockConfig ? createClockSides(this.clockConfig) : null;
        this.turnStartedAt = null;  // 手番が始まった時刻（コントローラーとサーバーが入れる。記録には入れない）
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        this.size = this.options.size;
        this.blackSeat = this.options.black;
        this.board = createBoard(this.size);
        this.current = this.blackSeat;
        this.moveNumber = 0;
        this.phase = 'play';                                // play → end
        this.lastMove = null;                               // { seat, sq }
        this.result = null;                                 // { winner（席。引き分けは null）, color（勝った色）, reason: 'five' | 'resign' | 'timeout' | 'draw', line（五連の石） }
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    colorOf(seat) {
        return seat === this.blackSeat ? BLACK : WHITE;
    }

    seatOf(color) {
        return color === BLACK ? this.blackSeat : 1 - this.blackSeat;
    }

    isOver() {
        return this.phase === 'end';
    }

    get winner() {
        return this.result ? this.result.winner : null;
    }

    actors() {
        return this.phase === 'play' ? [this.current] : [];
    }

    moves() {
        if (this.isOver()) return [];
        const list = [];
        this.board.forEach((c, sq) => { if (c === EMPTY) list.push(sq); });
        return list;
    }

    // ---- 持ち時間 ----

    // 時計が進んでいる席（時計なし・終わったあとは null）
    clockSeat() {
        if (!this.clock || this.phase !== 'play') return null;
        return this.current;
    }

    // 手番を始めてから、時間切れになるまでの時間（時計が進んでいなければ null）
    clockLimit() {
        const seat = this.clockSeat();
        return seat === null ? null : limitOf(this.clockConfig, this.clock[seat]);
    }

    // 手番を始めて elapsed ミリ秒たったら、時間切れか
    isFlagged(elapsed) {
        const limit = this.clockLimit();
        return limit !== null && elapsed >= limit;
    }

    // 時間切れで終える（相手の勝ち）。seat は時計が進んでいる席
    timeout(seat, elapsed) {
        this.lastError = null;
        if (seat !== this.clockSeat()) return this.fail('時間切れにできません');
        const ms = Math.max(0, Math.round(elapsed) || 0);
        if (ms < this.clockLimit()) return this.fail('まだ時間があります');
        const winner = 1 - seat;
        this.clock[seat] = { main: 0, periods: 0 };
        this.commands.push({ playerId: seat, command: { type: 'timeout' }, ms });
        this.end({ winner, reason: 'timeout', line: null });
        this.log(`${this.players[seat].name}：時間切れ。${resultText(this)}`);
        return true;
    }

    // 操作を受け付ける。elapsed：時計が進んでいる席が、この手番にかけた時間（ミリ秒。時計なしなら見ない）
    // 時間を使い切っていたら断る（呼ぶ側が先に timeout で終える）
    applyCommand(playerId, command, elapsed = 0) {
        const seat = this.clockSeat();
        const ms = Math.max(0, Math.round(elapsed) || 0);
        if (seat !== null && ms >= this.clockLimit()) return this.fail('時間切れです');
        const count = this.commands.length;
        const ok = this.applyAction(playerId, command);
        if (ok && this.clock && this.commands.length > count) {
            // フィッシャーの加算は、石を置いたときだけ
            this.commands.at(-1).ms = ms;
            if (seat !== null) this.clock[seat] = spend(this.clockConfig, this.clock[seat], ms, { increment: command.type === 'move' }).side;
        }
        return ok;
    }

    applyAction(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('対局は終わっています');
        if (playerId !== 0 && playerId !== 1) return this.fail('席が正しくありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (command.type === 'resign') {
            this.commands.push({ playerId, command: { type: 'resign' } });
            this.end({ winner: 1 - playerId, reason: 'resign', line: null });
            this.log(`${this.players[playerId].name}：投了。${resultText(this)}`);
            return true;
        }
        if (playerId !== this.current) return this.fail('今はあなたの番ではありません');
        const { sq } = command;
        if (!Number.isInteger(sq) || sq < 0 || sq >= this.size * this.size) return this.fail('点が正しくありません');
        if (this.board[sq] !== EMPTY) return this.fail('そこには石があります');
        this.play(playerId, sq);
        this.commands.push({ playerId, command: { type: 'move', sq } });
        return true;
    }

    play(seat, sq) {
        const color = this.colorOf(seat);
        this.board[sq] = color;
        this.moveNumber++;
        this.lastMove = { seat, sq };
        this.current = 1 - seat;
        this.log(`${this.moveNumber}. ${COLOR_NAME[color]}：${sqName(sq, this.size)}`);
        this.pushEvent({ type: 'move', seat, sq });
        const line = winningLine(this.board, this.size, sq);
        if (line) {
            this.end({ winner: seat, reason: 'five', line });
            this.log(`五つ並びました。${resultText(this)}`);
        } else if (isFull(this.board)) {
            this.end({ winner: null, reason: 'draw', line: null });
            this.log('盤が埋まりました。引き分け');
        }
    }

    end(result) {
        this.phase = 'end';
        this.result = { ...result, color: result.winner === null ? null : this.colorOf(result.winner) };
        this.pushEvent({ type: 'end', winner: result.winner, reason: result.reason });
    }

    // ---- 記録 ----

    log(text) {
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    pushEvent(event) {
        this.events.push({ ...event, seq: ++this.eventSeq });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    // 記録から再現する。ms（かかった時間）のない記録は 0 として読む
    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command, ms = 0 }, index) => {
            const ok = command?.type === 'timeout' ? game.timeout(playerId, ms) : game.applyCommand(playerId, command, ms);
            if (!ok) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}

// 「黒の勝ち（五連）」「白の投了勝ち」「黒の時間切れ勝ち」「引き分け」
export function resultText(game) {
    const r = game.result;
    if (!r) return '';
    if (r.winner === null) return '引き分け';
    const color = COLOR_NAME[r.color];
    if (r.reason === 'resign') return `${color}の勝ち（投了）`;
    if (r.reason === 'timeout') return `${color}の勝ち（時間切れ）`;
    return `${color}の勝ち（五連）`;
}

export { BLACK, WHITE };
