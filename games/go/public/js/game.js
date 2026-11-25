/**
 * 囲碁（2人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（ゲームに乱数はない）
 *
 * 日本ルール
 * - 席0が黒、席1が白。黒が先に打つ。置き碁（2子以上）では、黒の石を星に置いてから白が先に打つ
 * - 取り・自殺手の禁止・コウ（rules.js）
 * - パスはいつでもできる。2人が続けてパスしたら、死に石を決める段階（scoring）に入る
 * - 死に石は、まず局面から見込みで決め（engine.js のプレイアウト。盤から作るシードなので、同じ局面なら同じ結果）、人が連ごとに直す
 *   2人とも確定したら終わり。どちらかが「対局再開」したら、打つ段階に戻る（死に石の指定は消す）
 * - 点＝地＋アゲハマ。白にはコミを足す。投了もできる
 *
 * 操作（applyCommand）
 * - move { sq }・pass：打つ段階の手番の人
 * - mark { sq, dead }：死に石を決める段階。sq の石の連を、死に石にする（dead: true）か戻す
 * - resume：死に石を決める段階から、打つ段階に戻る
 * - confirm：死に石を決める段階で、今の指定でよいと伝える。2人そろったら終わり
 * - resign：投了（打つ段階と死に石を決める段階。手番でなくてもよい）
 */

import {
    BLACK, WHITE, EMPTY, SIZES, colorOf, opponent, neighbors, createBoard, tryMove, legalMoves, groupAt, groups,
    scoreJapanese, handicapPoints, MAX_HANDICAP, sqName, COLOR_NAME
} from './rules.js';
import { ownership, boardSeed } from './engine.js';

export const PLAYERS = 2;
const MAX_LOGS = 800;
const MAX_EVENTS = 150;
const DEAD_PLAYOUTS = 400;

export const COMMAND_FIELDS = { move: ['sq'], pass: [], mark: ['sq', 'dead'], resume: [], confirm: [], resign: [] };

export const DEFAULT_OPTIONS = { size: 19, komi: 6.5, handicap: 0 };

