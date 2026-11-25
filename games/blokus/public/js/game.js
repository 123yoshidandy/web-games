/**
 * ブロックスの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる
 *
 * ルール
 * - 20×20 の盤。4色（青・黄・赤・緑）が21個ずつのピース（1〜5マス、合わせて89マス）を持つ。青 → 黄 → 赤 → 緑の順に1個ずつ置く
 * - 各色の最初のピースは、その色の角のマスを覆う
 * - 2個目からは、同じ色のピースと角で1か所以上接し、同じ色とは辺で接しない。ほかの色とは辺で接してよい
 * - 置けない色はパスする（そのあとも置けないので、その色は終わり）。どの色も置けなくなったら終わり
 * - 2人：先手が青と赤、後手が黄と緑を持つ。点は2色の合計
 * - 3人：3人が1色ずつ持ち、4色目（緑）は3人が順番に置く。4色目の点は数えない
 * - 得点：基本は残りのマスの少ない人の勝ち。上級は残り1マスにつき−1点、全部置けたら+15点、最後に置いたのが1マスならさらに+5点
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 最初のピースは、色ごとに決まった角（青は左上、黄は右上、赤は右下、緑は左下）に置く
 * - 置けるのに置かない「パス」はない。置けない色は、自動でパスになる
 * - 同点なら、同点の人がみな勝ち
 * - 青を持つ人（先手）は、シードから決める
 */

import { createRandom } from './random.js';
import { SIZE, COLORS, COLOR_NAMES, CORNERS, PIECES, PIECE_ORDER, ALL_BONUS, MONO_BONUS } from './pieces.js';

export { SIZE, COLORS, COLOR_NAMES, CORNERS, PIECES, PIECE_ORDER };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const SHARED = -1;  // 3人のときの4色目の持ち主
const MAX_LOGS = 300;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { place: ['piece', 'orient', 'x', 'y'] };

const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

// ピースを置いたときのマス（盤の座標）
export const placedCells = (piece, orient, x, y) => PIECES[piece].orientations[orient].map(([cx, cy]) => [x + cx, y + cy]);

// その色がそのマスたちに置けるか（board：SIZE*SIZE の配列。空きは -1、ほかは色の番号）
export function canPlaceCells(board, color, cells, first) {
    let corner = false;
    for (const [x, y] of cells) {
        if (!inBoard(x, y) || board[y * SIZE + x] !== -1) return false;
        for (const [dx, dy] of EDGES) {
            const nx = x + dx;
            const ny = y + dy;
            if (inBoard(nx, ny) && board[ny * SIZE + nx] === color) return false;
        }
        if (first) {
            if (x === CORNERS[color][0] && y === CORNERS[color][1]) corner = true;
        } else if (!corner) {
            corner = DIAGONALS.some(([dx, dy]) => inBoard(x + dx, y + dy) && board[(y + dy) * SIZE + x + dx] === color);
        }
    }
    return corner;
}

// その色が次に置ける起点のマス（最初は角、そのあとは同じ色と角で接し、辺では接しない空きマス）
export function anchors(board, color, first) {
    if (first) {
        const [x, y] = CORNERS[color];
        return board[y * SIZE + x] === -1 ? [[x, y]] : [];
    }
    const out = [];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (board[y * SIZE + x] !== -1) continue;
            if (EDGES.some(([dx, dy]) => inBoard(x + dx, y + dy) && board[(y + dy) * SIZE + x + dx] === color)) continue;
            if (DIAGONALS.some(([dx, dy]) => inBoard(x + dx, y + dy) && board[(y + dy) * SIZE + x + dx] === color)) out.push([x, y]);
        }
    }
    return out;
}

