/**
 * キルトの見方と点の計算（DOM に依存しない。ゲームの進行・ビュー・CPU で同じものを使う）
 * キルト（quilt）：49マスの配列。パッチを置いたマスはタイルの id、ほかは null。縁のパッチは盤のデータから引く
 * - ボタン：同じ色が3枚以上つながったまとまり（縁のパッチも数える）。まとまりを広げても増えない。6色そろうと虹のボタン（1人1つ）
 * - 猫：猫ごとの2つの模様のまとまりが、条件（枚数・直線・形）を満たす。まとまりが条件より大きくてもよい。猫のいるまとまりには、もう猫は来ない
 * - 目標タイル：まわりの6枚の色か模様の数の並びが合えば点（両方なら高い方の点だけ）
 */

import { TILES, BOARDS, GOALS, CATS, COLORS, BUTTON_POINTS, RAINBOW_POINTS } from './data.js';
import { BORDER, GOAL_CELLS, NEIGHBORS, axialOf, cellFromAxial, DIRS } from './board.js';

// マスのパッチ（{ color, pattern }。空き・目標の置き場は null）
export function patchAt(board, quilt, cell) {
    const b = BORDER.indexOf(cell);
    if (b >= 0) return BOARDS[board].edges[b];
    const id = quilt[cell];
    return id == null ? null : TILES[id];
}

// cell を含む、同じ色（key = 'color'）か同じ模様（'pattern'）のつながり
export function groupAt(board, quilt, cell, key) {
    const start = patchAt(board, quilt, cell);
    if (!start) return [];
    const value = start[key];
    const seen = new Set([cell]);
    const queue = [cell];
    while (queue.length) {
        const c = queue.pop();
        NEIGHBORS[c].forEach(n => {
            if (seen.has(n)) return;
            const p = patchAt(board, quilt, n);
            if (p && p[key] === value) {
                seen.add(n);
                queue.push(n);
            }
        });
    }
    return [...seen];
}

// ---- 猫の形 ----

const rotate = ([q, r]) => [-r, q + r];
function rotations(shape) {
    const out = [];
    let cur = shape;
    for (let k = 0; k < 6; k++) {
        out.push(cur);
        cur = cur.map(rotate);
    }
    return out;
}
const SHAPES = {
    triangle: rotations([[0, 0], [1, 0], [0, 1]]),
    trapezoid: rotations([[0, 0], [1, 0], [2, 0], [1, -1], [2, -1]])
};

// まとまり cells が、猫の条件を満たすか
export function catFits(catId, cells) {
    const cat = CATS[catId];
    if (cat.kind === 'count') return cells.length >= cat.size;
    if (cells.length < cat.size) return false;
    const set = new Set(cells);
    if (cat.kind === 'line') {
        return cells.some(cell => DIRS.slice(0, 3).some(([dq, dr]) => {
            let [q, r] = axialOf(cell);
            let n = 0;
            while (set.has(cellFromAxial(q, r))) {
                n++;
                q += dq;
                r += dr;
            }
            return n >= cat.size;
        }));
    }
    return cells.some(cell => {
        const [q, r] = axialOf(cell);
        return SHAPES[cat.shape].some(shape => shape.every(([dq, dr]) => set.has(cellFromAxial(q + dq, r + dr))));
    });
}

// ---- 目標タイル ----

const sortedCounts = (values) => {
    const counts = {};
    values.forEach(v => { counts[v] = (counts[v] ?? 0) + 1; });
    return Object.values(counts).sort((a, b) => b - a);
};
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 置き場 spot（0〜2）の目標の結果：{ color, pattern, points }（まわりが埋まっていなければ false）
export function goalResult(board, quilt, goalId, spot) {
    const around = NEIGHBORS[GOAL_CELLS[spot]].map(c => patchAt(board, quilt, c));
    const goal = GOALS[goalId];
    if (around.length !== 6 || around.some(p => !p)) return { color: false, pattern: false, points: 0 };
    const color = sameList(sortedCounts(around.map(p => p.color)), goal.counts);
    const pattern = sameList(sortedCounts(around.map(p => p.pattern)), goal.counts);
    return { color, pattern, points: color && pattern ? goal.both : color || pattern ? goal.one : 0 };
}

// まだ合わせられるか（置いた分の数を多い順に、目標の数の並びの中に収められるか）
export function goalFeasible(values, counts) {
    const placed = sortedCounts(values);
    if (placed.length > counts.length) return false;
    return placed.every((x, i) => x <= counts[i]);
}

// ---- 点 ----

// 1人の点（player：{ board, quilt, goals, buttons, rainbow, cats }）
export function scorePlayer(player) {
    const goals = player.goals.map((g, spot) => goalResult(player.board, player.quilt, g, spot));
    const goalPoints = goals.reduce((s, g) => s + g.points, 0);
    const buttonPoints = player.buttons.length * BUTTON_POINTS + (player.rainbow ? RAINBOW_POINTS : 0);
    const catPoints = player.cats.reduce((s, c) => s + CATS[c.cat].points, 0);
    return { goals, goalPoints, buttonPoints, catPoints, total: goalPoints + buttonPoints + catPoints };
}

// 6色のボタンがそろったか
export const hasAllColors = (buttons) => COLORS.every(c => buttons.some(b => b.color === c));

/**
 * cell にパッチを置いた直後に来るもの（player の quilt には、もう置いてあること）
 * cats：[{ id, patterns }]。戻り値 { button: 色か null, rainbow: bool, cat: 猫の id か null }
 */
export function awardsFor(player, cats, cell) {
    const tile = TILES[player.quilt[cell]];
    const out = { button: null, rainbow: false, cat: null };
    const colorGroup = groupAt(player.board, player.quilt, cell, 'color');
    if (colorGroup.length >= 3 && !player.buttons.some(b => colorGroup.includes(b.cell))) {
        out.button = tile.color;
        out.rainbow = !player.rainbow && hasAllColors([...player.buttons, { color: tile.color }]);
    }
    const cat = cats.find(c => c.patterns.includes(tile.pattern));
    if (cat) {
        const patternGroup = groupAt(player.board, player.quilt, cell, 'pattern');
        if (!player.cats.some(c => patternGroup.includes(c.cell)) && catFits(cat.id, patternGroup)) out.cat = cat.id;
    }
    return out;
}
