/**
 * 将棋（本将棋）の盤と駒の動き（DOM に依存しない）
 * ゲームの進行（game.js）と CPU の読み（engine.js）が、同じ Position を使う
 *
 * 盤：sq = 段 × 9 + 列。段 0 が一段目（上、後手の陣）、列 0 が9筋（左）。筋 = 9 − 列、段 = 段 + 1
 * 駒：0 は空き。先手の駒は種類の番号そのまま、後手の駒は 16 + 種類（side = 駒 >> 4、種類 = 駒 & 15）
 * 手：整数。from | to << 7 | 成る << 14。打つ手の from は 80 + 種類（81〜87）
 *
 * 合法手 = 駒の動きどおりの手 − 王手を放置する手 − 打ち歩詰め
 * 二歩・行き所のない駒（打つ手と、成らずに動く手）は、手を作るときに除く
 */

import { createRandom } from './random.js';

export const SIZE = 9;
export const SENTE = 0;
export const GOTE = 1;
export const FU = 1, KY = 2, KE = 3, GI = 4, KI = 5, KA = 6, HI = 7, OU = 8;
export const TO = 9, NY = 10, NK = 11, NG = 12, UM = 14, RY = 15;
export const PROMOTE = 8;
export const HAND_TYPES = [HI, KA, KI, GI, KE, KY, FU];   // 持ち駒を並べる順
export const PROMOTE_FLAG = 1 << 14;
export const DROP_BASE = 80;

export const pieceOf = (side, type) => side * 16 + type;
export const sideOf = (p) => p >> 4;
export const typeOf = (p) => p & 15;
export const unpromote = (t) => (t > PROMOTE ? t - PROMOTE : t);
export const canPromoteType = (t) => t <= HI && t !== KI;

export const rowOf = (sq) => Math.floor(sq / SIZE);
export const colOf = (sq) => sq % SIZE;
export const fileOf = (sq) => SIZE - colOf(sq);
export const rankOf = (sq) => rowOf(sq) + 1;
export const sqOf = (file, rank) => (rank - 1) * SIZE + (SIZE - file);

// 手の整数との変換
export const makeMove = (from, to, promote = false) => from | (to << 7) | (promote ? PROMOTE_FLAG : 0);
export const makeDrop = (type, to) => (DROP_BASE + type) | (to << 7);
export const moveFrom = (m) => m & 127;
export const moveTo = (m) => (m >> 7) & 127;
export const isPromote = (m) => (m & PROMOTE_FLAG) !== 0;
export const isDrop = (m) => (m & 127) > DROP_BASE;
export const dropType = (m) => (m & 127) - DROP_BASE;

// 敵陣（成れる段）と、行き所のない段
export const inZone = (side, sq) => (side === SENTE ? rowOf(sq) <= 2 : rowOf(sq) >= 6);
export function deadEnd(side, type, sq) {
    const r = side === SENTE ? rowOf(sq) : 8 - rowOf(sq);   // 自分から見て一番奥が 0
    if (type === FU || type === KY) return r === 0;
    if (type === KE) return r <= 1;
    return false;
}

// ---- 駒の動き（先手から見た向き。上が -1。後手は上下左右を反転する） ----

const ALL8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const GOLD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const STEP_DIRS = {
    [FU]: [[-1, 0]],
    [KE]: [[-2, -1], [-2, 1]],
    [GI]: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]],
    [KI]: GOLD, [TO]: GOLD, [NY]: GOLD, [NK]: GOLD, [NG]: GOLD,
    [OU]: ALL8,
    [UM]: ORTH,
    [RY]: DIAG
};
const SLIDE_DIRS = { [KY]: [[-1, 0]], [KA]: DIAG, [HI]: ORTH, [UM]: DIAG, [RY]: ORTH };

// STEPS[side][type][sq]：1歩で行ける升。RAYS[side][type][sq]：走る向きごとの升の列
export const STEPS = [[], []];
export const RAYS = [[], []];
for (const side of [SENTE, GOTE]) {
    const sign = side === SENTE ? 1 : -1;
    for (let type = 0; type < 16; type++) {
        STEPS[side][type] = [];
        RAYS[side][type] = [];
        for (let sq = 0; sq < 81; sq++) {
            const r = rowOf(sq);
            const c = colOf(sq);
            const inside = (rr, cc) => rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE;
            STEPS[side][type][sq] = (STEP_DIRS[type] ?? [])
                .map(([dr, dc]) => [r + dr * sign, c + dc * sign])
                .filter(([rr, cc]) => inside(rr, cc))
                .map(([rr, cc]) => rr * SIZE + cc);
            RAYS[side][type][sq] = (SLIDE_DIRS[type] ?? []).map(([dr, dc]) => {
                const ray = [];
                for (let rr = r + dr * sign, cc = c + dc * sign; inside(rr, cc); rr += dr * sign, cc += dc * sign) ray.push(rr * SIZE + cc);
                return ray;
            }).filter(ray => ray.length);
        }
    }
}

