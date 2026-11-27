/**
 * 将棋（本将棋・平手）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（乱数は使わない）
 *
 * ルール（日本将棋連盟の対局規定に合わせる）
 * - 席0が先手（▲、盤の下）、席1が後手（△）。先手から交互に1手ずつ指す
 * - 成り（敵陣に入る・敵陣の中で動く・敵陣から出るとき。行き所のなくなる駒は必ず成る）、持ち駒を打つ
 * - 禁じ手：二歩、打ち歩詰め、行き所のない駒、王手の放置。指せない手は受け付けない（反則負けにはしない）
 * - 詰み：手番の側に指せる手がなければ負け
 * - 千日手：同じ局面（盤・持ち駒・手番）が4回現れたら終わり。連続王手の千日手は、王手をかけ続けた側の負け
 * - 投了：どちらの席からでもできる
 *
 * ルールと違う点・画面の都合で決めた点（README にも書く）
 * - 千日手（連続王手でないもの）は、指し直しではなく引き分けで終わる
 * - 入玉宣言・持将棋は入れていない。手数の上限も設けない
 *
 * 持ち時間（options.clock。clock.js）
 * - 時計が進むのは手番の側。指すたびに、その手にかかった時間（ミリ秒）を記録に残す。秒読みは1手ごとに数え直す
 * - 時間切れは記録の { type: 'timeout' }（端末からは送れない）。時間切れの側の負け
 * - 時刻は持たない。手番が始まった時刻（turnStartedAt）は、コントローラーとサーバーが外から入れる
 */

import { Position, SENTE, makeMove, makeDrop, moveFrom, moveTo, isDrop, dropType, isPromote, typeOf } from './rules.js';
import { moveText, SIDE_NAME } from './notation.js';
import { normalizeClock, createClockSides, limitOf, spend } from './clock.js';

export const PLAYERS = 2;
export const REPETITION = 4;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = { move: ['from', 'to', 'promote'], drop: ['piece', 'to'], resign: [] };

// 持ち時間の選び方（タイトル画面とロビー）。切れ負けと、持ち時間を使い切ったあとの秒読み
// 書いた順に画面に並べる。名前は数字だけにしない（数字だけの名前は、オブジェクトの中で先に並んでしまう）
export const CLOCK_PRESETS = {
    none: { label: 'なし', clock: null },
    '3m': { label: '3分', clock: { main: 180000 } },
    '5m': { label: '5分', clock: { main: 300000 } },
    '10m': { label: '10分', clock: { main: 600000 } },
    '3m+10s': { label: '3分+10秒', clock: { main: 180000, byoyomi: 10000, periods: 1 } },
    '10m+30s': { label: '10分+30秒', clock: { main: 600000, byoyomi: 30000, periods: 1 } }
};
export const clockOption = (key) => (Object.hasOwn(CLOCK_PRESETS, key) ? CLOCK_PRESETS[key].clock : null);

const sideToMove = (sfen) => (sfen.split(' ')[1] === 'w' ? 1 : 0);

// 千日手の勝ち負け（勝った席。引き分けは null）
// history：最初と各手のあとの局面（SFEN）、checks：各手が王手だったか、key：4回目に現れた局面
// 最初に同じ局面が現れてから今までの手で、片方が王手をかけ続けていたら、その側の負け
export function repetitionWinner(history, checks, key) {
    const first = history.indexOf(key);
    const continuous = (side) => {
        let any = false;
        for (let i = first; i < checks.length; i++) {
            // i 手目（0 から数える）を指したのは、その前の局面の手番の側
            if (sideToMove(history[i]) !== side) continue;
            if (!checks[i]) return false;
            any = true;
        }
        return any;
    };
    if (continuous(SENTE)) return 1;
    if (continuous(1)) return 0;
    return null;
}

