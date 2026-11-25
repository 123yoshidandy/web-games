/**
 * チェスのルールの中心（DOM に依存しない。ゲームの進行と CPU の読みの両方が使う）
 *
 * 盤は 0x88 の形（128 マス。sq = 段 × 16 + 列。段 0 が1段目＝白の側、列 0 が a 列）
 * 駒は「色 × 8 + 種類」の数（白 1〜6、黒 9〜14、空き 0）
 * 指し手は1つの整数：移動元 | 移動先 << 7 | 成る駒 << 14 | 種類 << 17（種類：ふつう・2マス進む・アンパッサン・キャスリング）
 *
 * - 指し手の生成は「駒の動きとしては正しい手」を作り、指したあとに自分のキングが取られる手を除いて合法手にする
 * - キャスリングは、権利・間の空き・キングがチェックされていない・通るマスと行き先が攻撃されていない、のすべてを見る
 * - アンパッサンのマス（ep）は、取れる相手のポーンが隣にいるときだけ立てる（同じ局面の判定と読みの表をそろえるため）
 * - 局面の指紋（Zobrist の 64 ビットを 32 ビット 2つで持つ）を、指すたびに差分で更新する
 */

export const WHITE = 0;
export const BLACK = 1;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG_NORMAL = 0;
export const FLAG_DOUBLE = 1;
export const FLAG_EP = 2;
export const FLAG_CASTLE = 3;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const pieceOf = (color, type) => (color << 3) | type;
export const colorOf = (p) => p >> 3;
export const typeOf = (p) => p & 7;

export const moveFrom = (m) => m & 127;
export const moveTo = (m) => (m >> 7) & 127;
export const movePromo = (m) => (m >> 14) & 7;
export const moveFlag = (m) => (m >> 17) & 3;
export const encodeMove = (from, to, promo = 0, flag = 0) => from | (to << 7) | (promo << 14) | (flag << 17);

export const onBoard = (sq) => (sq & 0x88) === 0;
export const sqName = (sq) => 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
export const sqOf = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
export const isSquareName = (name) => typeof name === 'string' && /^[a-h][1-8]$/.test(name);

const KNIGHT_D = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_D = [1, -1, 16, -16, 17, 15, -17, -15];
const BISHOP_D = [17, 15, -17, -15];
const ROOK_D = [1, -1, 16, -16];

export const LETTER = { [PAWN]: 'p', [KNIGHT]: 'n', [BISHOP]: 'b', [ROOK]: 'r', [QUEEN]: 'q', [KING]: 'k' };
const TYPE_OF_LETTER = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
export const promoOfLetter = (letter) => ({ n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN })[letter] ?? 0;

// 動かしたり取られたりしたマスで消えるキャスリングの権利（1 白の短い側・2 白の長い側・4 黒の短い側・8 黒の長い側）
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0] = 15 & ~2;
CASTLE_MASK[4] = 15 & ~3;
CASTLE_MASK[7] = 15 & ~1;
CASTLE_MASK[112] = 15 & ~8;
CASTLE_MASK[116] = 15 & ~12;
CASTLE_MASK[119] = 15 & ~4;

// Zobrist の乱数（固定のシードから作るので、どの端末でも同じ）
function zobristTable(count) {
    let state = 0x2545F491;
    const next = () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) | 0;
    };
    const lo = new Int32Array(count);
    const hi = new Int32Array(count);
    for (let i = 0; i < count; i++) {
        lo[i] = next();
        hi[i] = next();
    }
    return { lo, hi };
}
// 駒（16）× マス（128）、手番、キャスリングの権利（16）、アンパッサンの列（8）
const Z = zobristTable(16 * 128 + 1 + 16 + 8);
const Z_SIDE = 16 * 128;
const Z_CASTLE = Z_SIDE + 1;
const Z_EP = Z_CASTLE + 16;

const STACK = 8; // 1手ごとに戻すための値の数

export class Position {
    constructor(fen = START_FEN) {
        this.board = new Int8Array(128);
        this.turn = WHITE;
        this.castling = 0;
        this.ep = -1;
        this.halfmove = 0;
        this.fullmove = 1;
        this.kings = [-1, -1];
        this.hashLo = 0;
        this.hashHi = 0;
        this.undo = new Int32Array(STACK * 1024);
        this.sp = 0;
        this.setFen(fen);
    }

