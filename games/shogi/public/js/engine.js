/**
 * CPU の読み（DOM に依存しない）
 * - 局面の点：駒の価値（持ち駒は少し高く）＋ 駒と玉の距離（相手の玉に近い駒を攻め、自分の玉に近い金銀を守りとして足す）＋ 玉の囲いの深さ
 * - 読み：反復深化のアルファベータ法（ネガマックス）。置換表・キラー・履歴で手を並べ、末端は取る手と成る手だけを読む（静止探索）
 *   王手をかけられた局面は、深さが尽きても1手延ばす（詰みを見落としにくくする）
 * - 打ち切りは局面の数（nodeLimit）で決める。時間では打ち切らない（端末の速さで手が変わらないように。テストで再現できるように）
 *   最低の深さ（depth）は必ず読み切る（ただし nodeLimit の2倍で打ち切り、それまでに読んだ手から選ぶ）
 * - 千日手：対局で現れた局面と、読みの途中の局面に戻る手は 0 点（引き分け）とする
 */

import { SENTE, OU, PROMOTE_FLAG, DROP_BASE, SIZE, typeOf, sideOf } from './rules.js';

export const MATE = 100000;
const INF = 1000000;
const MAX_PLY = 64;

// 駒の価値（盤の上）と、持ち駒の価値
export const VALUE = [0, 100, 300, 360, 500, 560, 850, 1000, 0, 560, 540, 540, 560, 0, 1100, 1300];
export const HAND_VALUE = [0, 110, 320, 380, 540, 600, 920, 1080];
// 相手の玉に近いほど足す点（距離4以内で、近いほど大きい）と、自分の玉に近い守りの点（距離2以内）
const ATTACK = [0, 3, 4, 8, 10, 12, 6, 6, 0, 12, 12, 12, 12, 0, 14, 14];
const DEFEND = [0, 0, 0, 0, 14, 16, 0, 0, 0, 8, 8, 8, 10, 0, 6, 4];

const DIST = Array.from({ length: 81 }, (_, a) => Array.from({ length: 81 }, (_, b) =>
    Math.max(Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)), Math.abs((a % SIZE) - (b % SIZE)))));

// 手番の側から見た点
export function evaluate(pos) {
    const b = pos.board;
    const [k0, k1] = pos.kings;
    let score = 0;
    for (let sq = 0; sq < 81; sq++) {
        const p = b[sq];
        if (!p) continue;
        const side = sideOf(p);
        const type = typeOf(p);
        let v;
        if (type === OU) {
            // 玉は自陣の奥にいるほどよい
            const depth = side === SENTE ? Math.floor(sq / SIZE) : 8 - Math.floor(sq / SIZE);
            v = (depth - 5) * 10;
        } else {
            const enemy = side === SENTE ? k1 : k0;
            const own = side === SENTE ? k0 : k1;
            v = VALUE[type];
            if (enemy >= 0) v += ATTACK[type] * Math.max(0, 5 - DIST[sq][enemy]);
            if (own >= 0) v += DEFEND[type] * Math.max(0, 3 - DIST[sq][own]);
        }
        score += side === SENTE ? v : -v;
    }
    const [h0, h1] = pos.hands;
    for (let t = 1; t < 8; t++) score += (h0[t] - h1[t]) * HAND_VALUE[t];
    return pos.side === SENTE ? score : -score;
}

// 置換表（局面をまたいで使い回す）
const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const tt = {
    key: new Float64Array(TT_SIZE),
    move: new Int32Array(TT_SIZE),
    score: new Int32Array(TT_SIZE),
    depth: new Int8Array(TT_SIZE),
    flag: new Int8Array(TT_SIZE)    // 1 ちょうど・2 下限・3 上限
};
const EXACT = 1, LOWER = 2, UPPER = 3;

class Abort extends Error {}

class Searcher {
    constructor(pos, opt) {
        this.pos = pos;
        this.opt = opt;
        this.nodes = 0;
        this.limit = Infinity;
        this.qDepth = opt.qDepth ?? 6;
        this.seen = opt.seen ?? new Set();
        this.path = [];
        this.killers = Array.from({ length: MAX_PLY + 1 }, () => [0, 0]);
        this.history = new Int32Array(128 * 81);
    }

    // 手の並べ替えの点
    orderScore(m, ttMove, ply) {
        if (m === ttMove) return 1e7;
        const from = m & 127;
        const to = (m >> 7) & 127;
        const victim = this.pos.board[to];
        let s = 0;
        if (victim) s += 1e6 + VALUE[typeOf(victim)] * 10 - (from > DROP_BASE ? 0 : VALUE[typeOf(this.pos.board[from])]);
        if (m & PROMOTE_FLAG) s += 5e5;
        const k = this.killers[ply];
        if (m === k[0]) s += 4e5;
        else if (m === k[1]) s += 3e5;
        return s + this.history[from * 81 + to];
    }

    sortMoves(moves, ttMove, ply) {
        const keyed = moves.map(m => [this.orderScore(m, ttMove, ply), m]);
        keyed.sort((a, b) => b[0] - a[0]);
        return keyed.map(x => x[1]);
    }

