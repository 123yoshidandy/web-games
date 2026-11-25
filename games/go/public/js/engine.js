/**
 * CPU の読み（DOM に依存しない）
 * モンテカルロ木探索（MCTS）。終局まで乱数で打ち進める「プレイアウト」を何度も行い、勝つ割合の高い手を選ぶ
 *
 * - 速い盤（FastBoard）：縁つきの (size+2)^2 の盤。連は輪のリストでつなぎ、連ごとに「疑似ダメ」の数・番号の和・番号の2乗の和を持つ。
 *   和と2乗の和から、アタリ（ダメが1つ）かどうかと、そのダメの位置が、連をたどらずに分かる
 * - プレイアウト：直前の相手の手でアタリになった石を逃げる・アタリの石を取る、を優先し、あとは自分の眼をつぶさない手を乱数で選ぶ
 *   終わったら、石と眼を数える（エリア）。日本式に合わせるため、打った石の数の差を引く（地＋アゲハマの差と同じになる）
 * - 木：UCT に RAVE（AMAF：プレイアウトの中でその点に先に打った側の結果も使う）を足す。手の良し悪しの見込み（事前の値）も足す
 * - 打ち切りは回数で決める。時間（maxMs）は安全弁だけ（端末の速さで手が変わらないように）
 */

import { createRandom } from './random.js';

const BORDER = 3;

