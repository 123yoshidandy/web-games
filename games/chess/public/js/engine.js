/**
 * CPU の読み（DOM に依存しない）
 *
 * - ネガマックスのアルファベータ法（PVS）を、1手ずつ深くしながら繰り返す（反復深化）
 * - 末端は、駒を取る手だけを読み進めてから評価する（静止探索）。取り合いの途中で評価して、駒をただで渡す手を選ばないように
 * - 手の順番：前の読みの最善手 → 取る手（価値の高い駒を、価値の低い駒で取る順）→ キラー → よく効いた手（ヒストリー）
 * - 置換表・ヌルムーブ・後ろの手を浅く読む（LMR）・チェックの延長で、同じ局面の数で深く読む
 * - 同じ局面の繰り返しと 50手は、読みの中でも引き分け（0点）として扱う
 * - 読む量は局面の数（nodeLimit）で打ち切る。時間は使わない（端末の速さで手が変わらないように。テストで再現できるように）
 *   打ち切った深さの読みは捨て、前の深さの答えを使う。時間（maxMs）は、思わぬ重さで止まらないための安全弁だけ
 * - 置換表などは、読むたびに空にする（前に読んだ局面で答えが変わらないように）
 */

import {
    Position, WHITE, BLACK, PAWN, BISHOP, ROOK, QUEEN, KING,
    moveTo, moveFrom, movePromo, moveFlag, FLAG_EP, findMove
} from './rules.js';

export const MATE = 30000;
const INF = 32000;
const MAX_PLY = 64;

// ---- 評価 ----

const VALUE = [0, 100, 320, 330, 500, 900, 0];
const VALUE_EG = [0, 120, 300, 320, 520, 940, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];

// 駒の位置の点（白から見た表。1行目が8段目）
const PST_MG = [
    null,
    [ // ポーン
        0, 0, 0, 0, 0, 0, 0, 0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
        5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 5, 20, 20, 0, 0, 0,
        5, -5, -10, 0, 0, -10, -5, 5,
        5, 10, 10, -20, -20, 10, 10, 5,
        0, 0, 0, 0, 0, 0, 0, 0],
    [ // ナイト
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20, 0, 0, 0, 0, -20, -40,
        -30, 0, 10, 15, 15, 10, 0, -30,
        -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30,
        -30, 5, 10, 15, 15, 10, 5, -30,
        -40, -20, 0, 5, 5, 0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50],
    [ // ビショップ
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 10, 10, 5, 0, -10,
        -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10,
        -10, 10, 10, 10, 10, 10, 10, -10,
        -10, 5, 0, 0, 0, 0, 5, -10,
        -20, -10, -10, -10, -10, -10, -10, -20],
    [ // ルーク
        0, 0, 0, 0, 0, 0, 0, 0,
        5, 10, 10, 10, 10, 10, 10, 5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        0, 0, 0, 5, 5, 0, 0, 0],
    [ // クイーン
        -20, -10, -10, -5, -5, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 5, 5, 5, 0, -10,
        -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5,
        -10, 5, 5, 5, 5, 5, 0, -10,
        -10, 0, 5, 0, 0, 0, 0, -10,
        -20, -10, -10, -5, -5, -10, -10, -20],
    [ // キング（序盤・中盤は隅に囲う）
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -20, -30, -30, -40, -40, -30, -30, -20,
        -10, -20, -20, -20, -20, -20, -20, -10,
        20, 20, 0, 0, 0, 0, 20, 20,
        20, 30, 10, 0, 0, 10, 30, 20]
];
const PST_EG = [
    null,
    [ // ポーン（終盤は進むほど良い）
        0, 0, 0, 0, 0, 0, 0, 0,
        80, 80, 80, 80, 80, 80, 80, 80,
        50, 50, 50, 50, 50, 50, 50, 50,
        30, 30, 30, 30, 30, 30, 30, 30,
        15, 15, 15, 15, 15, 15, 15, 15,
        5, 5, 5, 5, 5, 5, 5, 5,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0],
    PST_MG[2],
    PST_MG[3],
    PST_MG[4],
    PST_MG[5],
    [ // キング（終盤は真ん中へ）
        -50, -40, -30, -20, -20, -30, -40, -50,
        -30, -20, -10, 0, 0, -10, -20, -30,
        -30, -10, 20, 30, 30, 20, -10, -30,
        -30, -10, 30, 40, 40, 30, -10, -30,
        -30, -10, 30, 40, 40, 30, -10, -30,
        -30, -10, 20, 30, 30, 20, -10, -30,
        -30, -30, 0, 0, 0, 0, -30, -30,
        -50, -30, -30, -30, -30, -30, -30, -50]
];
const PASSED = [0, 10, 15, 25, 45, 75, 110, 0]; // 自分から見た段ごとの、通ったポーンの点（終盤）

