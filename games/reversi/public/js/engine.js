/**
 * CPU の読みの部品（DOM に依存しない）
 * 速さのため、盤を縁つきの 10×10（91マス使う）で持ち、置く・戻すを石の山（stack）で行う
 * 0 空き／1 黒／2 白／3 縁
 *
 * - 中盤：アルファベータ法（ネガマックス）。点はマスの重みの表＋置ける数（着手可能数）の差＋角まわり
 * - 終盤：残りの空きが決めた数以下なら、最後まで読み切って石の差を出す（置けるマスの少ない順に試す）
 * - どちらも、読む深さと局面の数（node の上限）で打ち切り、時間は使わない（端末の速さで手が変わらないように）
 */

export const WIN = 100000;
const DIRS = [-11, -10, -9, -1, 1, 9, 10, 11];
const toIdx = (sq) => (Math.floor(sq / 8) + 1) * 10 + (sq % 8) + 1;
const toSq = (idx) => (Math.floor(idx / 10) - 1) * 8 + (idx % 10) - 1;

// マスの重み（角は大きく、角の隣は小さく）
const TABLE = [
    100, -25, 10, 5, 5, 10, -25, 100,
    -25, -45, -2, -2, -2, -2, -45, -25,
    10, -2, 1, 1, 1, 1, -2, 10,
    5, -2, 1, 0, 0, 1, -2, 5,
    5, -2, 1, 0, 0, 1, -2, 5,
    10, -2, 1, 1, 1, 1, -2, 10,
    -25, -45, -2, -2, -2, -2, -45, -25,
    100, -25, 10, 5, 5, 10, -25, 100
];
const WEIGHT = new Int16Array(100);
TABLE.forEach((w, sq) => { WEIGHT[toIdx(sq)] = w; });
// 角と、その隣（C・X）の組。角が埋まったら、隣の減点はなくす
const CORNERS = [[0, 1, 8, 9], [7, 6, 15, 14], [56, 57, 48, 49], [63, 62, 55, 54]].map(g => g.map(toIdx));
// 試す順：重みの大きいマスから（枝刈りが効く）
const ORDER = TABLE.map((w, sq) => [w, sq]).sort((a, b) => b[0] - a[0]).map(([, sq]) => toIdx(sq));

export function toBoard(board64) {
    const b = new Int8Array(100).fill(3);
    board64.forEach((s, sq) => { b[toIdx(sq)] = s; });
    return b;
}

function canMove(b, idx, me, opp) {
    if (b[idx] !== 0) return false;
    for (let d = 0; d < 8; d++) {
        const dir = DIRS[d];
        let i = idx + dir;
        if (b[i] !== opp) continue;
        i += dir;
        while (b[i] === opp) i += dir;
        if (b[i] === me) return true;
    }
    return false;
}

// 置く。返した石を stack[top..] に積み、返した数を返す（0 なら置けない。盤は変えない）
function doMove(b, idx, me, opp, stack, top) {
    let n = 0;
    for (let d = 0; d < 8; d++) {
        const dir = DIRS[d];
        let i = idx + dir;
        let k = 0;
        while (b[i] === opp) { i += dir; k++; }
        if (k && b[i] === me) {
            i = idx + dir;
            while (b[i] === opp) { b[i] = me; stack[top + n++] = i; i += dir; }
        }
    }
    if (n) b[idx] = me;
    return n;
}

function undoMove(b, idx, opp, stack, top, n) {
    b[idx] = 0;
    for (let k = 0; k < n; k++) b[stack[top + k]] = opp;
}

function mobility(b, me, opp) {
    let n = 0;
    for (let k = 0; k < 64; k++) if (canMove(b, ORDER[k], me, opp)) n++;
    return n;
}

function discDiff(b, me) {
    let d = 0;
    for (let k = 0; k < 64; k++) {
        const s = b[ORDER[k]];
        if (s === me) d++;
        else if (s) d--;
    }
    return d;
}