    negamax(depth, alpha, beta, ply) {
        if (++this.nodes > this.limit) throw new Abort();
        const pos = this.pos;
        const key = pos.key;
        if (this.seen.has(key) || this.path.includes(key)) return 0;
        const inCheck = pos.inCheck();
        if (depth <= 0) {
            if (!inCheck || ply >= MAX_PLY) return this.quiesce(alpha, beta, ply, 0);
            depth = 1;
        }
        const slot = pos.h1 & TT_MASK;
        let ttMove = 0;
        if (tt.key[slot] === key) {
            ttMove = tt.move[slot];
            const s = tt.score[slot];
            if (tt.depth[slot] >= depth && Math.abs(s) < MATE - 1000) {
                const f = tt.flag[slot];
                if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
            }
        }
        const moves = this.sortMoves(pos.pseudoMoves(), ttMove, ply);
        const alpha0 = alpha;
        let best = -INF;
        let bestMove = 0;
        let legal = 0;
        this.path.push(key);
        try {
            for (const m of moves) {
                pos.make(m);
                if (!pos.legalAfter(m)) {
                    pos.unmake(m);
                    continue;
                }
                legal++;
                let score;
                try {
                    score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
                } finally {
                    pos.unmake(m);
                }
                if (score > best) {
                    best = score;
                    bestMove = m;
                    if (score > alpha) {
                        alpha = score;
                        if (alpha >= beta) {
                            if (!pos.board[(m >> 7) & 127]) {
                                const k = this.killers[ply];
                                if (k[0] !== m) {
                                    k[1] = k[0];
                                    k[0] = m;
                                }
                                this.history[(m & 127) * 81 + ((m >> 7) & 127)] += depth * depth;
                            }
                            break;
                        }
                    }
                }
            }
        } finally {
            this.path.pop();
        }
        if (!legal) return -MATE + ply;
        tt.key[slot] = key;
        tt.move[slot] = bestMove;
        tt.score[slot] = best;
        tt.depth[slot] = depth;
        tt.flag[slot] = best >= beta ? LOWER : best > alpha0 ? EXACT : UPPER;
        return best;
    }

    // 取る手と成る手だけを読む
    quiesce(alpha, beta, ply, qd) {
        if (++this.nodes > this.limit) throw new Abort();
        const pos = this.pos;
        const stand = evaluate(pos);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        if (qd >= this.qDepth) return alpha;
        const moves = this.sortMoves(pos.pseudoMoves([], { captures: true }), 0, Math.min(ply, MAX_PLY));
        for (const m of moves) {
            pos.make(m);
            if (!pos.legalAfter(m)) {
                pos.unmake(m);
                continue;
            }
            let score;
            try {
                score = -this.quiesce(-beta, -alpha, ply + 1, qd + 1);
            } finally {
                pos.unmake(m);
            }
            if (score > alpha) {
                alpha = score;
                if (alpha >= beta) break;
            }
        }
        return alpha;
    }

    // 根の手を1つ読む。fixed に点が決まっている手（千日手で終わる手）は読まない
    rootScore(m, depth, alpha, beta) {
        if (this.opt.fixed?.has(m)) return this.opt.fixed.get(m);
        const pos = this.pos;
        this.path.push(pos.key);
        pos.make(m);
        try {
            return -this.negamax(depth - 1, -beta, -alpha, 1);
        } finally {
            this.path.pop();
            pos.unmake(m);
        }
    }

    run() {
        const opt = this.opt;
        const root = this.pos.legalMoves();
        if (!root.length) return { scored: [], depth: 0, nodes: 0 };
        let order = this.sortMoves(root, 0, 0);
        let done = null;
        const minDepth = opt.depth ?? 2;
        const maxDepth = Math.max(minDepth, opt.maxDepth ?? minDepth);
        const limit = opt.nodeLimit ?? Infinity;
        let reached = 0;
        for (let d = 1; d <= maxDepth; d++) {
            this.limit = d <= minDepth ? limit * 2 : limit;
            const scored = [];
            try {
                let alpha = -INF;
                for (const m of order) {
                    let score;
                    if (opt.exact) {
                        // すべての手の点をきちんと出す（迷いを足して選ぶ強さ用）
                        score = this.rootScore(m, d, -INF, INF);
                    } else if (alpha === -INF) {
                        score = this.rootScore(m, d, -INF, INF);
                    } else {
                        score = this.rootScore(m, d, alpha, alpha + 1);
                        if (score > alpha) score = this.rootScore(m, d, alpha, INF);
                        // 最善より悪い手は「alpha 以下」としか分からない。最善と同じ点に並ばないように下げる
                        else score = Math.min(score, alpha - 1);
                    }
                    scored.push({ move: m, score });
                    if (score > alpha) alpha = score;
                }
            } catch (error) {
                if (!(error instanceof Abort)) throw error;
                // 最低の深さを読み切れなかったときは、そこまでに読んだ手から選ぶ
                if (!done && scored.length) done = scored.concat(order.slice(scored.length).map(move => ({ move, score: -INF })));
                break;
            }
            scored.sort((a, b) => b.score - a.score);
            done = scored;
            reached = d;
            order = scored.map(s => s.move);
            if (Math.abs(scored[0].score) > MATE - 1000 && d >= minDepth) break;   // 詰みが見えたら終わり
        }
        if (!done) done = order.map(move => ({ move, score: 0 }));
        return { scored: done, depth: reached, nodes: this.nodes };
    }
}

// pos を読んで、根の手ごとの点を返す（点の高い順）。pos は書き換えない
export function analyze(pos, opt = {}) {
    return new Searcher(pos.clone(), opt).run();
}