const pawnMax = new Int8Array(8);  // 黒のポーンの、列ごとの一番上の段（なければ -1）
const pawnMin = new Int8Array(8);  // 白のポーンの、列ごとの一番下の段（なければ 8）
const pawnCount = [new Int8Array(8), new Int8Array(8)];

// 手番の側から見た点（センチポーン）
export function evaluate(pos) {
    const b = pos.board;
    let mgW = 0; let mgB = 0; let egW = 0; let egB = 0;
    let phase = 0;
    let bishopsW = 0; let bishopsB = 0;
    let matW = 0; let matB = 0;
    let pawnsW = 0; let pawnsB = 0;
    pawnMax.fill(-1);
    pawnMin.fill(8);
    pawnCount[0].fill(0);
    pawnCount[1].fill(0);
    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) {
            sq += 7;
            continue;
        }
        const p = b[sq];
        if (!p) continue;
        const type = p & 7;
        const rank = sq >> 4;
        const file = sq & 7;
        phase += PHASE[type];
        if (p < 8) {
            const idx = (7 - rank) * 8 + file;
            mgW += VALUE[type] + PST_MG[type][idx];
            egW += VALUE_EG[type] + PST_EG[type][idx];
            if (type === PAWN) {
                pawnsW++;
                pawnCount[0][file]++;
                if (rank < pawnMin[file]) pawnMin[file] = rank;
            } else if (type !== KING) {
                matW += VALUE[type];
                if (type === BISHOP) bishopsW++;
            }
        } else {
            const idx = rank * 8 + file;
            mgB += VALUE[type] + PST_MG[type][idx];
            egB += VALUE_EG[type] + PST_EG[type][idx];
            if (type === PAWN) {
                pawnsB++;
                pawnCount[1][file]++;
                if (rank > pawnMax[file]) pawnMax[file] = rank;
            } else if (type !== KING) {
                matB += VALUE[type];
                if (type === BISHOP) bishopsB++;
            }
        }
    }
    if (bishopsW >= 2) { mgW += 30; egW += 45; }
    if (bishopsB >= 2) { mgB += 30; egB += 45; }

    // ポーンの形（二重・孤立・通ったポーン）とルークの列
    for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) {
            sq += 7;
            continue;
        }
        const p = b[sq];
        if (!p) continue;
        const type = p & 7;
        const rank = sq >> 4;
        const file = sq & 7;
        if (type === PAWN) {
            const white = p < 8;
            const counts = pawnCount[white ? 0 : 1];
            const isolated = (file === 0 || !counts[file - 1]) && (file === 7 || !counts[file + 1]);
            let pen = isolated ? 12 : 0;
            if (counts[file] > 1) pen += 10;
            let passed = true;
            for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
                if (white ? pawnMax[f] > rank : pawnMin[f] < rank) {
                    passed = false;
                    break;
                }
            }
            const bonus = passed ? PASSED[white ? rank : 7 - rank] : 0;
            if (white) {
                mgW += (bonus >> 1) - pen;
                egW += bonus - pen;
            } else {
                mgB += (bonus >> 1) - pen;
                egB += bonus - pen;
            }
        } else if (type === ROOK) {
            const own = pawnCount[p < 8 ? 0 : 1][file];
            const other = pawnCount[p < 8 ? 1 : 0][file];
            const bonus = own ? 0 : other ? 10 : 20;
            if (p < 8) mgW += bonus;
            else mgB += bonus;
        }
    }

    if (phase > 24) phase = 24;
    let score = ((mgW - mgB) * phase + (egW - egB) * (24 - phase)) / 24;

    // 駒が少ない終盤：勝っている側は、相手のキングを隅へ追い、自分のキングを近づける
    const diff = (matW + pawnsW * 100) - (matB + pawnsB * 100);
    if (phase <= 8 && Math.abs(diff) >= 300) {
        const strong = diff > 0 ? WHITE : BLACK;
        const loser = pos.kings[strong ^ 1];
        const winnerKing = pos.kings[strong];
        const lf = loser & 7; const lr = loser >> 4;
        const center = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4);
        const dist = Math.abs(lf - (winnerKing & 7)) + Math.abs(lr - (winnerKing >> 4));
        const mop = center * 10 + (14 - dist) * 4;
        score += strong === WHITE ? mop : -mop;
    }
    // ポーンがなく、残りが小駒1つ分しか多くない側は勝てない
    if (score > 0 && pawnsW === 0 && matW - matB <= 330) score /= 8;
    if (score < 0 && pawnsB === 0 && matB - matW <= 330) score /= 8;

    score = Math.round(score);
    return (pos.turn === WHITE ? score : -score) + 10;
}

