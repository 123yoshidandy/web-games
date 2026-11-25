/**
 * 形の道具：回転・裏返し・置ける場所
 * 形は [[行, 列], ...] の配列。マスの番号は 行×11＋列
 */

import { SIZE } from './cards.js';

// 左上を (0, 0) にそろえ、行・列の順に並べる
export function normalize(cells) {
    const minR = Math.min(...cells.map(([r]) => r));
    const minC = Math.min(...cells.map(([, c]) => c));
    return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

const keyOf = (cells) => normalize(cells).map(([r, c]) => `${r},${c}`).join(' ');

// 時計回りに90度
export const rotate = (cells) => normalize(cells.map(([r, c]) => [c, -r]));
// 左右を裏返す
export const flip = (cells) => normalize(cells.map(([r, c]) => [r, -c]));

// 回転と裏返しでできる、重ならない向き（最大8つ）
export function orientations(cells) {
    const result = [];
    const seen = new Set();
    let current = normalize(cells);
    for (let f = 0; f < 2; f++) {
        for (let i = 0; i < 4; i++) {
            const key = keyOf(current);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(current);
            }
            current = rotate(current);
        }
        current = flip(current);
    }
    return result;
}

export const sizeOf = (cells) => [Math.max(...cells.map(([r]) => r)) + 1, Math.max(...cells.map(([, c]) => c)) + 1];

// 向きを決めた形を、左上 (r, c) に置いたときのマスの番号。地図からはみ出すなら null
export function placeAt(cells, r, c) {
    const result = [];
    for (const [dr, dc] of cells) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return null;
        result.push(rr * SIZE + cc);
    }
    return result;
}

// 選んだマスが、形を回転・裏返ししたものと同じか（rotations：false なら回さない向きだけ）
export function matchesShape(cellNumbers, shapeCells, { rotations = true } = {}) {
    if (!Array.isArray(cellNumbers) || cellNumbers.length !== shapeCells.length) return false;
    const coords = cellNumbers.map(n => [Math.floor(n / SIZE), n % SIZE]);
    const key = keyOf(coords);
    return rotations ? orientations(shapeCells).some(o => keyOf(o) === key) : keyOf(shapeCells) === key;
}

// 盤に置けるすべての置き方（マスの番号の配列）。canUse(cell)：そのマスに描けるか
export function allPlacements(shapeCells, canUse, { rotations = true } = {}) {
    const result = [];
    const seen = new Set();
    for (const o of rotations ? orientations(shapeCells) : [normalize(shapeCells)]) {
        const [h, w] = sizeOf(o);
        for (let r = 0; r <= SIZE - h; r++) {
            for (let c = 0; c <= SIZE - w; c++) {
                const cells = placeAt(o, r, c);
                if (!cells.every(canUse)) continue;
                const key = [...cells].sort((a, b) => a - b).join(',');
                if (seen.has(key)) continue;
                seen.add(key);
                result.push(cells);
            }
        }
    }
    return result;
}
