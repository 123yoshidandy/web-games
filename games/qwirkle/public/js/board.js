/**
 * タイルと盤の決まり（DOM に依存しない）
 * タイルの番号 0〜107 は「写し（0〜2）×36 ＋ 色（0〜5）×6 ＋ 形（0〜5）」。同じ色・形のタイルは3枚ずつ
 * 盤は「"x,y" → タイルの番号」の Map。広さに上限はない（座標は ±LIMIT まで）
 */

export const COLORS = ['赤', 'オレンジ', '黄', '緑', '青', '紫'];
export const SHAPES = ['円', 'クロス', 'ひし形', '四角', '星', 'クローバー'];
export const TILE_COUNT = 108;
export const HAND_SIZE = 6;
export const QWIRKLE_BONUS = 6;
export const END_BONUS = 6;
export const LIMIT = 60;

export const colorOf = (t) => Math.floor(t / 6) % 6;
export const shapeOf = (t) => t % 6;
export const kindOf = (t) => t % 36;
export const tileName = (t) => `${COLORS[colorOf(t)]}の${SHAPES[shapeOf(t)]}`;
export const keyOf = (x, y) => `${x},${y}`;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// タイルの並びが1つの列になれるか（全部同じ色で形が違う、か、全部同じ形で色が違う。6枚まで）
export function isValidLine(tiles) {
    if (tiles.length > 6) return false;
    if (tiles.length < 2) return true;
    const kinds = new Set(tiles.map(kindOf));
    if (kinds.size !== tiles.length) return false;
    return tiles.every(t => colorOf(t) === colorOf(tiles[0])) || tiles.every(t => shapeOf(t) === shapeOf(tiles[0]));
}

// 置くタイルの組が、同じ色か同じ形を共有し、重複がないか
export function sharesAttribute(tiles) {
    return isValidLine(tiles);
}

// (x, y) を通る、向き (dx, dy) の連続したタイルの列（座標とタイル）
export function lineThrough(board, x, y, dx, dy) {
    let sx = x;
    let sy = y;
    while (board.has(keyOf(sx - dx, sy - dy))) {
        sx -= dx;
        sy -= dy;
    }
    const cells = [];
    for (let cx = sx, cy = sy; board.has(keyOf(cx, cy)); cx += dx, cy += dy) cells.push({ x: cx, y: cy, tile: board.get(keyOf(cx, cy)) });
    return cells;
}

/**
 * 置き方を調べる。placements: [{ x, y, tile }]
 * partial: true なら、置いている途中（同じ線の上の間が空いていてもよい）として調べる
 * 返り値：{ ok, error, score, qwirkles, lines }
 */
export function checkPlacements(board, placements, { partial = false, firstSize = null } = {}) {
    const fail = (error) => ({ ok: false, error, score: 0, qwirkles: 0, lines: [] });
    if (!Array.isArray(placements) || placements.length === 0) return fail('置くタイルがありません');
    if (placements.length > HAND_SIZE) return fail('置けるのは6枚までです');
    const cells = new Set();
    for (const p of placements) {
        if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || Math.abs(p.x) > LIMIT || Math.abs(p.y) > LIMIT) return fail('置く場所が正しくありません');
        if (!Number.isInteger(p.tile) || p.tile < 0 || p.tile >= TILE_COUNT) return fail('タイルが正しくありません');
        const k = keyOf(p.x, p.y);
        if (board.has(k) || cells.has(k)) return fail('そこにはもうタイルがあります');
        cells.add(k);
    }
    const tiles = placements.map(p => p.tile);
    if (!sharesAttribute(tiles)) return fail('置くタイルは、同じ色か同じ形で、重複なくそろえます');
    const sameRow = placements.every(p => p.y === placements[0].y);
    const sameCol = placements.every(p => p.x === placements[0].x);
    if (!sameRow && !sameCol) return fail('置くタイルは、1本の線の上にそろえます');
    const empty = board.size === 0;
    if (empty && firstSize !== null && !partial && placements.length !== firstSize) return fail(`最初は、そろった組の${firstSize}枚を置きます`);
    if (!empty && !placements.some(p => DIRS.some(([dx, dy]) => board.has(keyOf(p.x + dx, p.y + dy))))) return fail('すでにあるタイルに接するように置きます');

    const next = new Map(board);
    placements.forEach(p => next.set(keyOf(p.x, p.y), p.tile));
    // 置いたタイルどうしは、間を（すでにあるタイルで）つないで1本の列にする
    if (placements.length > 1 && !partial) {
        const [dx, dy] = sameRow ? [1, 0] : [0, 1];
        const line = lineThrough(next, placements[0].x, placements[0].y, dx, dy);
        const inLine = new Set(line.map(c => keyOf(c.x, c.y)));
        if (!placements.every(p => inLine.has(keyOf(p.x, p.y)))) return fail('置いたタイルが1本の列につながっていません');
    }
    // できた列（横と縦）をすべて調べ、得点を数える
    const seen = new Set();
    const lines = [];
    for (const p of placements) {
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const line = lineThrough(next, p.x, p.y, dx, dy);
            if (line.length < 2) continue;
            const id = `${dx}:${keyOf(line[0].x, line[0].y)}`;
            if (seen.has(id)) continue;
            seen.add(id);
            if (!isValidLine(line.map(c => c.tile))) return fail('列には、同じ色か同じ形のタイルを、重複なく6枚まで並べます');
            lines.push(line);
        }
    }
    const qwirkles = lines.filter(l => l.length === 6).length;
    let score = lines.reduce((sum, l) => sum + l.length, 0) + qwirkles * QWIRKLE_BONUS;
    if (score === 0) score = 1;   // 何もない盤に1枚だけ置いたとき
    return { ok: true, error: null, score, qwirkles, lines };
}