// ---- 読み ----

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

class Searcher {
    constructor() {
        this.ttHi = new Int32Array(TT_SIZE);
        this.ttDepth = new Int8Array(TT_SIZE);
        this.ttFlag = new Uint8Array(TT_SIZE);
        this.ttScore = new Int32Array(TT_SIZE);
        this.ttMove = new Int32Array(TT_SIZE);
        this.killers = new Int32Array(MAX_PLY * 2 + 4);
        this.history = new Int32Array(16 * 128);
        this.moveBuf = Array.from({ length: MAX_PLY + 2 }, () => []);
        this.scoreBuf = Array.from({ length: MAX_PLY + 2 }, () => new Int32Array(256));
        this.keysLo = new Int32Array(1024);
        this.keysHi = new Int32Array(1024);
    }

    reset(pos, gameKeys, opt) {
        this.pos = pos;
        this.ttFlag.fill(0);
        this.killers.fill(0);
        this.history.fill(0);
        this.nodes = 0;
        this.limit = opt.nodeLimit ?? 100000;
        this.deadline = Date.now() + (opt.maxMs ?? 8000);
        this.abort = false;
        this.nullMove = opt.nullMove !== false;
        // ここまでの局面の指紋（最後が今の局面）
        this.keyCount = 0;
        const start = Math.max(0, gameKeys.length - 512);
        for (let i = start; i < gameKeys.length; i++) {
            this.keysLo[this.keyCount] = gameKeys[i][0];
            this.keysHi[this.keyCount] = gameKeys[i][1];
            this.keyCount++;
        }
    }

    tick() {
        if (++this.nodes > this.limit || ((this.nodes & 4095) === 0 && Date.now() > this.deadline)) {
            this.abort = true;
            return true;
        }
        return false;
    }

    pushKey() {
        this.keysLo[this.keyCount] = this.pos.hashLo;
        this.keysHi[this.keyCount] = this.pos.hashHi;
        this.keyCount++;
    }

    // 同じ局面が前にあったか（駒を取るかポーンを動かすまでの範囲。同じ手番の局面だけ）
    repeated() {
        const pos = this.pos;
        const last = this.keyCount - 1;
        const stop = Math.max(0, last - pos.halfmove);
        for (let i = last - 2; i >= stop; i -= 2) {
            if (this.keysLo[i] === pos.hashLo && this.keysHi[i] === pos.hashHi) return true;
        }
        return false;
    }