const GOLD_LIKE = new Set([KI, TO, NY, NK, NG]);

// ---- 局面の同一性（CPU の読みで使うハッシュ。2つの 32bit を合わせて 53bit の数にする） ----

const zobrist = (() => {
    const random = createRandom(0x5106);
    const next = () => Math.floor(random() * 2 ** 32) | 0;
    const board = Array.from({ length: 32 }, () => Array.from({ length: 81 }, () => [next(), next()]));
    const hand = Array.from({ length: 2 }, () => Array.from({ length: 8 }, () => Array.from({ length: 19 }, () => [next(), next()])));
    return { board, hand, side: [next(), next()] };
})();

// ---- 局面 ----

export class Position {
    constructor() {
        this.board = new Array(81).fill(0);
        this.hands = [new Array(8).fill(0), new Array(8).fill(0)];
        this.side = SENTE;
        this.kings = [-1, -1];
        this.h1 = 0;
        this.h2 = 0;
        this.caps = [];     // 取った駒（unmake で戻す）
    }

    static initial() {
        return Position.fromSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -');
    }

    // SFEN（盤・手番・持ち駒。手数は読まない）
    static fromSfen(sfen) {
        const pos = new Position();
        const [boardText, sideText = 'b', handText = '-'] = sfen.trim().split(/\s+/);
        const rows = boardText.split('/');
        if (rows.length !== SIZE) throw new Error('SFEN の段の数が正しくありません');
        rows.forEach((row, r) => {
            let c = 0;
            for (let i = 0; i < row.length; i++) {
                const ch = row[i];
                if (/\d/.test(ch)) {
                    c += Number(ch);
                    continue;
                }
                let promoted = false;
                let letter = ch;
                if (ch === '+') {
                    promoted = true;
                    letter = row[++i];
                }
                const type = SFEN_TYPES[letter.toUpperCase()];
                if (!type) throw new Error(`SFEN の駒が正しくありません: ${letter}`);
                const side = letter === letter.toUpperCase() ? SENTE : GOTE;
                pos.board[r * SIZE + c] = pieceOf(side, promoted ? type + PROMOTE : type);
                c++;
            }
            if (c !== SIZE) throw new Error('SFEN の列の数が正しくありません');
        });
        pos.side = sideText === 'w' ? GOTE : SENTE;
        if (handText !== '-') {
            for (const [, count, letter] of handText.matchAll(/(\d*)([A-Za-z])/g)) {
                const side = letter === letter.toUpperCase() ? SENTE : GOTE;
                pos.hands[side][SFEN_TYPES[letter.toUpperCase()]] += count ? Number(count) : 1;
            }
        }
        pos.refresh();
        return pos;
    }

    toSfen() {
        const rows = [];
        for (let r = 0; r < SIZE; r++) {
            let text = '';
            let empty = 0;
            for (let c = 0; c < SIZE; c++) {
                const p = this.board[r * SIZE + c];
                if (!p) {
                    empty++;
                    continue;
                }
                if (empty) text += empty;
                empty = 0;
                const type = typeOf(p);
                const letter = SFEN_LETTERS[unpromote(type)];
                text += (type > PROMOTE ? '+' : '') + (sideOf(p) === SENTE ? letter : letter.toLowerCase());
            }
            if (empty) text += empty;
            rows.push(text);
        }
        let hand = '';
        for (const side of [SENTE, GOTE]) {
            for (const type of HAND_TYPES) {
                const n = this.hands[side][type];
                if (!n) continue;
                const letter = side === SENTE ? SFEN_LETTERS[type] : SFEN_LETTERS[type].toLowerCase();
                hand += (n > 1 ? n : '') + letter;
            }
        }
        return `${rows.join('/')} ${this.side === SENTE ? 'b' : 'w'} ${hand || '-'}`;
    }