// 手札の中で、同じ色か同じ形で重複のない、一番大きな組の枚数
export function largestSet(hand) {
    let best = hand.length ? 1 : 0;
    for (let v = 0; v < 6; v++) {
        best = Math.max(best, new Set(hand.filter(t => colorOf(t) === v).map(kindOf)).size);
        best = Math.max(best, new Set(hand.filter(t => shapeOf(t) === v).map(kindOf)).size);
    }
    return best;
}

// その組（一番大きな組のどれか）
export function largestSets(hand) {
    const size = largestSet(hand);
    const sets = [];
    for (let v = 0; v < 6; v++) {
        [hand.filter(t => colorOf(t) === v), hand.filter(t => shapeOf(t) === v)].forEach(group => {
            const byKind = new Map();
            group.forEach(t => { if (!byKind.has(kindOf(t))) byKind.set(kindOf(t), t); });
            if (byKind.size === size) sets.push([...byKind.values()]);
        });
    }
    return sets;
}

// タイルを置ける空きマス（すでにあるタイルに接するマス）
export function frontier(board) {
    const out = new Map();
    board.forEach((_, k) => {
        const [x, y] = k.split(',').map(Number);
        DIRS.forEach(([dx, dy]) => {
            const kk = keyOf(x + dx, y + dy);
            if (!board.has(kk)) out.set(kk, { x: x + dx, y: y + dy });
        });
    });
    return [...out.values()];
}

/**
 * 手札から置けるすべての置き方（重複を除く）
 * 1枚目を置ける場所から始め、同じ線の上で、列の端の空きマスへ1枚ずつ伸ばしていく
 */
export function generateMoves(board, hand, { firstSize = null } = {}) {
    const moves = [];
    const seenMoves = new Set();
    const record = (placements, result) => {
        const id = placements.map(p => `${p.x},${p.y},${kindOf(p.tile)}`).sort().join('|');
        if (seenMoves.has(id)) return;
        seenMoves.add(id);
        moves.push({ placements: placements.map(p => ({ ...p })), score: result.score, qwirkles: result.qwirkles });
    };
    // 同じ種類のタイルは1枚だけ試す
    const uniqueHand = [];
    const kinds = new Set();
    hand.forEach(t => { if (!kinds.has(kindOf(t))) { kinds.add(kindOf(t)); uniqueHand.push(t); } });

    if (board.size === 0) {
        const size = firstSize ?? largestSet(hand);
        largestSets(hand).forEach(set => {
            if (set.length !== size) return;
            const placements = set.map((tile, i) => ({ x: i, y: 0, tile }));
            record(placements, checkPlacements(board, placements));
        });
        return moves;
    }

    const extend = (placements, used, axis) => {
        const result = checkPlacements(board, placements);
        if (result.ok) record(placements, result);
        if (placements.length >= HAND_SIZE) return;
        const axes = axis ? [axis] : [[1, 0], [0, 1]];
        const temp = new Map(board);
        placements.forEach(p => temp.set(keyOf(p.x, p.y), p.tile));
        for (const [dx, dy] of axes) {
            const line = lineThrough(temp, placements[0].x, placements[0].y, dx, dy);
            if (line.length >= 6) continue;
            const ends = [
                { x: line[0].x - dx, y: line[0].y - dy },
                { x: line.at(-1).x + dx, y: line.at(-1).y + dy }
            ];
            for (const end of ends) {
                for (const tile of uniqueHand) {
                    if (used.has(tile)) continue;
                    const nextPlacements = [...placements, { x: end.x, y: end.y, tile }];
                    if (!checkPlacements(board, nextPlacements).ok) continue;
                    used.add(tile);
                    extend(nextPlacements, used, [dx, dy]);
                    used.delete(tile);
                }
            }
        }
    };
    for (const cell of frontier(board)) {
        for (const tile of uniqueHand) {
            const placements = [{ x: cell.x, y: cell.y, tile }];
            if (!checkPlacements(board, placements).ok) continue;
            extend(placements, new Set([tile]), null);
        }
    }
    return moves;
}
