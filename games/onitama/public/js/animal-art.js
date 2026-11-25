// 動きのカード16枚の動物の絵（墨絵風）。viewBox="0 0 100 100" で描く SVG の断片。

const INK = '#1a1612';
const SHU = '#b8402a';
const PAPER = '#efe6d2';

// <defs> に一度だけ入れる定義
export const INK_DEFS = `
<filter id="ink-rough" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
  <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="3" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="ink-bleed" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
  <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
  <feGaussianBlur stdDeviation="0.8"/>
</filter>`;

const f = (n) => Math.round(n * 10) / 10;
const mx = (pts) => pts.map(([x, y]) => [100 - x, y]);

// 点の列を Catmull-Rom でなめらかにする
function spline(pts, seg = 10) {
    if (pts.length < 2) return pts;
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
        const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
        for (let s = 0; s < seg; s++) {
            const t = s / seg, t2 = t * t, t3 = t2 * t;
            const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
            out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
        }
    }
    out.push(pts[n - 1]);
    return out;
}

function normals(P) {
    return P.map((p, i) => {
        const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const l = Math.hypot(dx, dy) || 1;
        return [-dy / l, dx / l];
    });
}

const smooth = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

// 筆の線：入りと抜きで細くなる塗りのパス。w は数か、制御点ごとの太さの配列
function brush(pts, w = 3, o = {}) {
    const { head = 0.2, tail = 0.3, tip = 0.15, color = INK, op = 1 } = o;
    const P = spline(pts);
    const N = normals(P);
    const len = [0];
    for (let i = 1; i < P.length; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = len[len.length - 1] || 1;
    const L1 = [], R1 = [];
    P.forEach((p, i) => {
        const t = len[i] / L;
        let base = w;
        if (Array.isArray(w)) {
            const u = (i / (P.length - 1)) * (w.length - 1);
            const k = Math.min(Math.floor(u), w.length - 2);
            base = w[k] + (w[k + 1] - w[k]) * (u - k);
        }
        const e1 = head > 0 ? smooth(t / head) : 1;
        const e2 = tail > 0 ? smooth((1 - t) / tail) : 1;
        const h = (base / 2) * (tip + (1 - tip) * Math.min(e1, e2));
        L1.push([p[0] + N[i][0] * h, p[1] + N[i][1] * h]);
        R1.push([p[0] - N[i][0] * h, p[1] - N[i][1] * h]);
    });
    const all = L1.concat(R1.reverse());
    const d = 'M' + all.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z';
    return `<path d="${d}" fill="${color}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
}

// 楕円を一筆で描く（少し隙間を残す）
function ring(cx, cy, rx, ry, w, o = {}) {
    const { start = -2.2, span = 0.93, rot = 0 } = o;
    const pts = [];
    const n = 16;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
        const a = start + (Math.PI * 2 * span * i) / n;
        const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        pts.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return brush(pts, w, { head: 0.1, tail: 0.15, ...o });
}

// 線に沿って、片側へ短い筆を並べる（たてがみ・とげなど）
function along(pts, n, lenPx, w, o = {}) {
    const { from = 0.1, to = 0.9, side = 1, lean = 0.5 } = o;
    const P = spline(pts);
    const N = normals(P);
    let out = '';
    for (let k = 0; k < n; k++) {
        const t = from + ((to - from) * k) / Math.max(n - 1, 1);
        const i = Math.round(t * (P.length - 1));
        const p = P[i], nn = N[i];
        const b = P[Math.min(i + 1, P.length - 1)], a = P[Math.max(i - 1, 0)];
        const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const tx = (b[0] - a[0]) / dl, ty = (b[1] - a[1]) / dl;
        const q = [p[0] + side * nn[0] * lenPx + tx * lenPx * lean, p[1] + side * nn[1] * lenPx + ty * lenPx * lean];
        out += brush([p, q], w, { head: 0, tail: 0.9, tip: 0.05 });
    }
    return out;
}

// 線を横にずらした点の列
function offset(pts, d) {
    const P = spline(pts, 6);
    const N = normals(P);
    return P.map((p, i) => [p[0] + N[i][0] * d, p[1] + N[i][1] * d]);
}

const wash = (d, op = 0.22) => `<path d="${d}" fill="${INK}" fill-opacity="${op}"/>`;
const blot = (cx, cy, rx, ry, op = 0.22, rot = 0) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}" fill-opacity="${op}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}/>`;
const dot = (cx, cy, r, color = INK) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;

// にじみの層・筆の層・その上の色の層をまとめる
const art = (washes, strokes, top = '') =>
    `<g><g filter="url(#ink-bleed)">${washes}</g><g filter="url(#ink-rough)">${strokes}</g>${top}</g>`;

// ---- 各動物 ----

function tiger() {
    const side = (m) => {
        const t = m ? mx : (p) => p;
        return brush(t([[30, 36], [22, 22], [36, 24]]), 4, { tail: 0.4 }) +
            brush(t([[29, 32], [19, 46], [21, 64], [34, 80], [50, 86]]), 4) +
            brush(t([[17, 50], [29, 54]]), 4.2, { head: 0 }) +
            brush(t([[17, 59], [30, 61]]), 4.2, { head: 0 }) +
            brush(t([[21, 68], [31, 68]]), 3.5, { head: 0 }) +
            brush(t([[32, 47], [38, 44], [45, 47]]), 2.4) +
            brush(t([[39, 30], [43, 41]]), 3.6, { head: 0 });
    };
    return art(
        blot(50, 57, 30, 28, 0.2) + blot(27, 27, 6, 5, 0.4) + blot(73, 27, 6, 5, 0.4),
        side(false) + side(true) +
        brush([[36, 26], [50, 23], [64, 26]], 2.6) +
        brush([[50, 25], [50, 40]], 4.2, { head: 0 }) +
        brush([[45, 33], [55, 33]], 2.6) +
        wash('M44,59 L56,59 L50,66 Z', 1) +
        brush([[50, 65], [50, 70]], 2) +
        brush([[41, 72], [46, 75], [50, 70]], 2.2) +
        brush([[50, 70], [54, 75], [59, 72]], 2.2),
        dot(39.5, 47.5, 1.9, SHU) + dot(60.5, 47.5, 1.9, SHU)
    );
}

function dragon() {
    const body = [[30, 34], [44, 44], [60, 40], [72, 30], [84, 38], [80, 54], [62, 60], [44, 62], [36, 74], [48, 84], [66, 84], [88, 78]];
    return art(
        brush(body, [11, 11, 10, 10, 9, 9, 8, 8, 7, 6, 5, 3], { op: 0.25, head: 0, tail: 0.15 }) +
        dot(12, 62, 8, SHU).replace('/>', ' fill-opacity="0.25"/>'),
        brush(body, [7, 7, 6.5, 6, 6, 5.5, 5, 5, 4.5, 4, 3, 2], { head: 0, tail: 0.25 }) +
        along(body, 14, 4.5, 2.4, { from: 0.06, to: 0.86, side: -1, lean: 0.6 }) +
        wash('M37,38 C28,41 18,38 10,36 L5,32 L14,30 L5,27 C10,22 17,16 26,14 C34,12 39,19 39,27 Z', 1) +
        brush([[29, 15], [31, 8], [35, 2]], 3.2, { head: 0 }) + brush([[31, 9], [26, 5]], 2, { head: 0 }) +
        brush([[33, 16], [40, 10], [46, 7]], 3.2, { head: 0 }) + brush([[40, 10], [40, 4]], 2, { head: 0 }) +
        along([[38, 22], [42, 32], [46, 42]], 4, 6, 2.6, { side: 1, lean: 0.8, from: 0, to: 0.9 }) +
        brush([[8, 34], [4, 44], [10, 54], [6, 62]], 1.8, { head: 0 }) +
        brush([[10, 25], [6, 16], [1, 12]], 1.8, { head: 0 }) +
        brush([[33, 34], [42, 30], [48, 34]], 2.4) +
        brush([[50, 60], [46, 70]], 3.4, { head: 0, tail: 0.1 }) +
        brush([[46, 70], [41, 73]], 1.8, { head: 0 }) + brush([[46, 70], [45, 76]], 1.8, { head: 0 }) + brush([[46, 70], [50, 75]], 1.8, { head: 0 }) +
        brush([[80, 50], [90, 56]], 3.4, { head: 0, tail: 0.1 }) +
        brush([[90, 56], [95, 54]], 1.8, { head: 0 }) + brush([[90, 56], [94, 61]], 1.8, { head: 0 }) +
        ring(12, 62, 7, 7, 2),
        dot(26, 21, 2.2, SHU) + dot(12, 62, 3.5, SHU)
    );
}

function frog() {
    const half = (m) => {
        const t = m ? mx : (p) => p;
        return brush(t([[30, 44], [24, 58], [30, 74], [50, 80]]), 3.6) +
            ring(m ? 64 : 36, 37, 9, 8.5, 3) +
            brush(t([[28, 66], [14, 64], [10, 76], [22, 84]]), 4, { head: 0 }) +
            brush(t([[22, 84], [14, 90]]), 2, { head: 0 }) + brush(t([[22, 84], [20, 92]]), 2, { head: 0 }) + brush(t([[22, 84], [28, 90]]), 2, { head: 0 }) +
            brush(t([[40, 74], [37, 86]]), 3.4, { head: 0, tail: 0.1 }) +
            brush(t([[37, 86], [31, 90]]), 1.8, { head: 0 }) + brush(t([[37, 86], [37, 93]]), 1.8, { head: 0 }) + brush(t([[37, 86], [43, 91]]), 1.8, { head: 0 });
    };
    return art(
        blot(50, 62, 27, 20, 0.22) + blot(36, 37, 9, 8.5, 0.12) + blot(64, 37, 9, 8.5, 0.12) + blot(18, 74, 8, 9, 0.18) + blot(82, 74, 8, 9, 0.18),
        half(false) + half(true) +
        brush([[40, 41], [50, 40], [60, 41]], 2.4) +
        dot(37, 38, 4) + dot(63, 38, 4) +
        brush([[33, 55], [42, 59], [50, 59.5], [58, 59], [67, 55]], 2.6) +
        dot(45, 50, 1.2) + dot(55, 50, 1.2)
    );
}

function rabbit() {
    return art(
        blot(60, 67, 24, 17, 0.2) + blot(33, 46, 12, 11, 0.2) +
        brush([[36, 38], [38, 22], [44, 6]], 8, { op: 0.3, head: 0.1 }) + brush([[31, 38], [27, 22], [24, 8]], 7, { op: 0.3, head: 0.1 }) +
        blot(85, 68, 6, 6, 0.3),
        brush([[34, 38], [37, 22], [44, 6], [47, 10], [43, 26], [40, 38]], 2.6, { head: 0.05, tail: 0.05 }) +
        brush([[30, 37], [26, 22], [23, 8], [28, 10], [33, 24], [35, 36]], 2.4, { head: 0.05, tail: 0.05 }) +
        brush([[44, 40], [36, 35], [25, 38], [19, 48], [24, 56], [36, 58], [43, 52]], 3.2, { head: 0.1, tail: 0.1 }) +
        brush([[42, 52], [58, 47], [74, 52], [83, 64], [80, 78], [66, 84]], 3.6) +
        brush([[38, 60], [35, 72], [40, 83]], 3.4) +
        brush([[38, 84], [52, 84]], 3, { head: 0.1 }) +
        brush([[58, 84], [78, 86]], 3.4, { head: 0.1 }) +
        brush([[64, 62], [70, 72], [66, 80]], 2.2) +
        ring(86, 68, 5, 5, 2) +
        dot(19.5, 49, 1.6) + brush([[20, 52], [16, 55]], 1, { head: 0 }) + brush([[21, 53], [17, 58]], 1, { head: 0 }),
        dot(28, 45, 2.2, SHU)
    );
}

function crab() {
    const half = (m) => {
        const t = m ? mx : (p) => p;
        return brush(t([[34, 50], [26, 42], [22, 34]]), 4.2, { head: 0, tail: 0.1 }) +
            brush(t([[24, 38], [18, 30]]), 9, { head: 0.2, tail: 0.1 }) +
            brush(t([[17, 31], [11, 23], [14, 13]]), 4.6, { head: 0.1, tail: 0.6 }) +
            brush(t([[20, 29], [25, 22], [22, 15]]), 3.8, { head: 0.1, tail: 0.6 }) +
            brush(t([[30, 55], [16, 52], [8, 60]]), 3, { head: 0, tail: 0.4 }) +
            brush(t([[30, 60], [17, 63], [11, 73]]), 3, { head: 0, tail: 0.4 }) +
            brush(t([[33, 64], [22, 71], [18, 82]]), 3, { head: 0, tail: 0.4 }) +
            brush(t([[38, 68], [30, 78], [28, 88]]), 3, { head: 0, tail: 0.4 }) +
            brush(t([[45, 44], [43, 36]]), 1.8, { head: 0 }) + dot(m ? 57 : 43, 35, 2.4);
    };
    return art(
        blot(50, 57, 22, 15, 0.45) + blot(18, 28, 7, 9, 0.3, -30) + blot(82, 28, 7, 9, 0.3, 30),
        half(false) + half(true) +
        ring(50, 57, 22, 15, 3.4, { start: -1.5 }) +
        brush([[40, 54], [46, 51], [50, 54], [54, 51], [60, 54]], 2) +
        brush([[42, 62], [50, 64], [58, 62]], 1.8)
    );
}

function elephant() {
    return art(
        blot(60, 54, 27, 18, 0.25) + blot(28, 40, 12, 12, 0.2) +
        wash('M31,31 C40,28 47,36 46,46 C45,54 40,58 33,55 C29,50 28,40 31,31 Z', 0.35),
        brush([[38, 34], [56, 30], [76, 34], [88, 46], [88, 62]], 3.8) +
        brush([[38, 32], [28, 25], [19, 31], [17, 43]], 3.6, { head: 0.1, tail: 0 }) +
        brush([[17, 42], [14, 56], [13, 70], [17, 79], [22, 76]], [6, 5.5, 4.5, 3, 2.2], { head: 0, tail: 0.2 }) +
        brush([[31, 31], [40, 29], [47, 38], [45, 50], [38, 57], [32, 53]], 2.8, { head: 0.05 }) +
        brush([[22, 52], [27, 58], [34, 58]], 2.4) +
        brush([[40, 62], [40, 86]], 6.5, { head: 0, tail: 0.05, tip: 0.6 }) +
        brush([[50, 66], [50, 86]], 6, { head: 0, tail: 0.05, tip: 0.6 }) +
        brush([[72, 66], [72, 86]], 6, { head: 0, tail: 0.05, tip: 0.6 }) +
        brush([[82, 60], [82, 86]], 6.5, { head: 0, tail: 0.05, tip: 0.6 }) +
        brush([[54, 70], [62, 71], [68, 70]], 3) +
        brush([[88, 48], [93, 58], [94, 64]], 1.8, { head: 0 }) +
        dot(24, 38, 1.8)
    );
}

function goose() {
    const neck = [[42, 64], [34, 52], [30, 38], [31, 27], [35, 21]];
    return art(
        wash('M34,66 C40,54 58,50 78,54 C88,56 94,60 90,66 C80,76 50,78 34,66 Z', 0.22) +
        brush(neck, 9, { op: 0.25, head: 0, tail: 0 }),
        brush([[34, 66], [48, 76], [70, 76], [88, 68], [93, 58]], 3.6) +
        brush([[46, 56], [64, 51], [82, 55], [93, 58]], 3) +
        brush([[52, 62], [66, 59], [82, 63]], 2.6) +
        brush([[58, 68], [74, 67]], 2.2) +
        brush(neck, [6, 5, 4.5, 5, 6], { head: 0, tail: 0 }) +
        dot(35, 19, 6) +
        brush([[30, 18], [22, 21], [15, 23]], 4, { head: 0, tail: 0.6 }) +
        dot(29, 14.5, 2.6) +
        brush([[14, 82], [32, 84]], 1.6) + brush([[54, 86], [86, 83]], 1.6) + brush([[22, 90], [44, 91]], 1.2),
        dot(36.5, 17.5, 1.3, PAPER)
    );
}

function rooster() {
    return art(
        blot(56, 56, 21, 19, 0.2) + blot(38, 31, 7, 7, 0.2),
        brush([[66, 44], [72, 24], [84, 14], [93, 22], [90, 44]], [6, 6, 5, 4, 3]) +
        brush([[68, 50], [78, 32], [88, 33], [90, 56]], [5, 5, 4, 2.5]) +
        brush([[70, 58], [82, 48], [86, 64]], [4, 4, 2]) +
        brush([[33, 22], [29, 30], [32, 38], [40, 39]], 3) +
        brush([[40, 26], [44, 36], [44, 44]], 3) +
        brush([[38, 40], [36, 54], [44, 68], [58, 74], [70, 68]], 3.8) +
        brush([[46, 38], [56, 43], [66, 42]], 2.6) +
        brush([[48, 50], [60, 54], [70, 64]], 3) + brush([[50, 58], [60, 62], [66, 70]], 2.4) +
        wash('M30,24 L19,28 L29,31 Z', 1) +
        dot(35, 27, 1.8) +
        brush([[52, 73], [50, 88]], 3, { head: 0, tail: 0.1 }) + brush([[60, 73], [62, 88]], 3, { head: 0, tail: 0.1 }) +
        brush([[50, 88], [43, 91]], 1.8, { head: 0 }) + brush([[50, 88], [55, 91]], 1.8, { head: 0 }) +
        brush([[62, 88], [56, 91]], 1.8, { head: 0 }) + brush([[62, 88], [69, 91]], 1.8, { head: 0 }),
        `<path d="M29,25 L29,16 L33,20 L35,11 L38,18 L42,12 L43,25 Z" fill="${SHU}"/>` +
        `<path d="M29,32 C26,34 26,40 29,41 C32,40 32,35 31,32 Z" fill="${SHU}"/>`
    );
}

function monkey() {
    const half = (m) => {
        const t = m ? mx : (p) => p;
        return ring(m ? 79 : 21, 44, 8, 10, 3) +
            brush(t([[34, 44], [38, 40], [44, 42]]), 2.6) +
            brush(t([[30, 64], [18, 74], [14, 92]]), 4) +
            brush(t([[36, 72], [38, 84], [46, 90]]), 3);
    };
    return art(
        blot(50, 42, 27, 26, 0.35) + blot(21, 44, 8, 10, 0.3) + blot(79, 44, 8, 10, 0.3) +
        wash('M24,70 C30,62 70,62 76,70 L84,94 L16,94 Z', 0.2),
        half(false) + half(true) +
        brush([[30, 26], [40, 17], [50, 15], [60, 17], [70, 26]], 3.4) +
        along([[34, 20], [50, 14], [66, 20]], 5, 4, 2, { side: 1, lean: 0 }) +
        `<path d="M50,35 C45,28 31,29 31,42 C31,55 39,67 50,70 C61,67 69,55 69,42 C69,29 55,28 50,35 Z" fill="${PAPER}"/>` +
        brush([[50, 35], [45, 29], [33, 30], [31, 44], [38, 62], [50, 70], [62, 62], [69, 44], [67, 30], [55, 29], [50, 35]], 2.6, { head: 0.05, tail: 0.05 }) +
        dot(42, 46, 2.6) + dot(58, 46, 2.6) +
        dot(47.5, 56, 1.2) + dot(52.5, 56, 1.2) +
        brush([[42, 62], [50, 65], [58, 62]], 2.2)
    );
}

function mantis() {
    const abd = [[50, 58], [70, 66], [92, 80]];
    return art(
        brush(abd, [14, 14, 3], { op: 0.45, head: 0.3, tail: 0.1 }),
        brush([[49, 56], [62, 60], [78, 68], [92, 80]], 3.2) +
        brush([[52, 64], [68, 72], [92, 80]], 3) +
        brush([[50, 58], [44, 44], [38, 30]], [6.5, 5, 4.5], { head: 0, tail: 0.1 }) +
        wash('M27,22 L44,18 L37,31 Z', 1) + dot(29, 21, 3) +
        brush([[31, 20], [22, 9], [12, 6]], 1.6, { head: 0 }) +
        brush([[35, 19], [32, 8], [28, 2]], 1.6, { head: 0 }) +
        brush([[40, 36], [34, 46]], 4.4, { head: 0, tail: 0 }) +
        brush([[34, 46], [26, 38], [20, 26]], 5.4, { head: 0, tail: 0.1 }) +
        brush([[20, 26], [22, 36], [27, 44], [24, 46]], 3, { head: 0 }) +
        along([[34, 46], [26, 38], [20, 26]], 4, 2.6, 1.2, { side: -1, from: 0.2, to: 0.85, lean: -0.3 }) +
        brush([[44, 38], [42, 50]], 3.4, { head: 0, tail: 0 }) +
        brush([[42, 50], [33, 42], [28, 32]], 4, { head: 0, tail: 0.1 }) +
        brush([[28, 32], [31, 42], [34, 47]], 2.4, { head: 0 }) +
        brush([[52, 60], [44, 74], [40, 90]], 2.4, { head: 0 }) +
        brush([[56, 62], [62, 76], [58, 92]], 2.4, { head: 0 }) +
        brush([[60, 64], [74, 74], [80, 90]], 2.4, { head: 0 })
    );
}

function horse() {
    return art(
        blot(62, 52, 22, 12, 0.25) +
        wash('M48,40 C42,30 38,22 34,16 L26,18 C22,24 16,32 13,36 C11,40 15,44 19,42 L28,36 C32,44 38,54 44,60 Z', 0.3),
        brush([[34, 16], [42, 26], [48, 40], [58, 42], [74, 40], [84, 46]], 3.4) +
        brush([[84, 46], [86, 56], [80, 62]], 3.4) +
        brush([[44, 60], [58, 63], [78, 62]], 3) +
        brush([[30, 36], [36, 48], [44, 60]], 3) +
        brush([[36, 16], [30, 15], [24, 21], [13, 35], [14, 41], [20, 41], [29, 35]], 3, { head: 0.05, tail: 0.1 }) +
        brush([[32, 16], [34, 7]], 3, { head: 0 }) +
        along([[36, 15], [44, 26], [50, 38]], 6, 6, 2.6, { side: -1, lean: 0.6 }) +
        dot(27, 22, 1.8) + dot(16, 37, 1) +
        brush([[47, 61], [44, 74], [46, 88]], 3, { head: 0, tail: 0.05 }) +
        brush([[53, 62], [56, 74], [52, 88]], 3, { head: 0, tail: 0.05 }) +
        brush([[75, 61], [80, 72], [76, 88]], 3, { head: 0, tail: 0.05 }) +
        brush([[81, 60], [88, 72], [86, 88]], 3, { head: 0, tail: 0.05 }) +
        brush([[43, 88], [49, 88]], 2.6, { head: 0, tail: 0 }) + brush([[50, 88], [55, 88]], 2.6, { head: 0, tail: 0 }) +
        brush([[73, 88], [79, 88]], 2.6, { head: 0, tail: 0 }) + brush([[83, 88], [89, 88]], 2.6, { head: 0, tail: 0 }) +
        brush([[85, 46], [92, 54], [94, 68], [90, 80]], 5, { head: 0 }) +
        brush([[86, 48], [96, 58], [97, 74]], 1.8, { head: 0 })
    );
}

function ox() {
    const half = (m) => {
        const t = m ? mx : (p) => p;
        return brush(t([[37, 31], [24, 29], [14, 22], [12, 10]]), [7, 6, 4, 2], { head: 0 }) +
            brush(t([[34, 38], [24, 43], [15, 42]]), 5, { head: 0.1, tail: 0.5 }) +
            brush(t([[36, 32], [36, 50], [40, 66]]), 3.4) +
            brush(t([[42, 43], [38, 41]]), 2) +
            dot(m ? 59 : 41, 46, 2.4);
    };
    return art(
        wash('M34,32 C34,24 66,24 66,32 C66,48 62,62 61,70 C61,82 39,82 39,70 C38,62 34,48 34,32 Z', 0.22) +
        blot(50, 73, 13, 8, 0.25),
        half(false) + half(true) +
        brush([[38, 28], [50, 25], [62, 28]], 3) +
        along([[42, 27], [50, 25], [58, 27]], 5, 5, 1.8, { side: 1, lean: 0 }) +
        ring(50, 73, 13, 8, 3, { start: -1.2 }) +
        wash('M43,71 C45,69 48,71 46,74 Z', 1) + wash('M57,71 C55,69 52,71 54,74 Z', 1)
    );
}

function crane() {
    return art(
        blot(60, 46, 19, 11, 0.12, 15),
        brush([[44, 42], [54, 36], [68, 38], [80, 46]], 3.2) +
        brush([[46, 50], [58, 56], [72, 54]], 3) +
        brush([[68, 46], [82, 52], [90, 62]], 7, { head: 0.1 }) +
        brush([[68, 50], [78, 58], [83, 68]], 6, { head: 0.1 }) +
        brush([[70, 44], [86, 46], [94, 54]], 4, { head: 0.1 }) +
        brush([[47, 45], [40, 33], [36, 21], [32, 13]], [5, 4.5, 4, 4], { head: 0, tail: 0 }) +
        dot(31, 11, 4.5) +
        brush([[28, 12], [20, 15], [10, 19]], 3, { head: 0, tail: 0.7 }) +
        brush([[58, 55], [58, 72], [56, 92]], 1.8, { head: 0, tail: 0 }) +
        brush([[63, 55], [67, 72], [64, 92]], 1.8, { head: 0, tail: 0 }) +
        brush([[56, 92], [50, 94]], 1.4, { head: 0 }) + brush([[56, 92], [61, 94]], 1.4, { head: 0 }) +
        brush([[64, 92], [58, 94]], 1.4, { head: 0 }) + brush([[64, 92], [70, 94]], 1.4, { head: 0 }),
        dot(32, 8, 2.8, SHU)
    );
}

function boar() {
    const back = [[30, 40], [44, 31], [60, 31], [76, 38], [85, 50]];
    return art(
        wash('M22,58 C24,44 34,34 50,32 C66,32 80,40 84,52 C86,62 80,70 70,72 L40,72 C30,72 22,66 22,58 Z', 0.45),
        brush(back, 3.4) +
        along(back, 11, 5, 2.4, { side: -1, from: 0.05, to: 0.75, lean: 0.4 }) +
        brush([[85, 50], [84, 62], [76, 70]], 3) +
        brush([[38, 72], [56, 73], [72, 71]], 2.6) +
        brush([[30, 40], [22, 50], [12, 54]], 3, { tail: 0.05 }) +
        brush([[12, 63], [22, 64], [30, 66]], 3, { head: 0.05 }) +
        ring(11, 58.5, 2.5, 5, 2.4) +
        brush([[19, 63], [15, 57], [19, 51]], 2.6, { head: 0, tail: 0.6, color: PAPER }) +
        brush([[19, 64], [15, 57], [19, 50]], 1, { head: 0, tail: 0.6 }) +
        wash('M36,42 L39,32 L45,40 Z', 1) +
        dot(29, 48, 1.8) +
        brush([[36, 70], [34, 87]], 4.6, { head: 0, tail: 0.05, tip: 0.5 }) +
        brush([[44, 72], [45, 87]], 4.6, { head: 0, tail: 0.05, tip: 0.5 }) +
        brush([[70, 70], [71, 87]], 4.6, { head: 0, tail: 0.05, tip: 0.5 }) +
        brush([[78, 67], [81, 85]], 4.6, { head: 0, tail: 0.05, tip: 0.5 }) +
        brush([[85, 52], [91, 50], [93, 56]], 1.6, { head: 0 })
    );
}

function eel() {
    const body = [[12, 50], [24, 41], [38, 47], [52, 60], [68, 59], [82, 47], [94, 48]];
    const top = offset(body, -4.6);
    const bot = offset(body, 4.6);
    const n = top.length;
    return art(
        brush(offset(body, -2), [9, 9, 9, 8, 6, 4, 2], { op: 0.3, head: 0.1, tail: 0.05, }) +
        brush(offset(body, 2), [9, 9, 9, 8, 6, 4, 2], { op: 0.18, head: 0.1, tail: 0.05 }),
        brush(body, [8, 8, 7.5, 7, 6, 4.5, 2], { head: 0.04, tail: 0.25, tip: 0.6 }) +
        brush(top.slice(Math.floor(n * 0.2)), 1.4, { head: 0.3, tail: 0.1 }) +
        brush(bot.slice(Math.floor(n * 0.45)), 1.4, { head: 0.3, tail: 0.1 }) +
        brush([[22, 47], [26, 53], [22, 55]], 2, { head: 0 }) +
        brush([[18, 74], [36, 72]], 1.4) + brush([[44, 80], [70, 78]], 1.4) + brush([[60, 30], [80, 28]], 1.2) +
        ring(30, 26, 2.4, 2.4, 1) + ring(36, 20, 1.6, 1.6, 0.9) + ring(28, 16, 1.2, 1.2, 0.8),
        dot(12.5, 47, 1.3, PAPER) + brush([[8, 51], [13, 52]], 0.9, { head: 0, color: PAPER })
    );
}

function cobra() {
    return art(
        wash('M50,52 C37,48 31,36 35,24 C39,16 45,14 50,14 C55,14 61,16 65,24 C69,36 63,48 50,52 Z', 0.3) +
        blot(52, 80, 30, 9, 0.2),
        ring(52, 81, 31, 9, 6, { start: 0.2, span: 0.97 }) +
        ring(52, 74, 20, 6, 5, { start: 2.6, span: 0.9 }) +
        brush([[66, 72], [62, 60], [55, 50]], [7, 7, 6], { head: 0, tail: 0 }) +
        brush([[50, 52], [38, 47], [32, 35], [36, 23], [44, 16]], 3, { tail: 0.2 }) +
        brush([[50, 52], [62, 47], [68, 35], [64, 23], [56, 16]], 3, { tail: 0.2 }) +
        brush([[46, 30], [54, 30]], 1.6) + brush([[45, 36], [55, 36]], 1.6) + brush([[46, 42], [54, 42]], 1.6) +
        `<ellipse cx="50" cy="18" rx="7.5" ry="6.5" fill="${INK}"/>`,
        dot(46.5, 17, 1.3, PAPER) + dot(53.5, 17, 1.3, PAPER) +
        brush([[50, 24], [50, 29]], 1.2, { head: 0, tail: 0, color: SHU }) +
        brush([[50, 29], [47.5, 32]], 1, { head: 0, color: SHU }) + brush([[50, 29], [52.5, 32]], 1, { head: 0, color: SHU })
    );
}

export const ANIMAL_ART = {
    tiger: tiger(),
    dragon: dragon(),
    frog: frog(),
    rabbit: rabbit(),
    crab: crab(),
    elephant: elephant(),
    goose: goose(),
    rooster: rooster(),
    monkey: monkey(),
    mantis: mantis(),
    horse: horse(),
    ox: ox(),
    crane: crane(),
    boar: boar(),
    eel: eel(),
    cobra: cobra(),
};