export class FastBoard {
    constructor(size) {
        this.size = size;
        this.W = size + 2;
        const cells = this.W * this.W;
        this.color = new Uint8Array(cells).fill(BORDER);
        this.head = new Int16Array(cells);
        this.next = new Int16Array(cells);
        this.stones = new Int16Array(cells);
        this.libs = new Int32Array(cells);
        this.lsum = new Int32Array(cells);
        this.lsum2 = new Float64Array(cells);
        this.empties = new Int16Array(size * size);
        this.emptyPos = new Int16Array(cells).fill(-1);
        this.emptyCount = 0;
        this.dirs = [-this.W, this.W, -1, 1];
        this.diags = [-this.W - 1, -this.W + 1, this.W - 1, this.W + 1];
        this.ko = -1;
        this.placed = [0, 0, 0];   // 色ごとの、打った（置いた）石の数
        this.points = [];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const p = (r + 1) * this.W + c + 1;
                this.color[p] = 0;
                this.points.push(p);
                this.addEmpty(p);
            }
        }
        this.captured = [];
    }

    static from(board, size, { ko = -1, placed = [0, 0, 0] } = {}) {
        const fb = new FastBoard(size);
        board.forEach((s, sq) => { if (s) fb.put(fb.points[sq], s); });
        fb.ko = ko >= 0 ? fb.points[ko] : -1;
        fb.placed = [...placed];
        return fb;
    }

    copyFrom(o) {
        this.color.set(o.color); this.head.set(o.head); this.next.set(o.next); this.stones.set(o.stones);
        this.libs.set(o.libs); this.lsum.set(o.lsum); this.lsum2.set(o.lsum2);
        this.empties.set(o.empties); this.emptyPos.set(o.emptyPos);
        this.emptyCount = o.emptyCount; this.ko = o.ko; this.placed[1] = o.placed[1]; this.placed[2] = o.placed[2];
    }

    toSq(p) {
        return (Math.floor(p / this.W) - 1) * this.size + (p % this.W) - 1;
    }

    addEmpty(p) {
        this.emptyPos[p] = this.emptyCount;
        this.empties[this.emptyCount++] = p;
    }

    removeEmpty(p) {
        const i = this.emptyPos[p];
        const last = this.empties[--this.emptyCount];
        this.empties[i] = last;
        this.emptyPos[last] = i;
        this.emptyPos[p] = -1;
    }

    addLib(h, p) { this.libs[h]++; this.lsum[h] += p; this.lsum2[h] += p * p; }
    removeLib(h, p) { this.libs[h]--; this.lsum[h] -= p; this.lsum2[h] -= p * p; }

    // 連のダメが1つなら、その点。でなければ -1
    atariLib(h) {
        const n = this.libs[h];
        if (n === 0) return -1;
        const s = this.lsum[h];
        return s * s === n * this.lsum2[h] ? s / n : -1;
    }

    // 合法か（空き・コウでない・自殺手でない）
    isLegal(p, c) {
        if (this.color[p] !== 0 || p === this.ko) return false;
        const enemy = 3 - c;
        for (let d = 0; d < 4; d++) {
            const n = p + this.dirs[d];
            const nc = this.color[n];
            if (nc === 0) return true;
            if (nc === BORDER) continue;
            const lib = this.atariLib(this.head[n]);
            if (nc === c) { if (lib !== p) return true; } else if (nc === enemy && lib === p) return true;
        }
        return false;
    }

    // 自分の眼らしい点（縦横がすべて自分の石か縁で、斜めの相手の石が少ない）
    isEyeish(p, c) {
        for (let d = 0; d < 4; d++) {
            const nc = this.color[p + this.dirs[d]];
            if (nc !== c && nc !== BORDER) return false;
        }
        let bad = 0;
        let edge = 0;
        for (let d = 0; d < 4; d++) {
            const nc = this.color[p + this.diags[d]];
            if (nc === BORDER) edge = 1;
            else if (nc === 3 - c) bad++;
        }
        return bad + edge < 2;
    }

    // 石を置き、連をつなぐ（取りは play で行う）
    put(p, c) {
        this.color[p] = c;
        this.removeEmpty(p);
        this.head[p] = p; this.next[p] = p; this.stones[p] = 1;
        this.libs[p] = 0; this.lsum[p] = 0; this.lsum2[p] = 0;
        for (let d = 0; d < 4; d++) {
            const n = p + this.dirs[d];
            const nc = this.color[n];
            if (nc === 0) this.addLib(p, n);
            else if (nc !== BORDER) this.removeLib(this.head[n], p);
        }
        for (let d = 0; d < 4; d++) {
            const n = p + this.dirs[d];
            if (this.color[n] === c && this.head[n] !== this.head[p]) this.merge(this.head[p], this.head[n]);
        }
    }

    merge(a, b) {
        // 小さい方を大きい方につなぐ
        if (this.stones[a] < this.stones[b]) { const t = a; a = b; b = t; }
        let s = b;
        do { this.head[s] = a; s = this.next[s]; } while (s !== b);
        const t = this.next[a]; this.next[a] = this.next[b]; this.next[b] = t;
        this.stones[a] += this.stones[b];
        this.libs[a] += this.libs[b]; this.lsum[a] += this.lsum[b]; this.lsum2[a] += this.lsum2[b];
    }

    removeChain(h) {
        let s = h;
        let count = 0;
        do {
            const nextStone = this.next[s];
            this.color[s] = 0;
            this.addEmpty(s);
            this.captured.push(s);
            count++;
            s = nextStone;
        } while (s !== h);
        // 取った石の隣の連に、ダメを返す
        s = h;
        do {
            for (let d = 0; d < 4; d++) {
                const n = s + this.dirs[d];
                const nc = this.color[n];
                if (nc === 1 || nc === 2) this.addLib(this.head[n], s);
            }
            s = this.next[s];
        } while (s !== h);
        return count;
    }

    // 合法と分かっている手を打つ。-1 はパス
    play(p, c) {
        if (p < 0) { this.ko = -1; return 0; }
        this.put(p, c);
        this.placed[c]++;
        const enemy = 3 - c;
        let taken = 0;
        let lastTaken = -1;
        for (let d = 0; d < 4; d++) {
            const n = p + this.dirs[d];
            if (this.color[n] === enemy && this.libs[this.head[n]] === 0) {
                lastTaken = this.head[n];
                taken += this.removeChain(this.head[n]);
            }
        }
        const h = this.head[p];
        this.ko = taken === 1 && this.stones[h] === 1 && this.atariLib(h) === lastTaken ? lastTaken : -1;
        return taken;
    }

    // 終局の数え方（エリア）：石と、一方の色の石だけに接する空き。黒−白
    areaDiff(owner) {
        let diff = 0;
        for (const p of this.points) {
            let c = this.color[p];
            if (c === 0) {
                let seen = 0;
                for (let d = 0; d < 4; d++) {
                    const nc = this.color[p + this.dirs[d]];
                    if (nc === 1 || nc === 2) seen |= nc;
                }
                c = seen === 1 || seen === 2 ? seen : 0;
            }
            if (c === 1) diff++;
            else if (c === 2) diff--;
            if (owner) owner[p] = c;
        }
        return diff;
    }
}

// プレイアウトの1手。直前の手 last（相手の手）を見て、取りと逃げを優先する
function playoutMove(b, c, last, random) {
    if (last >= 0) {
        // 直前の石の連がアタリなら取る
        const lib = b.atariLib(b.head[last]);
        if (lib >= 0 && b.isLegal(lib, c)) return lib;
        // 直前の手でアタリになった自分の連を逃げる
        for (let d = 0; d < 4; d++) {
            const n = last + b.dirs[d];
            if (b.color[n] !== c) continue;
            const l = b.atariLib(b.head[n]);
            if (l >= 0 && b.isLegal(l, c)) {
                // 逃げた先のダメが2つ以上になりそうなときだけ（空きの隣が2つ以上）
                let free = 0;
                for (let e = 0; e < 4; e++) if (b.color[l + b.dirs[e]] === 0) free++;
                if (free >= 2) return l;
            }
        }
    }
    const count = b.emptyCount;
    if (count === 0) return -1;
    let i = Math.floor(random() * count);
    for (let k = 0; k < count; k++, i = (i + 1) % count) {
        const p = b.empties[i];
        if (!b.isEyeish(p, c) && b.isLegal(p, c)) return p;
    }
    return -1;
}

