/**
 * 囲碁のルールの核（DOM に依存しない）
 * 盤は長さ size*size の配列（0 空き・1 黒・2 白）。マスの番号は「行 * size + 列」で、行0が上、列0が左
 *
 * - 取り：相手の石の連（縦横でつながった同じ色の石）のダメ（隣の空き）がなくなったら、盤から取り上げる
 * - 自殺手の禁止：打った石の連のダメがなくなる手は、相手の石を取れないかぎり打てない
 * - コウ：1子を取り返すと直前の局面に戻る形では、相手はすぐには取り返せない（ほかに1手打てば取り返せる）
 * - 地の計算（日本ルール）：死に石を取り除いたあと、一方の色の石だけに囲まれた空きを、その色の地とする。
 *   点＝地＋アゲハマ（取った石と、相手の死に石）。白にはコミを足す
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const SIZES = [9, 13, 19];
export const opponent = (color) => 3 - color;
export const colorOf = (seat) => seat + 1;    // 席0が黒、席1が白
export const COLOR_NAME = { 1: '黒', 2: '白' };

const neighborCache = new Map();

// マスごとの縦横の隣
export function neighbors(size) {
    let list = neighborCache.get(size);
    if (!list) {
        list = [];
        for (let sq = 0; sq < size * size; sq++) {
            const r = Math.floor(sq / size);
            const c = sq % size;
            const n = [];
            if (r > 0) n.push(sq - size);
            if (r < size - 1) n.push(sq + size);
            if (c > 0) n.push(sq - 1);
            if (c < size - 1) n.push(sq + 1);
            list.push(n);
        }
        neighborCache.set(size, list);
    }
    return list;
}

export const createBoard = (size) => new Array(size * size).fill(EMPTY);

// 座標の名前（列は A〜T で I を飛ばす。行は下から 1〜size）。例：19路の左上は A19
const COLUMNS = 'ABCDEFGHJKLMNOPQRST';
export function sqName(sq, size) {
    const r = Math.floor(sq / size);
    const c = sq % size;
    return `${COLUMNS[c]}${size - r}`;
}

export function sqOf(name, size) {
    const c = COLUMNS.indexOf(name[0].toUpperCase());
    const r = size - Number(name.slice(1));
    return r * size + c;
}

// sq を含む連の石と、そのダメ
export function groupAt(board, size, sq) {
    const color = board[sq];
    const nbrs = neighbors(size);
    const stones = [sq];
    const seen = new Set(stones);
    const liberties = new Set();
    for (let i = 0; i < stones.length; i++) {
        for (const n of nbrs[stones[i]]) {
            if (board[n] === EMPTY) liberties.add(n);
            else if (board[n] === color && !seen.has(n)) {
                seen.add(n);
                stones.push(n);
            }
        }
    }
    return { color, stones, liberties };
}

/**
 * color が sq に打つ。盤は書き換えず、結果を返す
 * ko：直前の手で決まった、打てないコウの点（なければ -1）
 * 返り値：{ ok: true, board, captured, ko }（ko は次の相手が打てない点）か { ok: false, reason }
 * reason：'occupied'（石がある）・'ko'（コウ）・'suicide'（自殺手）
 */
export function tryMove(board, size, sq, color, ko = -1) {
    if (!Number.isInteger(sq) || sq < 0 || sq >= size * size) return { ok: false, reason: 'range' };
    if (board[sq] !== EMPTY) return { ok: false, reason: 'occupied' };
    if (sq === ko) return { ok: false, reason: 'ko' };
    const next = [...board];
    next[sq] = color;
    const enemy = opponent(color);
    const captured = [];
    for (const n of neighbors(size)[sq]) {
        if (next[n] !== enemy) continue;
        const group = groupAt(next, size, n);
        if (group.liberties.size === 0) {
            group.stones.forEach(s => { next[s] = EMPTY; captured.push(s); });
        }
    }
    const own = groupAt(next, size, sq);
    if (own.liberties.size === 0) return { ok: false, reason: 'suicide' };
    // 1子を取り、打った石が1子でダメが1つ（取った点）なら、その点は次の相手には打てない
    const nextKo = captured.length === 1 && own.stones.length === 1 && own.liberties.size === 1 && own.liberties.has(captured[0])
        ? captured[0] : -1;
    return { ok: true, board: next, captured, ko: nextKo };
}

export const isLegal = (board, size, sq, color, ko = -1) => tryMove(board, size, sq, color, ko).ok;