// 置ける手の一覧 [{ piece, orient, x, y }]。limit 個見つけたら止める
export function legalMoves(board, color, pieces, first, { limit = Infinity, only = null } = {}) {
    const moves = [];
    const seen = new Set();
    const points = anchors(board, color, first);
    for (const piece of only ? pieces.filter(p => only.includes(p)) : pieces) {
        for (const orient of PIECES[piece].distinct) {
            const shape = PIECES[piece].orientations[orient];
            for (const [ax, ay] of points) {
                for (const [cx, cy] of shape) {
                    const x = ax - cx;
                    const y = ay - cy;
                    const id = `${piece}:${orient}:${x}:${y}`;
                    if (seen.has(id)) continue;
                    seen.add(id);
                    if (canPlaceCells(board, color, shape.map(([px, py]) => [x + px, y + py]), first)) {
                        moves.push({ piece, orient, x, y });
                        if (moves.length >= limit) return moves;
                    }
                }
            }
        }
    }
    return moves;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer, scoring: 'basic' | 'advanced' }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、ずれないように）
        const drawn = Math.floor(random() * players.length);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(random() * 2 ** 32) >>> 0;
        this.options = {
            seed,
            startPlayer: options.startPlayer ?? drawn,
            scoring: options.scoring === 'basic' ? 'basic' : 'advanced'
        };
        const n = players.length;
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        // 色の持ち主（先手が青）
        const s = this.options.startPlayer;
        const seatAt = (k) => (s + k) % n;
        this.owners = n === 4 ? [0, 1, 2, 3].map(seatAt)
            : n === 3 ? [seatAt(0), seatAt(1), seatAt(2), SHARED]
                : [seatAt(0), seatAt(1), seatAt(0), seatAt(1)];
        this.sharedNext = s;        // 3人のとき、次に4色目を置く人
        this.board = Array(SIZE * SIZE).fill(-1);
        this.colors = COLORS.map(() => ({ pieces: [...PIECE_ORDER], out: false, last: null, placed: 0 }));
        this.current = 0;           // 置く色
        this.turn = 1;
        this.phase = 'play';        // play / end
        this.lastMove = null;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[s].name}の${COLOR_NAMES.blue}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    // その色を今置く人
    seatOf(color) {
        return this.owners[color] === SHARED ? this.sharedNext : this.owners[color];
    }

    actors() {
        return this.isOver() ? [] : [this.seatOf(this.current)];
    }

    isFirst(color) {
        return this.colors[color].placed === 0;
    }

    movesFor(color, opts) {
        const c = this.colors[color];
        return legalMoves(this.board, color, c.pieces, c.placed === 0, opts);
    }

    hasMove(color) {
        return this.movesFor(color, { limit: 1 }).length > 0;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        if (!command || typeof command !== 'object' || command.type !== 'place') return this.fail('今はその操作はできません');
        if (!this.place(command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    place({ piece, orient, x, y }) {
        const color = this.current;
        const c = this.colors[color];
        if (!c.pieces.includes(piece)) return this.fail('そのピースはもうありません');
        if (![orient, x, y].every(Number.isInteger) || orient < 0 || orient > 7) return this.fail('置き方が正しくありません');
        const cells = placedCells(piece, orient, x, y);
        if (!canPlaceCells(this.board, color, cells, c.placed === 0)) {
            return this.fail(c.placed === 0 ? '最初は角のマスを覆います' : '同じ色と角で接し、辺では接しないように置きます');
        }
        const seat = this.seatOf(color);
        cells.forEach(([cx, cy]) => { this.board[cy * SIZE + cx] = color; });
        c.pieces = c.pieces.filter(p => p !== piece);
        c.last = piece;
        c.placed += 1;
        this.lastMove = { color, piece, orient, x, y, cells };
        if (this.owners[color] === SHARED) this.sharedNext = (this.sharedNext + 1) % this.players.length;
        this.emit({ type: 'place', color, seat, piece, cells });
        this.log(`${this.players[seat].name}：${COLOR_NAMES[COLORS[color]]}に${PIECES[piece].size}マス`);
        this.advance();
        return true;
    }

    // 次に置ける色へ進む。置けない色はパス（終わり）にする
    advance() {
        for (let k = 1; k <= COLORS.length; k++) {
            const color = (this.current + k) % COLORS.length;
            const c = this.colors[color];
            if (c.out) continue;
            if (!c.pieces.length || !this.hasMove(color)) {
                c.out = true;
                this.emit({ type: 'out', color });
                this.log(`${COLOR_NAMES[COLORS[color]]}はもう置けません`);
                continue;
            }
            this.current = color;
            this.turn += 1;
            return;
        }
        this.finish();
    }

    remaining(color) {
        return this.colors[color].pieces.reduce((n, p) => n + PIECES[p].size, 0);
    }

    // 色の点（上級の得点法）。基本の得点法では −残りのマス
    colorScore(color) {
        const c = this.colors[color];
        let score = -this.remaining(color);
        if (this.options.scoring === 'advanced' && c.pieces.length === 0) score += ALL_BONUS + (c.last === 'I1' ? MONO_BONUS : 0);
        return score;
    }

    // 人ごとの点（持つ色の合計。3人の4色目は数えない）
    scores() {
        return this.players.map((_, seat) => this.owners.reduce((n, owner, color) => n + (owner === seat ? this.colorScore(color) : 0), 0));
    }

    finish() {
        this.phase = 'end';
        const scores = this.scores();
        const best = Math.max(...scores);
        this.winners = scores.map((s, i) => (s === best ? i : null)).filter(i => i !== null);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(this.winners.length > 1 ? `${this.winners.map(i => this.players[i].name).join('と')}の引き分け` : `${this.players[this.winners[0]].name}の勝ち`);
    }

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text) {
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
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
            if (!game.applyCommand(playerId, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}