    orderMoves(moves, scores, ply, ttMove) {
        const b = this.pos.board;
        const k1 = this.killers[ply * 2];
        const k2 = this.killers[ply * 2 + 1];
        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            if (m === ttMove) {
                scores[i] = 1000000;
                continue;
            }
            const to = moveTo(m);
            const victim = moveFlag(m) === FLAG_EP ? PAWN : (b[to] & 7);
            const promo = movePromo(m);
            if (victim || promo) {
                scores[i] = 100000 + VALUE[victim] * 10 - (b[moveFrom(m)] & 7) + (promo === QUEEN ? 9000 : promo ? -50000 : 0);
            } else if (m === k1) {
                scores[i] = 90000;
            } else if (m === k2) {
                scores[i] = 80000;
            } else {
                scores[i] = this.history[b[moveFrom(m)] * 128 + to];
            }
        }
    }

    // i 番目以降で一番点の高い手を i 番目に持ってくる
    pick(moves, scores, i) {
        let best = i;
        for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[best]) best = j;
        if (best !== i) {
            const m = moves[i]; moves[i] = moves[best]; moves[best] = m;
            const s = scores[i]; scores[i] = scores[best]; scores[best] = s;
        }
        return moves[i];
    }

    hasPieces(color) {
        const b = this.pos.board;
        for (let sq = 0; sq < 128; sq++) {
            if (sq & 0x88) {
                sq += 7;
                continue;
            }
            const p = b[sq];
            if (p && (p >> 3) === color && (p & 7) !== PAWN && (p & 7) !== KING) return true;
        }
        return false;
    }

    quiesce(alpha, beta, ply) {
        if (this.tick()) return 0;
        const pos = this.pos;
        const stand = evaluate(pos);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        if (ply >= MAX_PLY) return stand;
        const moves = this.moveBuf[ply];
        moves.length = 0;
        pos.generate(moves, true);
        const scores = this.scoreBuf[ply];
        this.orderMoves(moves, scores, ply, 0);
        const b = pos.board;
        for (let i = 0; i < moves.length; i++) {
            const m = this.pick(moves, scores, i);
            // 取っても届かない手は読まない（デルタの枝刈り）
            if (!movePromo(m)) {
                const victim = moveFlag(m) === FLAG_EP ? PAWN : (b[moveTo(m)] & 7);
                if (stand + VALUE[victim] + 200 < alpha) continue;
            }
            if (!pos.make(m)) continue;
            const score = -this.quiesce(-beta, -alpha, ply + 1);
            pos.unmake();
            if (this.abort) return 0;
            if (score >= beta) return score;
            if (score > alpha) alpha = score;
        }
        return alpha;
    }

    negamax(depth, alpha, beta, ply, allowNull) {
        const pos = this.pos;
        if (ply > 0) {
            if (pos.halfmove >= 100 || this.repeated() || pos.insufficientMaterial()) return 0;
            // これより良い・悪いメイトはない
            const mateAlpha = Math.max(alpha, -MATE + ply);
            const mateBeta = Math.min(beta, MATE - ply - 1);
            if (mateAlpha >= mateBeta) return mateAlpha;
        }
        const inCheck = pos.inCheck();
        if (inCheck) depth++;
        if (depth <= 0) return this.quiesce(alpha, beta, ply);
        if (this.tick()) return 0;
        if (ply >= MAX_PLY) return evaluate(pos);

        const slot = pos.hashLo & TT_MASK;
        let ttMove = 0;
        if (this.ttFlag[slot] && this.ttHi[slot] === pos.hashHi) {
            ttMove = this.ttMove[slot];
            if (ply > 0 && this.ttDepth[slot] >= depth) {
                let s = this.ttScore[slot];
                if (s > MATE - 200) s -= ply;
                else if (s < -MATE + 200) s += ply;
                const flag = this.ttFlag[slot];
                if (flag === EXACT || (flag === LOWER && s >= beta) || (flag === UPPER && s <= alpha)) return s;
            }
        }

        const pv = beta - alpha > 1;
        // 手番を渡しても相手が届かないなら、深く読まずに切る（ヌルムーブ。駒が少ないときはツークツワンクがあるのでしない）
        if (this.nullMove && allowNull && !pv && !inCheck && depth >= 3 && Math.abs(beta) < MATE - 200
            && this.hasPieces(pos.turn) && evaluate(pos) >= beta) {
            pos.makeNull();
            this.pushKey();
            const score = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
            this.keyCount--;
            pos.unmakeNull();
            if (this.abort) return 0;
            if (score >= beta) return beta;
        }

        const moves = this.moveBuf[ply];
        moves.length = 0;
        pos.generate(moves);
        const scores = this.scoreBuf[ply];
        this.orderMoves(moves, scores, ply, ttMove);
        const alphaStart = alpha;
        let best = -INF;
        let bestMove = 0;
        let legal = 0;
        const b = pos.board;
        for (let i = 0; i < moves.length; i++) {
            const m = this.pick(moves, scores, i);
            const quiet = !b[moveTo(m)] && !movePromo(m) && moveFlag(m) !== FLAG_EP;
            const piece = b[moveFrom(m)];
            if (!pos.make(m)) continue;
            legal++;
            this.pushKey();
            let score;
            if (legal === 1) {
                score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
            } else {
                const givesCheck = pos.inCheck();
                const reduce = depth >= 3 && legal > 3 && quiet && !inCheck && !givesCheck
                    && m !== this.killers[ply * 2] && m !== this.killers[ply * 2 + 1] ? 1 + (legal > 10 && depth >= 5 ? 1 : 0) : 0;
                score = -this.negamax(depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, true);
                if (score > alpha && reduce) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
                if (score > alpha && score < beta) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
            }
            this.keyCount--;
            pos.unmake();
            if (this.abort) return 0;
            if (score > best) {
                best = score;
                bestMove = m;
                if (ply === 0) this.rootBest = m;
            }
            if (score > alpha) alpha = score;
            if (alpha >= beta) {
                if (quiet) {
                    if (this.killers[ply * 2] !== m) {
                        this.killers[ply * 2 + 1] = this.killers[ply * 2];
                        this.killers[ply * 2] = m;
                    }
                    const h = piece * 128 + moveTo(m);
                    this.history[h] = Math.min(70000, this.history[h] + depth * depth);
                }
                break;
            }
        }
        if (!legal) return inCheck ? -MATE + ply : 0;

        let stored = best;
        if (stored > MATE - 200) stored += ply;
        else if (stored < -MATE + 200) stored -= ply;
        this.ttHi[slot] = pos.hashHi;
        this.ttDepth[slot] = Math.min(depth, 127);
        this.ttFlag[slot] = best >= beta ? LOWER : best > alphaStart ? EXACT : UPPER;
        this.ttScore[slot] = stored;
        this.ttMove[slot] = bestMove;
        return best;
    }

    // 根の手を1つずつ、全幅で読んで正確な点を出す（弱い CPU が「ほどほどに良い手」を選ぶため）
    scoreAll(depth, rootMoves) {
        const pos = this.pos;
        const out = [];
        for (const m of rootMoves) {
            pos.make(m);
            this.pushKey();
            const score = -this.negamax(depth - 1, -INF, INF, 1, true);
            this.keyCount--;
            pos.unmake();
            if (this.abort) return null;
            out.push({ move: m, score });
        }
        return out;
    }
}

