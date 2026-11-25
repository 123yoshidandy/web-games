/**
 * 六角のマスの座標（軸座標 q, r。先の尖った向き＝上下に角がある向き）
 * 辺（となりの向き）の番号は、東から反時計回りに 0〜5：東・北東・北西・西・南西・南東
 * 2地形のタイルは、回転 rot のとき、辺 rot・rot+1・rot+2 が1つ目の地形、残りの3辺が2つ目の地形になる
 */

export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const key = (q, r) => `${q},${r}`;
export const parseKey = (k) => k.split(',').map(Number);
export const neighbor = (q, r, d) => [q + DIRS[d][0], r + DIRS[d][1]];
export const neighbors = (q, r) => DIRS.map(([dq, dr]) => [q + dq, r + dr]);
export const opposite = (d) => (d + 3) % 6;

// となりの向き（となりでなければ -1）
export function dirTo(q1, r1, q2, r2) {
    return DIRS.findIndex(([dq, dr]) => q1 + dq === q2 && r1 + dr === r2);
}

// 2つのマスの距離
export function distance(q1, r1, q2, r2) {
    const dq = q1 - q2;
    const dr = r1 - r2;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// 辺 d に向いている地形（habitats は1つか2つ）
export function edgeHabitat(habitats, rot, d) {
    if (habitats.length === 1) return habitats[0];
    return ((d - rot + 6) % 6) < 3 ? habitats[0] : habitats[1];
}

// 画面の座標（マスの中心から角までを size とする）
export function toPixel(q, r, size) {
    return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

// 画面の座標から、いちばん近いマス
export function fromPixel(x, y, size) {
    const fq = (Math.sqrt(3) / 3 * x - y / 3) / size;
    const fr = (2 / 3 * y) / size;
    return roundHex(fq, fr);
}

function roundHex(fq, fr) {
    const fs = -fq - fr;
    let q = Math.round(fq);
    let r = Math.round(fr);
    const s = Math.round(fs);
    const dq = Math.abs(q - fq);
    const dr = Math.abs(r - fr);
    const ds = Math.abs(s - fs);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    return [q + 0, r + 0];
}