/**
 * プレイアウト：b を終局まで打ち進め、黒から見た日本式の差（コミ込み）を返す
 * firstPlay：AMAF 用。点ごとに、最初に打った色（0 はまだ）
 */
export function playout(b, toPlay, last, komi, random, firstPlay, owner) {
    const limit = b.size * b.size * 2;
    let passes = 0;
    let c = toPlay;
    for (let i = 0; i < limit && passes < 2; i++) {
        const p = playoutMove(b, c, last, random);
        if (p < 0) passes++;
        else {
            passes = 0;
            if (firstPlay && firstPlay[p] === 0) firstPlay[p] = c;
        }
        b.play(p, c);
        last = p;
        c = 3 - c;
    }
    return b.areaDiff(owner) - (b.placed[1] - b.placed[2]) - komi;
}

// ---- 木 ----

class Node {
    constructor(move, color, parent) {
        this.move = move;     // この節に来た手（-1 はパス）
        this.color = color;   // その手を打った色
        this.parent = parent;
        this.children = null;
        this.n = 0; this.w = 0;      // 訪れた数・勝った数（color から見て）
        this.rn = 0; this.rw = 0;    // RAVE
    }
}

const RAVE_K = 600;
const PRIOR_N = 10;

// 手の良し悪しの見込み（勝った数の初期値。PRIOR_N 回のうち何回勝ったことにするか）
function prior(b, p, c, earlyPhase) {
    if (p < 0) return 2;
    const size = b.size;
    const r = Math.floor(p / b.W) - 1;
    const col = p % b.W - 1;
    const line = Math.min(r, col, size - 1 - r, size - 1 - col);  // 0 が1線
    let w = 5;
    if (earlyPhase && size >= 13) {
        if (line === 0) w = 1;
        else if (line === 1) w = 3;
        else if (line === 2 || line === 3) w = 6.5;
    } else if (earlyPhase && line === 0) w = 2;
    // 取れる・逃げられる手を高く、自分からアタリになる手を低く
    let friendly = 0;
    let free = 0;
    for (let d = 0; d < 4; d++) {
        const n = p + b.dirs[d];
        const nc = b.color[n];
        if (nc === 0) free++;
        else if (nc === BORDER) continue;
        else {
            const lib = b.atariLib(b.head[n]);
            if (nc === 3 - c && lib === p) w = Math.max(w, 9);
            if (nc === c) {
                friendly++;
                if (lib === p) w = Math.max(w, free >= 1 ? 8 : 6);
                else if (b.libs[b.head[n]] > 1) free += 1;
            }
        }
    }
    if (free <= 1 && friendly === 0) w = Math.min(w, 2);
    return w;
}

function expand(node, b, toPlay, allowPass, earlyPhase) {
    const children = [];
    for (let i = 0; i < b.emptyCount; i++) {
        const p = b.empties[i];
        if (b.isLegal(p, toPlay) && !b.isEyeish(p, toPlay)) {
            const child = new Node(p, toPlay, node);
            const w = prior(b, p, toPlay, earlyPhase);
            child.n = PRIOR_N; child.w = w;
            children.push(child);
        }
    }
    if (allowPass || children.length === 0) {
        const pass = new Node(-1, toPlay, node);
        pass.n = PRIOR_N; pass.w = prior(b, -1, toPlay, earlyPhase);
        children.push(pass);
    }
    node.children = children;
}

function select(node) {
    let best = null;
    let bestValue = -Infinity;
    const logN = Math.log(node.n + 1);
    for (const child of node.children) {
        const q = child.w / child.n;
        let value = q;
        if (child.rn > 0) {
            const beta = Math.sqrt(RAVE_K / (3 * child.n + RAVE_K));
            value = (1 - beta) * q + beta * (child.rw / child.rn);
        }
        value += 0.2 * Math.sqrt(logN / child.n);
        if (value > bestValue) { bestValue = value; best = child; }
    }
    return best;
}

/**
 * 探索して手を決める
 * state：{ board, size, toPlay（1・2）, ko, komi, placed: [0, 黒, 白], lastMove（sq か -1）, passes（続けてのパスの数）, ply }
 * options：{ playouts, seed, maxMs, allowPass }
 * 返り値：{ move（sq か -1 パス）, winrate（toPlay から見た）, visits, playouts, children（[{ move, n, q }]）}
 */