    // ---- FEN ----

    setFen(fen) {
        const parts = String(fen).trim().split(/\s+/);
        if (parts.length < 4) throw new Error('FEN が正しくありません');
        const [placement, side, castling, ep, half = '0', full = '1'] = parts;
        this.board.fill(0);
        this.kings = [-1, -1];
        const rows = placement.split('/');
        if (rows.length !== 8) throw new Error('FEN の段の数が正しくありません');
        rows.forEach((row, i) => {
            const rank = 7 - i;
            let file = 0;
            for (const ch of row) {
                if (/\d/.test(ch)) {
                    file += Number(ch);
                    continue;
                }
                const type = TYPE_OF_LETTER[ch.toLowerCase()];
                if (!type || file > 7) throw new Error('FEN の駒が正しくありません');
                const color = ch === ch.toUpperCase() ? WHITE : BLACK;
                const sq = rank * 16 + file;
                this.board[sq] = pieceOf(color, type);
                if (type === KING) this.kings[color] = sq;
                file++;
            }
            if (file !== 8) throw new Error('FEN の段の長さが正しくありません');
        });
        if (this.kings[WHITE] < 0 || this.kings[BLACK] < 0) throw new Error('キングがいません');
        this.turn = side === 'b' ? BLACK : WHITE;
        this.castling = 0;
        if (castling.includes('K') && this.board[4] === pieceOf(WHITE, KING) && this.board[7] === pieceOf(WHITE, ROOK)) this.castling |= 1;
        if (castling.includes('Q') && this.board[4] === pieceOf(WHITE, KING) && this.board[0] === pieceOf(WHITE, ROOK)) this.castling |= 2;
        if (castling.includes('k') && this.board[116] === pieceOf(BLACK, KING) && this.board[119] === pieceOf(BLACK, ROOK)) this.castling |= 4;
        if (castling.includes('q') && this.board[116] === pieceOf(BLACK, KING) && this.board[112] === pieceOf(BLACK, ROOK)) this.castling |= 8;
        this.ep = -1;
        if (ep !== '-' && isSquareName(ep)) {
            const sq = sqOf(ep);
            if (this.epCapturable(sq + (this.turn === WHITE ? -16 : 16), this.turn)) this.ep = sq;
        }
        this.halfmove = Number(half) || 0;
        this.fullmove = Number(full) || 1;
        this.sp = 0;
        this.computeHash();
        return this;
    }

    fen() {
        const rows = [];
        for (let rank = 7; rank >= 0; rank--) {
            let row = '';
            let empty = 0;
            for (let file = 0; file < 8; file++) {
                const p = this.board[rank * 16 + file];
                if (!p) {
                    empty++;
                    continue;
                }
                if (empty) row += empty;
                empty = 0;
                const letter = LETTER[typeOf(p)];
                row += colorOf(p) === WHITE ? letter.toUpperCase() : letter;
            }
            rows.push(row + (empty || ''));
        }
        const castling = ['K', 'Q', 'k', 'q'].filter((_, i) => this.castling & (1 << i)).join('') || '-';
        return `${rows.join('/')} ${this.turn === WHITE ? 'w' : 'b'} ${castling} ${this.ep < 0 ? '-' : sqName(this.ep)} ${this.halfmove} ${this.fullmove}`;
    }

    computeHash() {
        let lo = 0;
        let hi = 0;
        for (let sq = 0; sq < 128; sq++) {
            const p = this.board[sq];
            if (onBoard(sq) && p) {
                lo ^= Z.lo[p * 128 + sq];
                hi ^= Z.hi[p * 128 + sq];
            }
        }
        if (this.turn === BLACK) {
            lo ^= Z.lo[Z_SIDE];
            hi ^= Z.hi[Z_SIDE];
        }
        lo ^= Z.lo[Z_CASTLE + this.castling];
        hi ^= Z.hi[Z_CASTLE + this.castling];
        if (this.ep >= 0) {
            lo ^= Z.lo[Z_EP + (this.ep & 7)];
            hi ^= Z.hi[Z_EP + (this.ep & 7)];
        }
        this.hashLo = lo;
        this.hashHi = hi;
    }