// オプションを確かめてそろえる（変な値は断る）
export function normalizeOptions(options = {}) {
    const size = options.size ?? DEFAULT_OPTIONS.size;
    if (!SIZES.includes(size)) throw new Error('盤の大きさが正しくありません');
    const handicap = options.handicap ?? 0;
    if (!Number.isInteger(handicap) || handicap < 0 || handicap === 1 || handicap > MAX_HANDICAP[size]) throw new Error('置き石の数が正しくありません');
    const komi = options.komi ?? DEFAULT_OPTIONS.komi;
    if (typeof komi !== 'number' || !Number.isFinite(komi) || Math.abs(komi) > 50 || Math.round(komi * 2) !== komi * 2) throw new Error('コミが正しくありません');
    return { size, komi, handicap };
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]（席0：黒、席1：白）。options: { size, komi, handicap }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        this.options = normalizeOptions(options);
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        const { size, handicap } = this.options;
        this.size = size;
        this.board = createBoard(size);
        this.handicapStones = handicapPoints(size, handicap);
        this.handicapStones.forEach(sq => { this.board[sq] = BLACK; });
        this.placed = [0, this.handicapStones.length, 0];   // 色ごとに打った石の数（置き石を含む）
        this.current = this.handicapStones.length ? 1 : 0;
        this.ko = -1;
        this.prisoners = { [BLACK]: 0, [WHITE]: 0 };       // 色ごとの、取った石の数
        this.moveNumber = 0;                                // 手数（パスも1手）
        this.passes = 0;                                    // 続けてのパスの数
        this.phase = 'play';                                // play → scoring → end
        this.dead = [];
        this.agreed = [false, false];
        this.lastMove = null;                               // { seat, sq（パスは -1）, captured }
        this.result = null;                                 // { winner（席。持碁は null）, reason: 'score' | 'resign', score }
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    isOver() {
        return this.phase === 'end';
    }

    get winner() {
        return this.result ? this.result.winner : null;
    }

    actors() {
        if (this.phase === 'play') return [this.current];
        if (this.phase === 'scoring') return [0, 1].filter(seat => !this.agreed[seat]);
        return [];
    }

    moves(seat = this.current) {
        return legalMoves(this.board, this.size, colorOf(seat), this.ko);
    }

    // 打てるかどうかと、打てないわけ（'occupied'・'ko'・'suicide'）
    check(sq, seat = this.current) {
        const res = tryMove(this.board, this.size, sq, colorOf(seat), this.ko);
        return res.ok ? null : res.reason;
    }

    score() {
        return scoreJapanese(this.board, this.size, { dead: this.dead, prisoners: this.prisoners, komi: this.options.komi });
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('対局は終わっています');
        if (playerId !== 0 && playerId !== 1) return this.fail('席が正しくありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const { type } = command;
        if (type === 'resign') {
            this.resign(playerId);
            return this.record(playerId, { type });
        }
        if (this.phase === 'play') {
            if (playerId !== this.current) return this.fail('今はあなたの番ではありません');
            if (type === 'pass') {
                this.pass(playerId);
                return this.record(playerId, { type });
            }
            if (type !== 'move') return this.fail('今は打つ番です');
            const { sq } = command;
            if (!Number.isInteger(sq) || sq < 0 || sq >= this.size * this.size) return this.fail('点が正しくありません');
            const res = tryMove(this.board, this.size, sq, colorOf(playerId), this.ko);
            if (!res.ok) return this.fail(res.reason === 'ko' ? 'コウなので、すぐには取り返せません' : res.reason === 'suicide' ? '自殺手は打てません' : 'そこには石があります');
            this.play(playerId, sq, res);
            return this.record(playerId, { type, sq });
        }
        // 死に石を決める段階
        if (type === 'mark') {
            const { sq, dead } = command;
            if (!Number.isInteger(sq) || sq < 0 || sq >= this.size * this.size || this.board[sq] === EMPTY) return this.fail('石を選んでください');
            if (typeof dead !== 'boolean') return this.fail('操作が正しくありません');
            this.mark(sq, dead);
            return this.record(playerId, { type, sq, dead });
        }
        if (type === 'resume') {
            this.resume(playerId);
            return this.record(playerId, { type });
        }
        if (type === 'confirm') {
            if (this.agreed[playerId]) return this.fail('もう確定しています');
            this.agreed[playerId] = true;
            this.pushEvent({ type: 'confirm', seat: playerId });
            if (this.agreed.every(Boolean)) this.finish();
            return this.record(playerId, { type });
        }
        return this.fail('今は死に石を決めるところです');
    }

    record(playerId, command) {
        this.commands.push({ playerId, command });
        return true;
    }

    play(seat, sq, res) {
        const color = colorOf(seat);
        this.board = res.board;
        this.ko = res.ko;
        this.prisoners[color] += res.captured.length;
        this.placed[color]++;
        this.moveNumber++;
        this.passes = 0;
        this.lastMove = { seat, sq, captured: [...res.captured] };
        this.current = 1 - seat;
        this.log(`${this.moveNumber}. ${this.players[seat].name}：${sqName(sq, this.size)}${res.captured.length ? `（${res.captured.length}子を取る）` : ''}`);
        this.pushEvent({ type: 'move', seat, sq, captured: [...res.captured] });
    }

    pass(seat) {
        this.moveNumber++;
        this.passes++;
        this.ko = -1;
        this.lastMove = { seat, sq: -1, captured: [] };
        this.current = 1 - seat;
        this.log(`${this.moveNumber}. ${this.players[seat].name}：パス`);
        this.pushEvent({ type: 'pass', seat });
        if (this.passes >= 2) this.enterScoring();
    }

    enterScoring() {
        this.phase = 'scoring';
        this.agreed = [false, false];
        this.dead = estimateDead(this.board, this.size, this.options.komi);
        this.log('終局。死に石を確かめます');
        this.pushEvent({ type: 'scoring', dead: [...this.dead] });
    }

    // sq の石の連を、まとめて死に石にする（戻す）。指定を変えたら、確定はやり直し
    mark(sq, dead) {
        const stones = groupAt(this.board, this.size, sq).stones;
        const set = new Set(this.dead);
        stones.forEach(s => (dead ? set.add(s) : set.delete(s)));
        this.dead = [...set].sort((a, b) => a - b);
        this.agreed = [false, false];
        this.pushEvent({ type: 'mark', sq, dead, stones });
    }

    resume(seat) {
        this.phase = 'play';
        this.passes = 0;
        this.dead = [];
        this.agreed = [false, false];
        this.log(`${this.players[seat].name}：対局再開`);
        this.pushEvent({ type: 'resume', seat });
    }

    finish() {
        const score = this.score();
        const winner = score.winner === BLACK ? 0 : score.winner === WHITE ? 1 : null;
        this.phase = 'end';
        this.result = { winner, reason: 'score', score: { black: score.black, white: score.white, diff: score.diff } };
        this.log(`終わり：黒${score.black.total}・白${score.white.total}。${resultText(this)}`);
        this.pushEvent({ type: 'end', winner, reason: 'score' });
    }

    resign(seat) {
        const winner = 1 - seat;
        this.phase = 'end';
        this.result = { winner, reason: 'resign', score: null };
        this.log(`${this.players[seat].name}：投了。${resultText(this)}`);
        this.pushEvent({ type: 'end', winner, reason: 'resign' });
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

/**
 * 死に石の見込み：プレイアウトで点ごとの持ち主を数え、連の石が平均して相手のものになる連を死に石とする
 * ただし、眼（縦横がすべて同じ色の石の空き）を2つ以上持つ連は生きとする（乱数のプレイアウトは、生きた石も取られることがあるため）
 * 盤から作るシードを使うので、同じ局面なら同じ結果になる（記録の再現がずれない）
 */
export function estimateDead(board, size, komi = 0) {
    const own = ownership(board, size, { komi, playouts: DEAD_PLAYOUTS, seed: boardSeed(board, size) });
    const nbrs = neighbors(size);
    const isEye = (sq, color) => board[sq] === EMPTY && nbrs[sq].every(n => board[n] === color);
    const dead = [];
    for (const group of groups(board, size)) {
        const sign = group.color === BLACK ? 1 : -1;
        const avg = group.stones.reduce((s, sq) => s + own[sq] * sign, 0) / group.stones.length;
        if (avg >= 0) continue;
        const eyes = [...group.liberties].filter(sq => isEye(sq, group.color));
        if (eyes.length >= 2) continue;
        dead.push(...group.stones);
    }
    return dead.sort((a, b) => a - b);
}

// 「黒の3目半勝ち」「白の中押し勝ち」「持碁」
export function resultText(game) {
    const r = game.result;
    if (!r) return '';
    if (r.winner === null) return '持碁';
    const color = COLOR_NAME[colorOf(r.winner)];
    if (r.reason === 'resign') return `${color}の中押し勝ち`;
    return `${color}の${marginText(Math.abs(r.score.diff))}勝ち`;
}

export function marginText(margin) {
    const whole = Math.floor(margin);
    const half = margin - whole >= 0.5;
    if (whole === 0 && half) return '半目';
    return `${whole}目${half ? '半' : ''}`;
}

export { BLACK, WHITE, opponent };
