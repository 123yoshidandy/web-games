/**
 * 盤・駒・壁の絵（SVG）。盤の画面・タイトルの絵・遊び方の図で、同じ描き方を使う
 * 座標は「見る人から見た」マス（vx, vy）と壁の交点（ax, ay）。回すのは ui.js の側で行う
 */

export const CELL = 40;
export const GAP = 12;
export const PITCH = CELL + GAP;
export const MARGIN = 10;
export const SEAT_COLORS = ['#e4553f', '#3f87e0', '#45ad66', '#efbd32'];
export const SEAT_NAMES = ['赤', '青', '緑', '黄'];
const NS = 'http://www.w3.org/2000/svg';

export const boardSize = (n) => MARGIN * 2 + n * CELL + (n - 1) * GAP;
export const cellOrigin = (v) => MARGIN + v * PITCH;
export const cellCenter = (v) => MARGIN + v * PITCH + CELL / 2;

export function el(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

// 壁の四角（溝に収める）
export function wallRect(ax, ay, o) {
    const x = cellOrigin(ax);
    const y = cellOrigin(ay);
    return o === 'h'
        ? { x: x + 1, y: y + CELL + 1, width: 2 * CELL + GAP - 2, height: GAP - 2 }
        : { x: x + CELL + 1, y: y + 1, width: GAP - 2, height: 2 * CELL + GAP - 2 };
}

// n×n の盤の地（盤の板とマス）を描いた SVG を返す
export function createBoardSvg(n, svg = null) {
    const size = boardSize(n);
    svg ??= el('svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.classList.add('board-svg');
    el('rect', { class: 'plate', x: 0, y: 0, width: size, height: size, rx: 10 }, svg);
    const cells = el('g', { class: 'cells' }, svg);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            el('rect', { class: 'cell', x: cellOrigin(x), y: cellOrigin(y), width: CELL, height: CELL, rx: 4 }, cells);
        }
    }
    return svg;
}

export function drawWall(parent, { x, y, o }, className = 'wall') {
    return el('rect', { class: className, ...wallRect(x, y, o), rx: 3 }, parent);
}

// 駒（原点が中心。置き場所は transform で決める）
export function createPawn(seat, parent) {
    const g = el('g', { class: `pawn seat${seat}` }, parent);
    el('circle', { class: 'pawn-shadow', cx: 0, cy: 2.5, r: 14 }, g);
    el('circle', { class: 'pawn-body', cx: 0, cy: 0, r: 14, fill: SEAT_COLORS[seat] }, g);
    el('circle', { class: 'pawn-top', cx: 0, cy: -1, r: 7.5 }, g);
    return g;
}

export function placePawn(g, vx, vy) {
    g.style.transform = `translate(${cellCenter(vx)}px, ${cellCenter(vy)}px)`;
}

// ゴールの辺の帯（view の辺：0 下・1 左・2 上・3 右）
export function drawGoal(parent, viewSide, seat, n) {
    const size = boardSize(n);
    const t = 5;
    const inner = MARGIN + 2;
    const long = size - inner * 2;
    const at = (MARGIN - t) / 2;
    const rect = viewSide === 0 ? { x: inner, y: size - at - t, width: long, height: t }
        : viewSide === 2 ? { x: inner, y: at, width: long, height: t }
        : viewSide === 1 ? { x: at, y: inner, width: t, height: long }
        : { x: size - at - t, y: inner, width: t, height: long };
    return el('rect', { class: 'goal', ...rect, rx: 2, fill: SEAT_COLORS[seat] }, parent);
}

// 小さな盤の図（タイトル・遊び方）。pawns: [{ x, y, seat }]、walls: [{ x, y, o }]、targets: [[x, y]]、goals: [{ side, seat }]
export function diagram({ n = 9, pawns = [], walls = [], targets = [], goals = [], className = '' } = {}) {
    const svg = createBoardSvg(n);
    if (className) svg.classList.add(...className.split(' '));
    const deco = el('g', {}, svg);
    goals.forEach(g => drawGoal(deco, g.side, g.seat, n));
    targets.forEach(([x, y]) => el('circle', { class: 'target-dot', cx: cellCenter(x), cy: cellCenter(y), r: 7 }, deco));
    walls.forEach(w => drawWall(deco, w));
    pawns.forEach(p => placePawn(createPawn(p.seat, deco), p.x, p.y));
    return svg;
}