    // pawnSq に2マス進んだ（相手の）ポーンを、color の側のポーンが隣から取れるか
    epCapturable(pawnSq, color) {
        const mine = pieceOf(color, PAWN);
        return (onBoard(pawnSq + 1) && this.board[pawnSq + 1] === mine) || (onBoard(pawnSq - 1) && this.board[pawnSq - 1] === mine);
    }

    // ---- 攻撃 ----

    // sq が by の側の駒に攻撃されているか
    attacked(sq, by) {
        const b = this.board;
        if (by === WHITE) {
            const wp = pieceOf(WHITE, PAWN);
            if ((onBoard(sq - 15) && b[sq - 15] === wp) || (onBoard(sq - 17) && b[sq - 17] === wp)) return true;
        } else {
            const bp = pieceOf(BLACK, PAWN);
            if ((onBoard(sq + 15) && b[sq + 15] === bp) || (onBoard(sq + 17) && b[sq + 17] === bp)) return true;
        }
        const knight = pieceOf(by, KNIGHT);
        for (let i = 0; i < 8; i++) {
            const s = sq + KNIGHT_D[i];
            if (onBoard(s) && b[s] === knight) return true;
        }
        const king = pieceOf(by, KING);
        for (let i = 0; i < 8; i++) {
            const s = sq + KING_D[i];
            if (onBoard(s) && b[s] === king) return true;
        }
        const rook = pieceOf(by, ROOK);
        const bishop = pieceOf(by, BISHOP);
        const queen = pieceOf(by, QUEEN);
        for (let i = 0; i < 4; i++) {
            const d = ROOK_D[i];
            for (let s = sq + d; onBoard(s); s += d) {
                const p = b[s];
                if (!p) continue;
                if (p === rook || p === queen) return true;
                break;
            }
        }
        for (let i = 0; i < 4; i++) {
            const d = BISHOP_D[i];
            for (let s = sq + d; onBoard(s); s += d) {
                const p = b[s];
                if (!p) continue;
                if (p === bishop || p === queen) return true;
                break;
            }
        }
        return false;
    }

    inCheck(color = this.turn) {
        return this.attacked(this.kings[color], color ^ 1);
    }

    // ---- 指し手の生成 ----

    // 駒の動きとしては正しい手（自分のキングが取られる手を含む）を out に足す。capturesOnly なら、取る手とクイーンへの昇格だけ
    generate(out = [], capturesOnly = false) {
        const b = this.board;
        const us = this.turn;
        const them = us ^ 1;
        const forward = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const lastRank = us === WHITE ? 7 : 0;
        for (let from = 0; from < 128; from++) {
            if (!onBoard(from)) {
                from += 7;
                continue;
            }
            const p = b[from];
            if (!p || colorOf(p) !== us) continue;
            const type = typeOf(p);
            if (type === PAWN) {
                const one = from + forward;
                const promotes = (one >> 4) === lastRank;
                if (onBoard(one) && !b[one]) {
                    if (promotes) {
                        out.push(encodeMove(from, one, QUEEN));
                        if (!capturesOnly) out.push(encodeMove(from, one, ROOK), encodeMove(from, one, BISHOP), encodeMove(from, one, KNIGHT));
                    } else if (!capturesOnly) {
                        out.push(encodeMove(from, one));
                        const two = one + forward;
                        if ((from >> 4) === startRank && !b[two]) out.push(encodeMove(from, two, 0, FLAG_DOUBLE));
                    }
                }
                for (const side of [-1, 1]) {
                    const to = one + side;
                    if (!onBoard(to)) continue;
                    const target = b[to];
                    if (target && colorOf(target) === them) {
                        if (promotes) {
                            out.push(encodeMove(from, to, QUEEN));
                            if (!capturesOnly) out.push(encodeMove(from, to, ROOK), encodeMove(from, to, BISHOP), encodeMove(from, to, KNIGHT));
                        } else {
                            out.push(encodeMove(from, to));
                        }
                    } else if (to === this.ep) {
                        out.push(encodeMove(from, to, 0, FLAG_EP));
                    }
                }
                continue;
            }
            if (type === KNIGHT || type === KING) {
                const dirs = type === KNIGHT ? KNIGHT_D : KING_D;
                for (let i = 0; i < 8; i++) {
                    const to = from + dirs[i];
                    if (!onBoard(to)) continue;
                    const target = b[to];
                    if (target ? colorOf(target) === them : !capturesOnly) out.push(encodeMove(from, to));
                }
                continue;
            }
            const dirs = type === BISHOP ? BISHOP_D : type === ROOK ? ROOK_D : KING_D;
            for (let i = 0; i < dirs.length; i++) {
                const d = dirs[i];
                for (let to = from + d; onBoard(to); to += d) {
                    const target = b[to];
                    if (!target) {
                        if (!capturesOnly) out.push(encodeMove(from, to));
                        continue;
                    }
                    if (colorOf(target) === them) out.push(encodeMove(from, to));
                    break;
                }
            }
        }
        if (!capturesOnly) this.generateCastling(out);
        return out;
    }

