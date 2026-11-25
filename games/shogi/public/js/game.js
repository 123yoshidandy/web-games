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
 */

import { Position, SENTE, makeMove, makeDrop, moveFrom, moveTo, isDrop, dropType, isPromote, typeOf } from './rules.js';
import { moveText, SIDE_NAME } from './notation.js';

export const PLAYERS = 2;
export const REPETITION = 4;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = { move: ['from', 'to', 'promote'], drop: ['piece', 'to'], resign: [] };

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
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        this.options = { ...options };
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? SIDE_NAME[id]), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        this.pos = Position.initial();
        this.ply = 0;
        this.phase = 'play';
        this.winner = null;         // 勝った席（引き分けは null）
        this.reason = null;         // 終わった理由：checkmate・resign・repetition・perpetual-check
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

    applyCommand(playerId, command) {
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

    finish(winner, reason, resigned = null) {
        this.phase = 'end';
        this.winner = winner;
        this.reason = reason;
        const text = {
            checkmate: `まで${this.ply}手で${SIDE_NAME[winner]}の勝ち`,
            resign: `${SIDE_NAME[resigned]}の投了。まで${this.ply}手で${SIDE_NAME[winner]}の勝ち`,
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

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}