    // 玉の位置とハッシュを、盤と持ち駒から作り直す
    refresh() {
        this.kings = [-1, -1];
        this.h1 = 0;
        this.h2 = 0;
        this.board.forEach((p, sq) => {
            if (!p) return;
            if (typeOf(p) === OU) this.kings[sideOf(p)] = sq;
            this.h1 ^= zobrist.board[p][sq][0];
            this.h2 ^= zobrist.board[p][sq][1];
        });
        for (const side of [SENTE, GOTE]) {
            for (let t = 1; t < 8; t++) {
                this.h1 ^= zobrist.hand[side][t][this.hands[side][t]][0];
                this.h2 ^= zobrist.hand[side][t][this.hands[side][t]][1];
            }
        }
        if (this.side === GOTE) {
            this.h1 ^= zobrist.side[0];
            this.h2 ^= zobrist.side[1];
        }
    }

    get key() {
        return (this.h1 >>> 0) * 2097152 + (this.h2 >>> 11);
    }

    clone() {
        const pos = new Position();
        pos.board = [...this.board];
        pos.hands = [[...this.hands[0]], [...this.hands[1]]];
        pos.side = this.side;
        pos.kings = [...this.kings];
        pos.h1 = this.h1;
        pos.h2 = this.h2;
        return pos;
    }

    // ---- 手を指す・戻す ----

    setPiece(sq, p) {
        const old = this.board[sq];
        if (old) {
            this.h1 ^= zobrist.board[old][sq][0];
            this.h2 ^= zobrist.board[old][sq][1];
        }
        this.board[sq] = p;
        if (p) {
            this.h1 ^= zobrist.board[p][sq][0];
            this.h2 ^= zobrist.board[p][sq][1];
            if (typeOf(p) === OU) this.kings[sideOf(p)] = sq;
        }
    }

    addHand(side, type, delta) {
        const z = zobrist.hand[side][type];
        const n = this.hands[side][type];
        this.h1 ^= z[n][0] ^ z[n + delta][0];
        this.h2 ^= z[n][1] ^ z[n + delta][1];
        this.hands[side][type] = n + delta;
    }

    flipSide() {
        this.side ^= 1;
        this.h1 ^= zobrist.side[0];
        this.h2 ^= zobrist.side[1];
    }

    make(m) {
        const us = this.side;
        const from = m & 127;
        const to = (m >> 7) & 127;
        if (from > DROP_BASE) {
            const type = from - DROP_BASE;
            this.addHand(us, type, -1);
            this.setPiece(to, pieceOf(us, type));
            this.caps.push(0);
        } else {
            const p = this.board[from];
            const cap = this.board[to];
            if (cap) this.addHand(us, unpromote(typeOf(cap)), 1);
            this.setPiece(from, 0);
            this.setPiece(to, m & PROMOTE_FLAG ? p + PROMOTE : p);
            this.caps.push(cap);
        }
        this.flipSide();
    }

    unmake(m) {
        this.flipSide();
        const us = this.side;
        const from = m & 127;
        const to = (m >> 7) & 127;
        const cap = this.caps.pop();
        if (from > DROP_BASE) {
            this.setPiece(to, 0);
            this.addHand(us, from - DROP_BASE, 1);
        } else {
            const p = this.board[to];
            this.setPiece(to, cap);
            this.setPiece(from, m & PROMOTE_FLAG ? p - PROMOTE : p);
            if (cap) this.addHand(us, unpromote(typeOf(cap)), -1);
        }
    }

    // ---- 利き ----

    // 升 sq に、by の駒が利いているか
    attacked(sq, by) {
        if (sq < 0) return false;
        const b = this.board;
        const opp = by ^ 1;
        const base = by * 16;
        for (const x of STEPS[opp][FU][sq]) if (b[x] === base + FU) return true;
        for (const x of STEPS[opp][KE][sq]) if (b[x] === base + KE) return true;
        for (const x of STEPS[opp][GI][sq]) if (b[x] === base + GI) return true;
        for (const x of STEPS[opp][KI][sq]) {
            const p = b[x];
            if (p && sideOf(p) === by && GOLD_LIKE.has(typeOf(p))) return true;
        }
        for (const x of STEPS[opp][OU][sq]) {
            const p = b[x];
            if (p === base + OU || p === base + UM || p === base + RY) return true;
        }
        for (const ray of RAYS[opp][KY][sq]) {
            for (const x of ray) {
                if (!b[x]) continue;
                if (b[x] === base + KY) return true;
                break;
            }
        }
        for (const ray of RAYS[opp][KA][sq]) {
            for (const x of ray) {
                const p = b[x];
                if (!p) continue;
                if (p === base + KA || p === base + UM) return true;
                break;
            }
        }
        for (const ray of RAYS[opp][HI][sq]) {
            for (const x of ray) {
                const p = b[x];
                if (!p) continue;
                if (p === base + HI || p === base + RY) return true;
                break;
            }
        }
        return false;
    }

