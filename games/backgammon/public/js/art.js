/**
 * 盤・駒・ダイス・キューブの絵（SVG）
 * 盤は、下に来る人（bottom）から見たポイントの番号で描く：下の段は右から 1〜12、上の段は左から 13〜24
 * 真ん中の縦の帯がバー、右端がベアオフした駒の置き場（下の人は下、上の人は上）
 */

const NS = 'http://www.w3.org/2000/svg';

export const PW = 40;            // ポイントの幅
export const D = 36;             // 駒の直径
export const R = D / 2;
export const FRAME = 18;         // 枠（ポイントの番号を書く）
export const PH = 180;           // ポイントの長さ（駒5個分）
export const GAP = 56;           // 上下の段の間（ダイスを置く）
export const LX = FRAME;         // 左半分の左端
export const BAR_W = 40;
export const RX = LX + PW * 6 + BAR_W; // 右半分の左端
export const BAR_X = LX + PW * 6 + BAR_W / 2;
export const TRAY_X = RX + PW * 6 + 10;
export const TRAY_W = 44;
export const WIDTH = TRAY_X + TRAY_W + FRAME - 4;
export const TOP = FRAME;
export const BOTTOM = FRAME + PH * 2 + GAP;
export const HEIGHT = BOTTOM + FRAME;
export const MID = (TOP + BOTTOM) / 2;

export function el(name, attrs = {}, parent = null) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

// 下の人から見たポイント k（1〜24）の、駒を並べる列の x と、上の段か
export function pointX(k) {
    if (k <= 6) return RX + (6 - k) * PW + PW / 2;
    if (k <= 12) return LX + (12 - k) * PW + PW / 2;
    if (k <= 18) return LX + (k - 13) * PW + PW / 2;
    return RX + (k - 19) * PW + PW / 2;
}
export const isTop = (k) => k >= 13;

// 積む間隔（6個以上は詰める）
const spacing = (n) => n <= 5 ? D : (PH - D) / (n - 1);

/**
 * 駒の中心の位置。owner の駒が、owner から見たポイント i（25 はバー、0 はベアオフ）の、下から index 番目
 * count：その場所の駒の数（詰め方に使う）
 */
export function checkerXY(bottom, owner, i, index, count) {
    const mine = owner === bottom;
    if (i === 25) {
        // バー：下の人の駒は真ん中より上（入る先の側）、上の人の駒は下
        // 真ん中のキューブ（高さ 32）と重ならないように、その外から並べる
        const y = mine ? MID - 37 - index * (D + 2) : MID + 37 + index * (D + 2);
        return [BAR_X, y];
    }
    if (i === 0) {
        // ベアオフ：薄い板を積む（下の人は下から、上の人は上から）
        const y = mine ? BOTTOM - 6 - index * 11 : TOP + 6 + index * 11;
        return [TRAY_X + TRAY_W / 2, y];
    }
    const k = mine ? i : 25 - i;
    const x = pointX(k);
    const sp = spacing(count);
    return [x, isTop(k) ? TOP + R + index * sp : BOTTOM - R - index * sp];
}

// グラデーションの定義。隠れた画面（display: none）の中の定義は描かれないので、ページに大きさ0の SVG を置いて入れる
export function addDefs() {
    const holder = el('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position: absolute; width: 0; height: 0' });
    document.body.prepend(holder);
    const defs = el('defs', {}, holder);
    const grad = (id, stops, attrs = {}) => {
        const g = el('radialGradient', { id, cx: '38%', cy: '32%', r: '75%', ...attrs }, defs);
        stops.forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, g));
    };
    grad('ck-light', [['0%', '#fffdf6'], ['60%', '#efe4cc'], ['100%', '#c9b893']]);
    grad('ck-dark', [['0%', '#7a3a32'], ['55%', '#4e1d19'], ['100%', '#2a0d0b']]);
    const felt = el('linearGradient', { id: 'felt', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': '#2f6b4f' }, felt);
    el('stop', { offset: '100%', 'stop-color': '#21503a' }, felt);
}

// 盤の土台（枠・フェルト・ポイント・番号・バー・置き場）
export function drawBoard(svg) {
    const base = el('g', { class: 'board-base' }, svg);
    el('rect', { class: 'frame', x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 14 }, base);
    el('rect', { class: 'felt', x: LX, y: TOP, width: PW * 6, height: BOTTOM - TOP }, base);
    el('rect', { class: 'felt', x: RX, y: TOP, width: PW * 6, height: BOTTOM - TOP }, base);
    el('rect', { class: 'bar', x: LX + PW * 6, y: TOP - 4, width: BAR_W, height: BOTTOM - TOP + 8 }, base);
    el('rect', { class: 'tray', x: TRAY_X, y: TOP, width: TRAY_W, height: PH }, base);
    el('rect', { class: 'tray', x: TRAY_X, y: BOTTOM - PH, width: TRAY_W, height: PH }, base);
    for (let k = 1; k <= 24; k++) {
        const x = pointX(k);
        const top = isTop(k);
        const y0 = top ? TOP : BOTTOM;
        const tip = top ? TOP + PH - 12 : BOTTOM - PH + 12;
        el('polygon', { class: `point ${k % 2 ? 'odd' : 'even'}`, points: `${x - PW / 2 + 1},${y0} ${x + PW / 2 - 1},${y0} ${x},${tip}` }, base);
        const label = el('text', { class: 'point-no', x, y: top ? TOP - 5 : BOTTOM + 13 }, base);
        label.textContent = String(k);
    }
    return base;
}

// 盤の全部の駒を描く。hide：動かしている途中の駒 [{ owner, from }]（元の場所から1つずつ抜いて描く）
export function drawCheckers(layer, board, bottom, { hide = [] } = {}) {
    layer.replaceChildren();
    for (const owner of [0, 1]) {
        const side = board[owner];
        for (let i = 0; i <= 25; i++) {
            let n = side[i];
            n -= hide.filter(h => h.owner === owner && h.from === i).length;
            for (let j = 0; j < n; j++) {
                const [x, y] = checkerXY(bottom, owner, i, j, n);
                if (i === 0) drawSlab(layer, owner, x, y);
                else drawChecker(layer, owner, x, y, j === n - 1 && n > 5 && i !== 25 ? n : 0);
            }
        }
    }
}

export function drawChecker(layer, owner, x, y, label = 0) {
    const g = el('g', { class: `checker ${owner === 0 ? 'light' : 'dark'}`, transform: `translate(${x} ${y})` }, layer);
    el('circle', { class: 'ck-shadow', cx: 0, cy: 2, r: R - 0.5 }, g);
    el('circle', { class: 'ck-body', cx: 0, cy: 0, r: R - 1, fill: `url(#ck-${owner === 0 ? 'light' : 'dark'})` }, g);
    el('circle', { class: 'ck-ring', cx: 0, cy: 0, r: R - 7 }, g);
    if (label) {
        const t = el('text', { class: 'ck-count', x: 0, y: 5 }, g);
        t.textContent = String(label);
    }
    return g;
}

function drawSlab(layer, owner, x, y) {
    el('rect', { class: `slab ${owner === 0 ? 'light' : 'dark'}`, x: x - TRAY_W / 2 + 5, y: y - 4.5, width: TRAY_W - 10, height: 9, rx: 2.5 }, layer);
}

// ダイス：目の配置（-1〜1 の格子）
const PIPS = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
};