export function search(state, { playouts = 1000, seed = 1, maxMs = 10000, allowPass = true } = {}) {
    const { size, toPlay, komi = 0 } = state;
    const root = FastBoard.from(state.board, size, { ko: state.ko ?? -1, placed: state.placed ?? [0, 0, 0] });
    const random = createRandom(seed);
    const work = new FastBoard(size);
    const firstPlay = new Uint8Array(root.W * root.W);
    const earlyPhase = (state.ply ?? 0) < size * size / 3;
    const rootNode = new Node(-1, 3 - toPlay, null);
    const lastRoot = state.lastMove >= 0 ? root.points[state.lastMove] : -1;
    expand(rootNode, root, toPlay, allowPass, earlyPhase);
    const started = Date.now();
    const path = [];
    let done = 0;
    for (; done < playouts; done++) {
        if ((done & 63) === 0 && Date.now() - started > maxMs) break;
        work.copyFrom(root);
        firstPlay.fill(0);
        let node = rootNode;
        let c = toPlay;
        let last = lastRoot;
        let passes = state.passes ?? 0;
        path.length = 0;
        path.push(node);
        // 木を下る
        while (node.children && passes < 2) {
            node = select(node);
            work.play(node.move, c);
            if (node.move >= 0) {
                passes = 0;
                if (firstPlay[node.move] === 0) firstPlay[node.move] = c;
            } else passes++;
            last = node.move;
            c = 3 - c;
            path.push(node);
            if (node.n - PRIOR_N >= 1 && !node.children && passes < 2) {
                expand(node, work, c, true, earlyPhase);
            }
        }
        // 2回続けてパスなら、そのまま数える
        const diff = passes >= 2
            ? work.areaDiff(null) - (work.placed[1] - work.placed[2]) - komi
            : playout(work, c, last, komi, random, firstPlay, null);
        // 勝ち負けに、点差を少し混ぜる（大差のときに手が緩まないように）
        const scoreBonus = 0.1 / (1 + Math.exp(-diff / 5));
        const blackResult = (diff > 0 ? 0.9 : diff < 0 ? 0 : 0.45) + scoreBonus;
        for (const n of path) {
            const result = n.color === 1 ? blackResult : 1 - blackResult;
            n.n++;
            n.w += result;
            // RAVE：この節から打つ側が、プレイアウトの中で最初に打った点を、子に数える
            if (n.children) {
                const mover = 3 - n.color;
                const moverResult = mover === 1 ? blackResult : 1 - blackResult;
                for (const child of n.children) {
                    if (child.move >= 0 && firstPlay[child.move] === mover) {
                        child.rn++;
                        child.rw += moverResult;
                    }
                }
            }
        }
    }
    let best = rootNode.children[0];
    for (const child of rootNode.children) if (child.n > best.n) best = child;
    const children = rootNode.children
        .map(ch => ({ move: ch.move < 0 ? -1 : root.toSq(ch.move), n: ch.n - PRIOR_N, q: ch.n > PRIOR_N ? ch.w / ch.n : 0 }))
        .sort((x, y) => y.n - x.n);
    return {
        move: best.move < 0 ? -1 : root.toSq(best.move),
        winrate: best.w / best.n,
        visits: best.n - PRIOR_N,
        playouts: done,
        children
    };
}

/**
 * 終局の局面から、点ごとの持ち主の見込みを出す（死に石の推定に使う）
 * 両方の色から交互に先に打たせて、プレイアウトの終わりの持ち主の割合を数える
 * 返り値：マスごとの値（+1 は黒のもの、-1 は白のもの）
 */
export function ownership(board, size, { komi = 0, playouts = 200, seed = 1 } = {}) {
    const root = FastBoard.from(board, size);
    const work = new FastBoard(size);
    const owner = new Uint8Array(root.W * root.W);
    const sum = new Float64Array(size * size);
    const random = createRandom(seed);
    for (let i = 0; i < playouts; i++) {
        work.copyFrom(root);
        playout(work, i % 2 === 0 ? 1 : 2, -1, komi, random, null, owner);
        root.points.forEach((p, sq) => { sum[sq] += owner[p] === 1 ? 1 : owner[p] === 2 ? -1 : 0; });
    }
    return Array.from(sum, v => v / playouts);
}

// 盤から作るシード（同じ局面なら同じ値）
export function boardSeed(board, extra = 0) {
    let h = 0x811C9DC5 ^ extra;
    for (let i = 0; i < board.length; i++) h = Math.imul(h ^ (board[i] * 31 + i), 0x01000193);
    return h >>> 0;
}