// 手番 me から見た局面の点
export function evaluate(b, me, opp) {
    let score = 0;
    for (let k = 0; k < 64; k++) {
        const idx = ORDER[k];
        const s = b[idx];
        if (s === me) score += WEIGHT[idx];
        else if (s === opp) score -= WEIGHT[idx];
    }
    // 角が埋まっていれば、その隣の重みは消す（足しすぎた分を戻す）
    for (let g = 0; g < 4; g++) {
        const [corner, ...near] = CORNERS[g];
        if (!b[corner]) continue;
        for (const idx of near) {
            if (b[idx] === me) score -= WEIGHT[idx];
            else if (b[idx] === opp) score += WEIGHT[idx];
        }
    }
    score += 8 * (mobility(b, me, opp) - mobility(b, opp, me));
    return score;
}

const finalScore = (b, me) => {
    const d = discDiff(b, me);
    return d > 0 ? WIN + d : d < 0 ? -WIN + d : 0;
};

const ABORT = Symbol('abort');

class Searcher {
    constructor(limit) {
        this.nodes = 0;
        this.limit = limit;
        this.stack = new Int8Array(64 * 64);
    }

    tick() {
        if (++this.nodes > this.limit) throw ABORT;
    }

    // 中盤の読み
    midgame(b, me, opp, depth, alpha, beta, passed, top) {
        this.tick();
        if (depth === 0) return evaluate(b, me, opp);
        let best = -Infinity;
        let moved = false;
        for (let k = 0; k < 64; k++) {
            const idx = ORDER[k];
            if (b[idx] !== 0) continue;
            const n = doMove(b, idx, me, opp, this.stack, top);
            if (!n) continue;
            moved = true;
            const v = -this.midgame(b, opp, me, depth - 1, -beta, -alpha, false, top + n);
            undoMove(b, idx, opp, this.stack, top, n);
            if (v > best) best = v;
            if (v > alpha) alpha = v;
            if (alpha >= beta) break;
        }
        if (!moved) {
            if (passed) return finalScore(b, me);
            return -this.midgame(b, opp, me, depth, -beta, -alpha, true, top);
        }
        return best;
    }

    // 終盤の読み切り（石の差。勝ち負けの点は付けない）
    endgame(b, me, opp, alpha, beta, passed, top, empties) {
        this.tick();
        // 試す手を集める。空きが多いうちは、相手の置ける数の少ない順に並べる
        const list = [];
        for (let k = 0; k < 64; k++) {
            const idx = ORDER[k];
            if (b[idx] === 0 && canMove(b, idx, me, opp)) list.push(idx);
        }
        if (!list.length) {
            if (passed) return discDiff(b, me);
            return -this.endgame(b, opp, me, -beta, -alpha, true, top, empties);
        }
        if (empties > 6 && list.length > 1) {
            const keyed = list.map(idx => {
                const n = doMove(b, idx, me, opp, this.stack, top);
                const m = mobility(b, opp, me);
                undoMove(b, idx, opp, this.stack, top, n);
                return [m, idx];
            });
            keyed.sort((x, y) => x[0] - y[0]);
            for (let i = 0; i < keyed.length; i++) list[i] = keyed[i][1];
        }
        let best = -Infinity;
        for (const idx of list) {
            const n = doMove(b, idx, me, opp, this.stack, top);
            const v = empties === 1 ? discDiff(b, me) : -this.endgame(b, opp, me, -beta, -alpha, false, top + n, empties - 1);
            undoMove(b, idx, opp, this.stack, top, n);
            if (v > best) best = v;
            if (v > alpha) alpha = v;
            if (alpha >= beta) break;
        }
        return best;
    }
}

/**
 * 根の手それぞれの点
 * board64：盤、color：手番の色、opt：{ depth（必ず読む深さ）, maxDepth, nodeLimit, exact（読み切る空きの数）, exactLimit }
 * 戻り値：{ scored: [{ sq, score }], depth, exact（読み切ったか）, nodes }
 *   読み切ったとき、score は石の差（勝ちなら WIN を足す）。中盤では局面の点
 */