    generateCastling(out) {
        const b = this.board;
        const us = this.turn;
        const them = us ^ 1;
        const k = us === WHITE ? 4 : 116;
        const shortRight = us === WHITE ? 1 : 4;
        const longRight = us === WHITE ? 2 : 8;
        if (!(this.castling & (shortRight | longRight)) || b[k] !== pieceOf(us, KING)) return;
        if (this.attacked(k, them)) return;
        const rook = pieceOf(us, ROOK);
        if ((this.castling & shortRight) && !b[k + 1] && !b[k + 2] && b[k + 3] === rook
            && !this.attacked(k + 1, them) && !this.attacked(k + 2, them)) {
            out.push(encodeMove(k, k + 2, 0, FLAG_CASTLE));
        }
        if ((this.castling & longRight) && !b[k - 1] && !b[k - 2] && !b[k - 3] && b[k - 4] === rook
            && !this.attacked(k - 1, them) && !this.attacked(k - 2, them)) {
            out.push(encodeMove(k, k - 2, 0, FLAG_CASTLE));
        }
    }

    // 合法手（指したあとに自分のキングが攻撃されない手）
    legalMoves() {
        const moves = this.generate([]);
        const legal = [];
        for (const m of moves) {
            if (this.make(m)) {
                legal.push(m);
                this.unmake();
            }
        }
        return legal;
    }

    // ---- 指す・戻す ----

    // 指す。自分のキングが取られる形になったら戻して false を返す（そのときは何も変わらない）
    make(m) {
        this.makeUnchecked(m);
        if (this.attacked(this.kings[this.turn ^ 1], this.turn)) {
            this.unmake();
            return false;
        }
        return true;
    }

