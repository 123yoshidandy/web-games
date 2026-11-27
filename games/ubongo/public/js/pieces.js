/**
 * ピース（ポリオミノ）の形と向き
 * 向きは「裏返し（flip）→ 時計回りに rot 回」で決め、左上を (0, 0) にそろえる
 * 置き方は { id, rot, flip, x, y }（x・y は向きをそろえた形の左上のマス）
 */

// 12種のピース。マスは [x, y]
export const PIECES = {
    I3: [[0, 0], [1, 0], [2, 0]],
    L3: [[0, 0], [0, 1], [1, 1]],
    I4: [[0, 0], [1, 0], [2, 0], [3, 0]],
    L4: [[0, 0], [0, 1], [0, 2], [1, 2]],
    T4: [[0, 0], [1, 0], [2, 0], [1, 1]],
    S4: [[1, 0], [2, 0], [0, 1], [1, 1]],
    O4: [[0, 0], [1, 0], [0, 1], [1, 1]],
    L5: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],
    P5: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
    Y5: [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]],
    N5: [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]],
    U5: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]]
};

export const PIECE_IDS = Object.keys(PIECES);

// ピースの色（盤面とトレイで同じ）
export const PIECE_COLORS = {
    I3: '#e8a33d', L3: '#d9644a', I4: '#4f9fd8', L4: '#7a6fd6', T4: '#d65f9b', S4: '#4cb38a',
    O4: '#e6c84a', L5: '#3f7fbf', P5: '#c7774a', Y5: '#8bbf4a', N5: '#5bb7c4', U5: '#b86ad1'
};

export const pieceSize = (id) => PIECES[id].length;

const normalize = (cells) => {
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};

// 向きを変えたマス（左上を (0, 0) にそろえ、上の行から順に並べる）
export function orient(id, rot = 0, flip = 0) {
    let cells = PIECES[id].map(([x, y]) => [flip ? -x : x, y]);
    for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([x, y]) => [-y, x]);
    return normalize(cells);
}

const keyOf = (cells) => cells.map(([x, y]) => `${x},${y}`).join(' ');

// 形の違う向きだけ（解くときに同じ形を何度も試さない）
const uniqueCache = new Map();
export function uniqueOrientations(id) {
    if (!uniqueCache.has(id)) {
        const seen = new Set();
        const list = [];
        for (let flip = 0; flip < 2; flip++) {
            for (let rot = 0; rot < 4; rot++) {
                const cells = orient(id, rot, flip);
                const key = keyOf(cells);
                if (seen.has(key)) continue;
                seen.add(key);
                list.push({ rot, flip, cells });
            }
        }
        uniqueCache.set(id, list);
    }
    return uniqueCache.get(id);
}

// 置いたピースが盤面で占めるマス
export const placedCells = ({ id, rot, flip, x, y }) => orient(id, rot, flip).map(([cx, cy]) => [cx + x, cy + y]);

export const sizeOf = (cells) => ({
    w: Math.max(...cells.map(([x]) => x)) + 1,
    h: Math.max(...cells.map(([, y]) => y)) + 1
});

// 形（'#' がマスの文字列の配列）を、マスの一覧にする
export function shapeCells(rows) {
    const cells = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') cells.push([x, y]); }));
    return cells;
}