const isSquare = (sq) => Number.isInteger(sq) && sq >= 0 && sq < 81;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]（席0：先手、席1：後手）
    // options.clock：持ち時間の設定（clock.js。なければ時計なし）
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        const { clock, ...rest } = options;
        this.clockConfig = normalizeClock(clock);
        this.options = this.clockConfig ? { ...rest, clock: { ...this.clockConfig } } : rest;
        this.clock = this.clockConfig ? createClockSides(this.clockConfig) : null;
        this.turnStartedAt = null;  // 手番が始まった時刻（コントローラーとサーバーが入れる。記録には入れない）
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? SIDE_NAME[id]), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        this.pos = Position.initial();
        this.ply = 0;
        this.phase = 'play';
        this.winner = null;         // 勝った席（引き分けは null）
        this.reason = null;         // 終わった理由：checkmate・resign・repetition・perpetual-check・timeout
        this.lastMove = null;       // { seat, from, to, drop, promote }
        this.history = [this.pos.toSfen()];   // 各手のあとの局面（千日手の判定に使う）
        this.checks = [];           // 各手が王手だったか
        this.commands = [];
        this.logs = [];             // 棋譜（「▲7六歩」など）
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    get current() {
        return this.pos.side;
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    legalMoves() {
        return this.isOver() ? [] : this.pos.legalMoves();
    }

    inCheck() {
        return this.pos.inCheck();
    }

    // ---- 持ち時間 ----

    // 時計が進んでいる席（時計なし・終わったあとは null）
    clockSeat() {
        if (!this.clock || this.isOver()) return null;
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

    // 時間切れで終える。seat は時計が進んでいる席
    timeout(seat, elapsed) {
        this.lastError = null;
        if (seat !== this.clockSeat()) return this.fail('時間切れにできません');
        const ms = Math.max(0, Math.round(elapsed) || 0);
        if (ms < this.clockLimit()) return this.fail('まだ時間があります');
        this.clock[seat] = { main: 0, periods: 0 };
        this.commands.push({ playerId: seat, command: { type: 'timeout' }, ms });
        this.finish(1 - seat, 'timeout', seat);
        return true;
    }

    // 操作を受け付ける。elapsed：手番の側が、この手番にかけた時間（ミリ秒。時計なしなら見ない）
    // 時間を使い切っていたら断る（呼ぶ側が先に timeout で終える）
    applyCommand(playerId, command, elapsed = 0) {
        const seat = this.clockSeat();
        const ms = Math.max(0, Math.round(elapsed) || 0);
        if (seat !== null && ms >= this.clockLimit()) return this.fail('時間切れです');
        const count = this.commands.length;
        const ok = this.applyAction(playerId, command);
        if (ok && this.clock && this.commands.length > count) {
            this.commands.at(-1).ms = ms;
            if (seat !== null) this.clock[seat] = spend(this.clockConfig, this.clock[seat], ms).side;
        }
        return ok;
    }

    applyAction(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('対局は終わっています');
        if (playerId !== 0 && playerId !== 1) return this.fail('席が正しくありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (command.type === 'resign') {
            this.commands.push({ playerId, command: { type: 'resign' } });
            this.finish(1 - playerId, 'resign', playerId);
            return true;
        }
        if (playerId !== this.current) return this.fail('今はあなたの番ではありません');
        let m;
        if (command.type === 'move') {
            const { from, to } = command;
            if (!isSquare(from) || !isSquare(to)) return this.fail('升が正しくありません');
            m = makeMove(from, to, command.promote === true);
        } else if (command.type === 'drop') {
            const { piece, to } = command;
            if (!Number.isInteger(piece) || piece < 1 || piece > 7 || !isSquare(to)) return this.fail('駒が正しくありません');
            m = makeDrop(piece, to);
        } else {
            return this.fail('操作が正しくありません');
        }
        if (!this.pos.legalMoves().includes(m)) return this.fail('その手は指せません');
        this.play(m);
        const recorded = command.type === 'move'
            ? { type: 'move', from: command.from, to: command.to, promote: command.promote === true }
            : { type: 'drop', piece: command.piece, to: command.to };
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // 合法と分かっている手を指す
    play(m) {
        const seat = this.current;
        const text = moveText(this.pos, m, this.lastMove?.to ?? null);
        const captured = isDrop(m) ? 0 : this.pos.board[moveTo(m)];
        this.pos.make(m);
        this.pos.caps.length = 0;   // 戻さないので、取った駒の記録は要らない
        this.ply++;
        const check = this.pos.inCheck();
        this.checks.push(check);
        this.lastMove = isDrop(m)
            ? { seat, from: null, to: moveTo(m), drop: dropType(m), promote: false, captured: 0 }
            : { seat, from: moveFrom(m), to: moveTo(m), drop: null, promote: isPromote(m), captured: captured ? typeOf(captured) : 0 };
        this.logs.push(text);
        this.pushEvent({ type: 'move', seat, ...this.lastMove, check, text });
        const key = this.pos.toSfen();
        this.history.push(key);
        if (this.history.filter(k => k === key).length >= REPETITION) {
            this.repetition(key);
            return;
        }
        if (!this.pos.hasLegalMove()) this.finish(seat, 'checkmate');
    }

    // 千日手。連続王手なら王手をかけ続けた側の負け、そうでなければ引き分け
    repetition(key) {
        const winner = repetitionWinner(this.history, this.checks, key);
        this.finish(winner, winner === null ? 'repetition' : 'perpetual-check');
    }

    // loser：投了・時間切れの側
    finish(winner, reason, loser = null) {
        this.phase = 'end';
        this.winner = winner;
        this.reason = reason;
        const text = {
            checkmate: `まで${this.ply}手で${SIDE_NAME[winner]}の勝ち`,
            resign: `${SIDE_NAME[loser]}の投了。まで${this.ply}手で${SIDE_NAME[winner]}の勝ち`,
            timeout: `まで${this.ply}手で${SIDE_NAME[loser]}の時間切れ。${SIDE_NAME[winner]}の勝ち`,
            repetition: `まで${this.ply}手で千日手`,
            'perpetual-check': `連続王手の千日手。まで${this.ply}手で${SIDE_NAME[winner]}の勝ち`
        }[reason];
        this.pushEvent({ type: 'end', winner, reason, text });
    }

    // ---- 記録 ----

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

    // 記録から再現する。ms（かかった時間）のない古い記録は 0 として読む
    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command, ms = 0 }, index) => {
            const ok = command?.type === 'timeout' ? game.timeout(playerId, ms) : game.applyCommand(playerId, command, ms);
            if (!ok) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}
