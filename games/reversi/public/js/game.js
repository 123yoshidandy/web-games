/**
 * リバーシ（2人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（乱数は使わない）
 *
 * ルール（世界オセロ連盟の公式ルール。最初の配置は標準の向き）
 * - 8×8 の盤。中央に黒白2つずつ、黒が右上と左下。黒が先手
 * - 相手の石を、縦・横・斜めの8方向で、自分の石ではさめるマスにだけ置ける。はさんだ石はすべて返す
 * - 置けるマスがあれば必ず置く。置けるマスがないときだけパスになり、相手の番になる（何回でもよい）
 * - 両者とも置けなくなったら終わり（ふつうは盤が埋まったとき）。石の多い方の勝ち。同じ数なら引き分け
 *
 * ルールにない点・画面の都合で決めた点（README にも書く）
 * - パスは操作にしない。置けない人の番は自動で飛ばし、出来事（pass）として知らせる
 * - 盤に空きを残して終わったとき、空きはどちらにも数えない（公式のルールに決まりがなく、数えても勝ち負けは変わらない）
 */

import { BLACK, WHITE, colorOf, legalMoves, applyMove, countStones, initialBoard, sqName } from './rules.js';

export const PLAYERS = 2;
const MAX_LOGS = 500;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = { move: ['sq'] };

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]（席0：黒、席1：白）
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        this.options = { ...options };
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        this.board = initialBoard();
        this.current = 0;
        this.ply = 0;
        this.phase = 'play';
        this.winner = null;      // 勝った席（引き分けは null）
        this.lastMove = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    moves(seat = this.current) {
        return legalMoves(this.board, colorOf(seat));
    }

    counts() {
        return countStones(this.board);
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || command.type !== 'move') return this.fail('操作が正しくありません');
        const { sq } = command;
        if (!Number.isInteger(sq) || sq < 0 || sq >= 64) return this.fail('マスが正しくありません');
        if (!this.moves(playerId).includes(sq)) return this.fail('そこには置けません');
        this.play(playerId, sq);
        this.commands.push({ playerId, command: { type: 'move', sq } });
        return true;
    }

    play(seat, sq) {
        const { board, flips } = applyMove(this.board, sq, colorOf(seat));
        this.board = board;
        this.ply++;
        this.lastMove = { seat, sq, flips };
        this.log(`${this.players[seat].name}：${sqName(sq)}（${flips.length}個返す）`);
        this.pushEvent({ type: 'move', seat, sq, flips });
        const next = 1 - seat;
        if (this.moves(next).length) {
            this.current = next;
        } else if (this.moves(seat).length) {
            // 相手は置けないのでパス。同じ人がもう一度置く
            this.current = seat;
            this.log(`${this.players[next].name}はパス`);
            this.pushEvent({ type: 'pass', seat: next });
        } else {
            this.finish();
        }
    }

    finish() {
        const { black, white, empty } = this.counts();
        this.phase = 'end';
        this.winner = black > white ? 0 : white > black ? 1 : null;
        this.log(`終わり：黒${black}・白${white}${empty ? `（空き${empty}）` : ''}。${this.winner === null ? '引き分け' : `${this.players[this.winner].name}の勝ち`}`);
        this.pushEvent({ type: 'end', winner: this.winner, black, white, empty });
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

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}

export { BLACK, WHITE };
