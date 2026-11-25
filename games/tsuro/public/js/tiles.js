/**
 * 道のタイルと盤（DOM に依存しない。ゲーム・CPU・画面で共通に使う）
 *
 * タイルの端点は、1辺に2つずつ、左上から時計回りに 0〜7 と番号を付ける
 *   上：0（左寄り）・1（右寄り）／右：2（上寄り）・3（下寄り）／下：4（右寄り）・5（左寄り）／左：6（下寄り）・7（上寄り）
 * タイルは「8つの端点を2つずつ4組に分ける方法」（partner[i] = i とつながる端点）
 * 時計回りに90度回すと、端点 i は i+2 に移る。
 * 分け方は全部で 7×5×3×1 = 105 通り。回転で重なるものを1つにまとめると 35 通りになり、ゲームの 35 枚と一致する
 *
 * 盤は 6×6。マスの番号は r*6+c。駒は「まだタイルのないマス（cell）の、どの端点（p）に面しているか」で表す
 */

export const SIZE = 6;
export const CELLS = SIZE * SIZE;
export const HAND_SIZE = 3;

// 端点 q から出ると、隣のマスでは OPPOSITE[q] から入る（上の 0 は、上のマスの下の 5）
export const OPPOSITE = [5, 4, 7, 6, 1, 0, 3, 2];
// 端点がある辺（0：上、1：右、2：下、3：左）
export const SIDE = [0, 0, 1, 1, 2, 2, 3, 3];
const STEP = [[-1, 0], [0, 1], [1, 0], [0, -1]];

// 端点の、マスの中での位置（1辺を3等分した点。0〜1）
export const POINT_XY = [[1 / 3, 0], [2 / 3, 0], [1, 1 / 3], [1, 2 / 3], [2 / 3, 1], [1 / 3, 1], [0, 2 / 3], [0, 1 / 3]];

const rotateMatching = (partner, k) => {
    const out = Array(8);
    partner.forEach((q, p) => { out[(p + 2 * k) % 8] = (q + 2 * k) % 8; });
    return out;
};

// 8つの端点を4組に分ける方法をすべて作る
export function allMatchings() {
    const result = [];
    const walk = (partner) => {
        const p = partner.indexOf(-1);
        if (p < 0) {
            result.push([...partner]);
            return;
        }
        for (let q = p + 1; q < 8; q++) {
            if (partner[q] !== -1) continue;
            partner[p] = q;
            partner[q] = p;
            walk(partner);
            partner[p] = -1;
            partner[q] = -1;
        }
    };
    walk(Array(8).fill(-1));
    return result;
}

const key = (partner) => partner.join('');

// 回転で重なるものを1つにまとめる（4つの向きのうち、並びが一番小さいものを代表にする）
export function generateTiles() {
    const seen = new Map();
    allMatchings().forEach(m => {
        const canonical = [0, 1, 2, 3].map(k => rotateMatching(m, k)).map(key).sort()[0];
        if (!seen.has(canonical)) seen.set(canonical, canonical.split('').map(Number));
    });
    return [...seen.keys()].sort().map(k => seen.get(k));
}

export const TILES = generateTiles();
export const TILE_COUNT = TILES.length;

// 回転で同じ形になる向きの数（1・2・4）。画面で、同じ向きを何度も試させないために使う
export const DISTINCT_ROTATIONS = TILES.map(t => new Set([0, 1, 2, 3].map(k => key(rotateMatching(t, k)))).size);

// 置いたタイル { tile, rot } で、端点 p とつながる端点
export function partnerOf(placed, p) {
    const k = placed.rot * 2;
    return (TILES[placed.tile][(p - k + 8) % 8] + k) % 8;
}

// 回した向きでのタイルの4組（画面で描くため）。[[a, b], ...]（a < b）
export function pathsOf(tile, rot) {
    const pairs = [];
    for (let p = 0; p < 8; p++) {
        const q = partnerOf({ tile, rot }, p);
        if (p < q) pairs.push([p, q]);
    }
    return pairs;
}

export const cellOf = (r, c) => r * SIZE + c;
export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

// 端点 p から出た先 { cell, p }（盤の外なら null）
export function across(cell, p) {
    const [dr, dc] = STEP[SIDE[p]];
    const r = rowOf(cell) + dr;
    const c = colOf(cell) + dc;
    return inside(r, c) ? { cell: cellOf(r, c), p: OPPOSITE[p] } : null;
}