    makeUnchecked(m) {
        const b = this.board;
        const from = m & 127;
        const to = (m >> 7) & 127;
        const promo = (m >> 14) & 7;
        const flag = (m >> 17) & 3;
        const us = this.turn;
        const p = b[from];
        let capSq = to;
        if (flag === FLAG_EP) capSq = to + (us === WHITE ? -16 : 16);
        const captured = b[capSq];

        const u = this.undo;
        const s = this.sp;
        u[s] = m;
        u[s + 1] = captured;
        u[s + 2] = this.castling;
        u[s + 3] = this.ep;
        u[s + 4] = this.halfmove;
        u[s + 5] = this.hashLo;
        u[s + 6] = this.hashHi;
        u[s + 7] = this.fullmove;
        this.sp = s + STACK;

        let lo = this.hashLo;
        let hi = this.hashHi;
        if (this.ep >= 0) {
            lo ^= Z.lo[Z_EP + (this.ep & 7)];
            hi ^= Z.hi[Z_EP + (this.ep & 7)];
        }
        lo ^= Z.lo[Z_CASTLE + this.castling];
        hi ^= Z.hi[Z_CASTLE + this.castling];
        if (captured) {
            b[capSq] = 0;
            lo ^= Z.lo[captured * 128 + capSq];
            hi ^= Z.hi[captured * 128 + capSq];
        }
        b[from] = 0;
        lo ^= Z.lo[p * 128 + from];
        hi ^= Z.hi[p * 128 + from];
        const placed = promo ? pieceOf(us, promo) : p;
        b[to] = placed;
        lo ^= Z.lo[placed * 128 + to];
        hi ^= Z.hi[placed * 128 + to];
        if (flag === FLAG_CASTLE) {
            const rookFrom = to > from ? from + 3 : from - 4;
            const rookTo = to > from ? from + 1 : from - 1;
            const rook = b[rookFrom];
            b[rookFrom] = 0;
            b[rookTo] = rook;
            lo ^= Z.lo[rook * 128 + rookFrom] ^ Z.lo[rook * 128 + rookTo];
            hi ^= Z.hi[rook * 128 + rookFrom] ^ Z.hi[rook * 128 + rookTo];
        }
        if ((p & 7) === KING) this.kings[us] = to;
        this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
        lo ^= Z.lo[Z_CASTLE + this.castling];
        hi ^= Z.hi[Z_CASTLE + this.castling];
        this.ep = -1;
        if (flag === FLAG_DOUBLE && this.epCapturable(to, us ^ 1)) {
            this.ep = (from + to) >> 1;
            lo ^= Z.lo[Z_EP + (this.ep & 7)];
            hi ^= Z.hi[Z_EP + (this.ep & 7)];
        }
        this.halfmove = ((p & 7) === PAWN || captured) ? 0 : this.halfmove + 1;
        if (us === BLACK) this.fullmove++;
        this.turn = us ^ 1;
        lo ^= Z.lo[Z_SIDE];
        hi ^= Z.hi[Z_SIDE];
        this.hashLo = lo;
        this.hashHi = hi;
    }

    unmake() {
        const u = this.undo;
        const s = this.sp - STACK;
        this.sp = s;
        const m = u[s];
        const b = this.board;
        const from = m & 127;
        const to = (m >> 7) & 127;
        const promo = (m >> 14) & 7;
        const flag = (m >> 17) & 3;
        const us = this.turn ^ 1;
        this.turn = us;
        const moved = promo ? pieceOf(us, PAWN) : b[to];
        b[from] = moved;
        b[to] = 0;
        const captured = u[s + 1];
        if (flag === FLAG_EP) b[to + (us === WHITE ? -16 : 16)] = captured;
        else b[to] = captured;
        if (flag === FLAG_CASTLE) {
            const rookFrom = to > from ? from + 3 : from - 4;
            const rookTo = to > from ? from + 1 : from - 1;
            b[rookFrom] = b[rookTo];
            b[rookTo] = 0;
        }
        if ((moved & 7) === KING) this.kings[us] = from;
        this.castling = u[s + 2];
        this.ep = u[s + 3];
        this.halfmove = u[s + 4];
        this.hashLo = u[s + 5];
        this.hashHi = u[s + 6];
        this.fullmove = u[s + 7];
    }

    // 手番だけを渡す（CPU の読みのヌルムーブ）
    makeNull() {
        const u = this.undo;
        const s = this.sp;
        u[s] = -1;
        u[s + 3] = this.ep;
        u[s + 4] = this.halfmove;
        u[s + 5] = this.hashLo;
        u[s + 6] = this.hashHi;
        this.sp = s + STACK;
        if (this.ep >= 0) {
            this.hashLo ^= Z.lo[Z_EP + (this.ep & 7)];
            this.hashHi ^= Z.hi[Z_EP + (this.ep & 7)];
        }
        this.ep = -1;
        this.halfmove++;
        this.turn ^= 1;
        this.hashLo ^= Z.lo[Z_SIDE];
        this.hashHi ^= Z.hi[Z_SIDE];
    }

    unmakeNull() {
        const u = this.undo;
        const s = this.sp - STACK;
        this.sp = s;
        this.turn ^= 1;
        this.ep = u[s + 3];
        this.halfmove = u[s + 4];
        this.hashLo = u[s + 5];
        this.hashHi = u[s + 6];
    }

    // ---- 局面の性質 ----