export function drawDie(layer, value, x, y, size, { owner = 0, used = false } = {}) {
    const g = el('g', { class: `die ${owner === 0 ? 'light' : 'dark'}${used ? ' used' : ''}`, transform: `translate(${x} ${y})` }, layer);
    el('rect', { class: 'die-body', x: -size / 2, y: -size / 2, width: size, height: size, rx: size * 0.2 }, g);
    const step = size * 0.27;
    for (const [px, py] of PIPS[value]) el('circle', { class: 'die-pip', cx: px * step, cy: py * step, r: size * 0.09 }, g);
    return g;
}

// ダイスの並び：下の人は右半分、上の人は左半分の真ん中。ゾロ目は4個を小さめに
export function drawDice(layer, dice, used, ownerSeat, bottom) {
    const list = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice;
    const size = list.length === 4 ? 30 : 36;
    const gap = size + 8;
    const cx = ownerSeat === bottom ? RX + PW * 3 : LX + PW * 3;
    list.forEach((v, i) => drawDie(layer, v, cx + (i - (list.length - 1) / 2) * gap, MID, size, { owner: ownerSeat, used: used[i] }));
}

// キューブ：真ん中ならバーの中央、持っている人の側の端
export function drawCube(layer, cube, bottom) {
    const y = cube.owner === null ? MID : cube.owner === bottom ? BOTTOM - 22 : TOP + 22;
    const g = el('g', { class: 'cube', transform: `translate(${BAR_X} ${y})` }, layer);
    el('rect', { class: 'cube-body', x: -16, y: -16, width: 32, height: 32, rx: 6 }, g);
    const t = el('text', { class: 'cube-value', x: 0, y: 6 }, g);
    t.textContent = String(cube.owner === null ? 64 : cube.value);
    return g;
}

// ポイント・バー・置き場を押す範囲（下の人から見た番号）
export function hitRect(k) {
    if (k === 25) return { x: LX + PW * 6, y: TOP, width: BAR_W, height: BOTTOM - TOP };
    if (k === 0) return { x: TRAY_X - 4, y: MID, width: TRAY_W + 8, height: BOTTOM - MID };
    const x = pointX(k) - PW / 2;
    return isTop(k) ? { x, y: TOP, width: PW, height: MID - TOP } : { x, y: MID, width: PW, height: BOTTOM - MID };
}

// 光らせる形：ポイントの三角と同じ形
export function pointShape(k) {
    const x = pointX(k);
    const top = isTop(k);
    const y0 = top ? TOP : BOTTOM;
    const tip = top ? TOP + PH - 12 : BOTTOM - PH + 12;
    return `${x - PW / 2 + 1},${y0} ${x + PW / 2 - 1},${y0} ${x},${tip}`;
}

// 行き先の印：駒が着く位置に点線の駒を描き、使う目を書く（「3+5」のように2つ以上の目を続けて使う行き先もある）
export function drawTarget(layer, x, y, label) {
    const g = el('g', { class: 'target', transform: `translate(${x} ${y})` }, layer);
    el('circle', { class: 'target-ring', cx: 0, cy: 0, r: R - 2 }, g);
    const t = el('text', { class: `target-label${label.length > 1 ? ' long' : ''}`, x: 0, y: label.length > 3 ? 4 : 6 }, g);
    t.textContent = label;
    return g;
}