    inCheck(side = this.side) {
        return this.attacked(this.kings[side], side ^ 1);
    }

    // ---- 手の生成 ----

    // 駒の動きどおりの手（王手の放置と打ち歩詰めは、まだ除かない）。captures：取る手と成る手だけ
    pseudoMoves(list = [], { captures = false } = {}) {
        const us = this.side;
        const b = this.board;
        for (let sq = 0; sq < 81; sq++) {
            const p = b[sq];
            if (!p || sideOf(p) !== us) continue;
            const type = typeOf(p);
            for (const to of STEPS[us][type][sq]) {
                const target = b[to];
                if (target && sideOf(target) === us) continue;
                this.pushMove(list, sq, to, type, captures && !target);
            }
            for (const ray of RAYS[us][type][sq]) {
                for (const to of ray) {
                    const target = b[to];
                    if (target && sideOf(target) === us) break;
                    this.pushMove(list, sq, to, type, captures && !target);
                    if (target) break;
                }
            }
        }
        if (captures) return list;
        const hand = this.hands[us];
        let pawnFiles = 0;
        if (hand[FU]) {
            for (let sq = 0; sq < 81; sq++) if (b[sq] === us * 16 + FU) pawnFiles |= 1 << colOf(sq);
        }
        for (let type = 1; type < 8; type++) {
            if (!hand[type]) continue;
            for (let to = 0; to < 81; to++) {
                if (b[to] || deadEnd(us, type, to)) continue;
                if (type === FU && pawnFiles & (1 << colOf(to))) continue;   // 二歩
                list.push((DROP_BASE + type) | (to << 7));
            }
        }
        return list;
    }

    // quietOnly：成れる手のうち、成る手だけを入れる（取らない手は入れない）
    pushMove(list, from, to, type, quietOnly) {
        const us = this.side;
        const m = from | (to << 7);
        if (canPromoteType(type) && (inZone(us, from) || inZone(us, to))) {
            list.push(m | PROMOTE_FLAG);
            if (!quietOnly && !deadEnd(us, type, to)) list.push(m);
            return;
        }
        if (!quietOnly) list.push(m);
    }

    // 指した後の局面（make 済み）で、指した側の玉が取られないか・打ち歩詰めでないか
    // m は直前に make した手。手番は相手に移っている
    legalAfter(m) {
        const us = this.side ^ 1;
        if (this.attacked(this.kings[us], this.side)) return false;
        if ((m & 127) === DROP_BASE + FU) {
            const to = (m >> 7) & 127;
            const ahead = us === SENTE ? to - SIZE : to + SIZE;
            if (this.kings[this.side] === ahead && !this.hasLegalMove()) return false;   // 打ち歩詰め
        }
        return true;
    }

    isLegal(m) {
        this.make(m);
        const ok = this.legalAfter(m);
        this.unmake(m);
        return ok;
    }

    legalMoves() {
        return this.pseudoMoves().filter(m => this.isLegal(m));
    }

    hasLegalMove() {
        const list = this.pseudoMoves();
        for (const m of list) if (this.isLegal(m)) return true;
        return false;
    }

    // 手を指すと王手になるか
    givesCheck(m) {
        this.make(m);
        const check = this.inCheck();
        this.unmake(m);
        return check;
    }
}

const SFEN_TYPES = { P: FU, L: KY, N: KE, S: GI, G: KI, B: KA, R: HI, K: OU };
const SFEN_LETTERS = Object.fromEntries(Object.entries(SFEN_TYPES).map(([k, v]) => [v, k]));

// 手数 depth の局面の数（テスト用）
export function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = pos.legalMoves();
    if (depth === 1) return moves.length;
    let n = 0;
    for (const m of moves) {
        pos.make(m);
        n += perft(pos, depth - 1);
        pos.unmake(m);
    }
    return n;
}