// 物理的に同じ点を同じ文字列にする（マスの境目の点は、両側のマスから同じ名前になる）
export function pointKey(cell, p) {
    const r = rowOf(cell);
    const c = colOf(cell);
    switch (SIDE[p]) {
        case 0: return `h${r}:${c}:${p === 0 ? 0 : 1}`;
        case 2: return `h${r + 1}:${c}:${p === 5 ? 0 : 1}`;
        case 3: return `v${r}:${c}:${p === 7 ? 0 : 1}`;
        default: return `v${r}:${c + 1}:${p === 2 ? 0 : 1}`;
    }
}

// 盤の縁の印（48か所）。左上から時計回り
export const START_MARKS = (() => {
    const marks = [];
    for (let c = 0; c < SIZE; c++) marks.push({ cell: cellOf(0, c), p: 0 }, { cell: cellOf(0, c), p: 1 });
    for (let r = 0; r < SIZE; r++) marks.push({ cell: cellOf(r, SIZE - 1), p: 2 }, { cell: cellOf(r, SIZE - 1), p: 3 });
    for (let c = SIZE - 1; c >= 0; c--) marks.push({ cell: cellOf(SIZE - 1, c), p: 4 }, { cell: cellOf(SIZE - 1, c), p: 5 });
    for (let r = SIZE - 1; r >= 0; r--) marks.push({ cell: cellOf(r, 0), p: 6 }, { cell: cellOf(r, 0), p: 7 });
    return marks;
})();

/**
 * 駒を道に沿って進める。board[cell] は { tile, rot } か null
 * 戻り値：{ segs: [[cell, 入る端点, 出る端点], ...], end: 'open' | 'edge', pos: { cell, p } }
 *   open：タイルのないマスに面して止まった（pos はそのマスの端点）
 *   edge：盤の外に出た（pos は最後のマスの、縁の端点）
 */
export function trace(board, cell, p) {
    const segs = [];
    for (let guard = 0; guard < 4 * CELLS; guard++) {
        const q = partnerOf(board[cell], p);
        segs.push([cell, p, q]);
        const next = across(cell, q);
        if (!next) return { segs, end: 'edge', pos: { cell, p: q } };
        if (!board[next.cell]) return { segs, end: 'open', pos: next };
        cell = next.cell;
        p = next.p;
    }
    throw new Error('道が閉じています');
}

/**
 * タイルを置いたときの、駒の動き（盤は変えない）
 * markers: [{ seat, pos: { cell, p } }]（盤に残っている駒だけ）
 * 戻り値：[{ seat, segs, pos, out: null | 'edge' | 'collision' }]（動いた駒だけ）
 * 衝突：2つの駒が同じ道の両側から進んで出会ったら、両方が脱落する（相手のいた点を通ったら衝突とみなし、そこで止める）
 */
export function simulate(board, markers, cell, placed) {
    const saved = board[cell];
    board[cell] = placed;
    try {
        const movers = markers.filter(m => m.pos.cell === cell);
        const startKeys = new Map(markers.map(m => [pointKey(m.pos.cell, m.pos.p), m.seat]));
        const results = movers.map(m => {
            const t = trace(board, m.pos.cell, m.pos.p);
            const ownKey = pointKey(m.pos.cell, m.pos.p);
            // 通った点に、ほかの駒のいた点があれば、そこで出会う
            for (let i = 0; i < t.segs.length; i++) {
                const [sc, , sq] = t.segs[i];
                const k = pointKey(sc, sq);
                if (k !== ownKey && startKeys.has(k)) {
                    return { seat: m.seat, segs: t.segs.slice(0, i + 1), pos: { cell: sc, p: sq }, out: 'collision', hit: startKeys.get(k) };
                }
            }
            return { seat: m.seat, segs: t.segs, pos: t.pos, out: t.end === 'edge' ? 'edge' : null };
        });
        // 出会った相手も脱落する。止まった点が同じ駒どうしも衝突とする（道の形からは起きないが、念のため）
        const byKey = new Map();
        results.forEach(r => {
            if (r.out === 'collision') {
                const other = results.find(o => o.seat === r.hit);
                if (other) other.out = 'collision';
            }
            if (!r.out) {
                const k = pointKey(r.pos.cell, r.pos.p);
                if (byKey.has(k)) {
                    r.out = 'collision';
                    byKey.get(k).out = 'collision';
                } else byKey.set(k, r);
            }
        });
        results.forEach(r => { delete r.hit; });
        return results;
    } finally {
        board[cell] = saved;
    }
}