export function analyze(board64, color, opt) {
    const me = color;
    const opp = 3 - color;
    const b = toBoard(board64);
    const roots = [];
    for (let k = 0; k < 64; k++) if (canMove(b, ORDER[k], me, opp)) roots.push(ORDER[k]);
    if (!roots.length) return { scored: [], depth: 0, exact: false, nodes: 0 };
    const empties = board64.filter(s => s === 0).length;
    let nodes = 0;

    // 終盤：読み切る
    if (empties <= opt.exact) {
        const s = new Searcher(opt.exactLimit ?? Infinity);
        try {
            let alpha = -Infinity;
            const scored = roots.map(idx => {
                const n = doMove(b, idx, me, opp, s.stack, 0);
                // 一番良い手より 1 以上悪い手は、上限だけ分かればよい
                const v = -s.endgame(b, opp, me, -Infinity, -alpha + 1, false, n, empties - 1);
                undoMove(b, idx, opp, s.stack, 0, n);
                if (v > alpha) alpha = v;
                return { sq: toSq(idx), score: v > 0 ? WIN + v : v < 0 ? -WIN + v : 0 };
            });
            return { scored, depth: empties, exact: true, nodes: s.nodes };
        } catch (error) {
            if (error !== ABORT) throw error;
            // 読み切れなかった。途中の盤を作り直して、中盤の読みに切り替える
            nodes += s.nodes;
            b.set(toBoard(board64));
        }
    }

    // 中盤：決めた深さまでは必ず読み、そのあとは上限まで1手ずつ深くする
    // 読み切りをあきらめたときは、そこで読んだ局面の数も上限に数える（読み切りと中盤の読みを足して長くならないように）
    let scored = roots.map(idx => ({ idx, score: 0 }));
    let reached = 0;
    const s = new Searcher(Infinity);
    s.nodes = nodes;
    for (let d = 1; d <= (opt.maxDepth ?? opt.depth); d++) {
        s.limit = d > opt.depth ? (opt.nodeLimit ?? Infinity) : Infinity;
        const order = [...scored].sort((x, y) => y.score - x.score);
        let alpha = -Infinity;
        try {
            scored = order.map(({ idx }) => {
                const n = doMove(b, idx, me, opp, s.stack, 0);
                const v = -s.midgame(b, opp, me, d - 1, -Infinity, -alpha + (opt.margin ?? 1), false, n);
                undoMove(b, idx, opp, s.stack, 0, n);
                if (v > alpha) alpha = v;
                return { idx, score: v };
            });
            reached = d;
        } catch (error) {
            if (error !== ABORT) throw error;
            // 途中の読みは捨てる（盤は stack から戻っていないので、作り直す）
            b.set(toBoard(board64));
            break;
        }
        if (scored.some(x => x.score > WIN / 2) || scored.every(x => x.score < -WIN / 2)) break;
    }
    return { scored: scored.map(({ idx, score }) => ({ sq: toSq(idx), score })), depth: reached, exact: false, nodes: s.nodes };
}

// 確かめ用：枝刈りなしで最後まで読んだ石の差（テストで読み切りの正しさを比べる）
export function bruteForce(board64, color) {
    const b = toBoard(board64);
    const stack = new Int8Array(64 * 64);
    const walk = (me, opp, passed, top) => {
        let best = -Infinity;
        for (let k = 0; k < 64; k++) {
            const idx = ORDER[k];
            if (b[idx] !== 0) continue;
            const n = doMove(b, idx, me, opp, stack, top);
            if (!n) continue;
            const v = -walk(opp, me, false, top + n);
            undoMove(b, idx, opp, stack, top, n);
            if (v > best) best = v;
        }
        if (best === -Infinity) return passed ? discDiff(b, me) : -walk(opp, me, true, top);
        return best;
    };
    return walk(color, 3 - color, false, 0);
}

export { canMove, doMove, toIdx, toSq };