// color の打てる点の一覧
export function legalMoves(board, size, color, ko = -1) {
    const list = [];
    for (let sq = 0; sq < size * size; sq++) {
        if (board[sq] === EMPTY && isLegal(board, size, sq, color, ko)) list.push(sq);
    }
    return list;
}

// 盤の上の連の一覧（石の数の多い順ではなく、マスの順）
export function groups(board, size) {
    const seen = new Set();
    const list = [];
    for (let sq = 0; sq < size * size; sq++) {
        if (board[sq] === EMPTY || seen.has(sq)) continue;
        const group = groupAt(board, size, sq);
        group.stones.forEach(s => seen.add(s));
        list.push(group);
    }
    return list;
}

/**
 * 日本式の地の計算
 * dead：死に石のマスの一覧。prisoners：対局中に取った石の数 { 1: 黒が取った白石, 2: 白が取った黒石 }
 * 返り値：{ owner（マスごとの地の持ち主。0 はどちらでもない）, black, white, diff（黒−白。コミ込み）, winner（1・2・0 は持碁） }
 * 死に石の点は、まわりを囲む色の地になる（死に石を取り除いてから、一方の色だけに囲まれた空きを数える）
 */
export function scoreJapanese(board, size, { dead = [], prisoners = { 1: 0, 2: 0 }, komi = 0 } = {}) {
    const deadSet = new Set(dead.filter(sq => board[sq] !== EMPTY));
    const alive = board.map((s, sq) => (deadSet.has(sq) ? EMPTY : s));
    const nbrs = neighbors(size);
    const owner = new Array(size * size).fill(EMPTY);
    const seen = new Uint8Array(size * size);
    const territory = { 1: 0, 2: 0 };
    for (let sq = 0; sq < size * size; sq++) {
        if (alive[sq] !== EMPTY || seen[sq]) continue;
        const region = [sq];
        seen[sq] = 1;
        let borders = 0;     // 1 黒に接する・2 白に接する（ビットの和）
        for (let i = 0; i < region.length; i++) {
            for (const n of nbrs[region[i]]) {
                if (alive[n] === EMPTY) {
                    if (!seen[n]) { seen[n] = 1; region.push(n); }
                } else borders |= alive[n];
            }
        }
        if (borders === BLACK || borders === WHITE) {
            region.forEach(s => { owner[s] = borders; });
            territory[borders] += region.length;
        }
    }
    const deadCount = { 1: 0, 2: 0 };
    deadSet.forEach(sq => { deadCount[board[sq]]++; });
    const black = { territory: territory[BLACK], prisoners: (prisoners[BLACK] ?? 0) + deadCount[WHITE] };
    const white = { territory: territory[WHITE], prisoners: (prisoners[WHITE] ?? 0) + deadCount[BLACK], komi };
    black.total = black.territory + black.prisoners;
    white.total = white.territory + white.prisoners + komi;
    const diff = black.total - white.total;
    return { owner, black, white, diff, winner: diff > 0 ? BLACK : diff < 0 ? WHITE : EMPTY };
}

// 置き石の位置（日本の打ち方。星に置く）。9路は 2〜5子、13路・19路は 2〜9子
export const MAX_HANDICAP = { 9: 5, 13: 9, 19: 9 };

export function handicapPoints(size, count) {
    if (count < 2) return [];
    if (count > MAX_HANDICAP[size]) throw new Error('置き石が多すぎます');
    const d = size < 13 ? 2 : 3;
    const lo = d;
    const hi = size - 1 - d;
    const mid = (size - 1) / 2;
    const at = (r, c) => r * size + c;
    // 黒から見て右上・左下・右下・左上・（中央）・左右の辺・上下の辺
    const corners = [at(lo, hi), at(hi, lo), at(hi, hi), at(lo, lo)];
    const center = at(mid, mid);
    const sides = [at(mid, lo), at(mid, hi)];
    const ends = [at(lo, mid), at(hi, mid)];
    if (count <= 4) return corners.slice(0, count);
    if (count === 5) return [...corners, center];
    if (count === 6) return [...corners, ...sides];
    if (count === 7) return [...corners, ...sides, center];
    if (count === 8) return [...corners, ...sides, ...ends];
    return [...corners, ...sides, ...ends, center];
}

// 星の点（盤の絵に使う）
export function starPoints(size) {
    if (size === 9) return handicapPoints(9, 5);
    return handicapPoints(size, 9);
}