    // 駒が足りず、どちらもチェックメイトできない（キングだけ、キングとビショップかナイト1つ、ビショップが全部同じ色のマス）
    insufficientMaterial() {
        let minors = 0;
        let knights = 0;
        const bishopColors = new Set();
        for (let sq = 0; sq < 128; sq++) {
            if (!onBoard(sq)) {
                sq += 7;
                continue;
            }
            const p = this.board[sq];
            if (!p) continue;
            const type = typeOf(p);
            if (type === PAWN || type === ROOK || type === QUEEN) return false;
            if (type === KNIGHT) {
                knights++;
                minors++;
            } else if (type === BISHOP) {
                minors++;
                bishopColors.add(((sq >> 4) + (sq & 7)) & 1);
            }
        }
        if (minors <= 1) return true;
        return knights === 0 && bishopColors.size === 1;
    }

    // 同じ局面かどうかの比べ（FIDE 9.2：同じ手番・同じ駒の配置・同じ指せる手。キャスリングとアンパッサンの権利を含む）
    // アンパッサンは、実際に合法に取れるときだけ数える
    repetitionKey(legal = null) {
        let ep = '-';
        if (this.ep >= 0) {
            const moves = legal ?? this.legalMoves();
            if (moves.some(m => moveFlag(m) === FLAG_EP)) ep = sqName(this.ep);
        }
        return this.fen().split(' ').slice(0, 3).join(' ') + ' ' + ep;
    }

    // 64 マスの配列（0 が a8、63 が h1。画面の上から下へ）。白は大文字、黒は小文字、空きは ''
    toArray() {
        const out = [];
        for (let rank = 7; rank >= 0; rank--) {
            for (let file = 0; file < 8; file++) {
                const p = this.board[rank * 16 + file];
                out.push(p ? (colorOf(p) === WHITE ? LETTER[typeOf(p)].toUpperCase() : LETTER[typeOf(p)]) : '');
            }
        }
        return out;
    }
}

// ---- 表記 ----

export const moveToUci = (m) => sqName(moveFrom(m)) + sqName(moveTo(m)) + (movePromo(m) ? LETTER[movePromo(m)] : '');

// 合法手の中から、UCI の文字（e2e4・e7e8q）に合う手を探す
export function findMove(legal, from, to, promo = '') {
    const f = sqOf(from);
    const t = sqOf(to);
    const pr = promo ? promoOfLetter(promo) : 0;
    return legal.find(m => moveFrom(m) === f && moveTo(m) === t && movePromo(m) === pr) ?? null;
}

// 代数式表記（SAN）。指す前の局面と、その局面の合法手を渡す
export function toSan(pos, m, legal = pos.legalMoves()) {
    const from = moveFrom(m);
    const to = moveTo(m);
    const flag = moveFlag(m);
    const p = pos.board[from];
    const type = typeOf(p);
    let san;
    if (flag === FLAG_CASTLE) {
        san = to > from ? 'O-O' : 'O-O-O';
    } else {
        const capture = !!pos.board[to] || flag === FLAG_EP;
        if (type === PAWN) {
            san = (capture ? `${'abcdefgh'[from & 7]}x` : '') + sqName(to);
            if (movePromo(m)) san += `=${LETTER[movePromo(m)].toUpperCase()}`;
        } else {
            // 同じ種類の駒が同じマスへ行けるときは、列か段か両方を足して区別する
            const rivals = legal.filter(o => o !== m && moveTo(o) === to && pos.board[moveFrom(o)] === p).map(moveFrom);
            let dis = '';
            if (rivals.length) {
                const sameFile = rivals.some(s => (s & 7) === (from & 7));
                const sameRank = rivals.some(s => (s >> 4) === (from >> 4));
                if (!sameFile) dis = 'abcdefgh'[from & 7];
                else if (!sameRank) dis = String((from >> 4) + 1);
                else dis = sqName(from);
            }
            san = LETTER[type].toUpperCase() + dis + (capture ? 'x' : '') + sqName(to);
        }
    }
    pos.makeUnchecked(m);
    if (pos.inCheck()) san += pos.legalMoves().length ? '+' : '#';
    pos.unmake();
    return san;
}

// 枝の数を数える（指し手の生成の正しさを、知られた値と比べて確かめる）
export function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = pos.generate([]);
    let count = 0;
    for (const m of moves) {
        if (!pos.make(m)) continue;
        count += depth === 1 ? 1 : perft(pos, depth - 1);
        pos.unmake();
    }
    return count;
}