let shared = null;

/**
 * 読む。pos は読みの間だけ書き換えて、元に戻す
 * opt: { maxDepth, nodeLimit, maxMs, scoreAll（根の手すべての正確な点を返す）, nullMove }
 * gameKeys: ここまでの局面の指紋 [[lo, hi], ...]（最後が今の局面）
 * 返り値: { move, score, depth, nodes, scored }（手がなければ move は 0）
 */
export function search(pos, opt = {}, gameKeys = [[pos.hashLo, pos.hashHi]]) {
    shared ??= new Searcher();
    const s = shared;
    s.reset(pos, gameKeys, opt);
    const rootMoves = pos.legalMoves();
    const result = { move: rootMoves[0] ?? 0, score: 0, depth: 0, nodes: 0, scored: null };
    if (!rootMoves.length) return result;
    const maxDepth = opt.maxDepth ?? 4;
    for (let depth = 1; depth <= maxDepth; depth++) {
        if (opt.scoreAll) {
            const scored = s.scoreAll(depth, rootMoves);
            if (!scored) break;
            scored.sort((a, b) => b.score - a.score);
            // 次の深さは、良かった順に読む
            rootMoves.splice(0, rootMoves.length, ...scored.map(x => x.move));
            Object.assign(result, { move: scored[0].move, score: scored[0].score, depth, scored });
        } else {
            s.rootBest = 0;
            const score = s.negamax(depth, -INF, INF, 0, false);
            if (s.abort) break;
            Object.assign(result, { move: s.rootBest || result.move, score, depth });
        }
        if (Math.abs(result.score) > MATE - 200) break;
    }
    result.nodes = s.nodes;
    return result;
}

// 開始の局面と指した手（UCI）から、今の局面と、ここまでの局面の指紋を作る
export function positionFrom(startFen, uciMoves) {
    const pos = new Position(startFen);
    const keys = [[pos.hashLo, pos.hashHi]];
    for (const uci of uciMoves) {
        const m = findMove(pos.legalMoves(), uci.slice(0, 2), uci.slice(2, 4), uci.slice(4));
        if (m === null) throw new Error(`再現できない手です: ${uci}`);
        pos.makeUnchecked(m);
        keys.push([pos.hashLo, pos.hashHi]);
    }
    pos.sp = 0; // 戻す必要はないので、戻すための記録を空にする
    return { pos, keys };
}

