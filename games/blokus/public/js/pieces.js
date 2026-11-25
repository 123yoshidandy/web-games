/**
 * ピース（1〜5マスのポリオミノ 21個）と盤の決まり
 * 形は行の文字列で書く（# がマス）。向きは 0〜7：回転（90度ずつ右回り）が t % 4、t >= 4 なら先に左右を裏返す
 */

export const SIZE = 20;
export const COLORS = ['blue', 'yellow', 'red', 'green'];
export const COLOR_NAMES = { blue: '青', yellow: '黄', red: '赤', green: '緑' };
// 色ごとの最初の角（青から右回り）
export const CORNERS = [[0, 0], [SIZE - 1, 0], [SIZE - 1, SIZE - 1], [0, SIZE - 1]];

const SHAPES = {
    I1: ['#'],
    I2: ['##'],
    I3: ['###'],
    V3: ['#.', '##'],
    I4: ['####'],
    L4: ['###', '#..'],
    T4: ['###', '.#.'],
    O4: ['##', '##'],
    Z4: ['##.', '.##'],
    F5: ['.##', '##.', '.#.'],
    I5: ['#####'],
    L5: ['####', '#...'],
    N5: ['##..', '.###'],
    P5: ['##', '##', '#.'],
    T5: ['###', '.#.', '.#.'],
    U5: ['#.#', '###'],
    V5: ['#..', '#..', '###'],
    W5: ['#..', '##.', '.##'],
    X5: ['.#.', '###', '.#.'],
    Y5: ['####', '.#..'],
    Z5: ['##.', '.#.', '.##']
};

export const PIECE_ORDER = Object.keys(SHAPES);

// マスの一覧を、左上が (0,0) になるようにそろえ、並びも決める
function normalize(cells) {
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export function transform(cells, t) {
    let out = cells.map(([x, y]) => (t >= 4 ? [-x, y] : [x, y]));
    for (let r = 0; r < t % 4; r++) out = out.map(([x, y]) => [-y, x]);
    return normalize(out);
}

const base = (rows) => normalize(rows.flatMap((row, y) => [...row].map((ch, x) => (ch === '#' ? [x, y] : null)).filter(Boolean)));

export const PIECES = Object.fromEntries(PIECE_ORDER.map(key => {
    const cells = base(SHAPES[key]);
    const orientations = Array.from({ length: 8 }, (_, t) => transform(cells, t));
    // 形の同じ向きは1つにまとめる（探すときに使う。操作の記録には 0〜7 のどれを使ってもよい）
    const seen = new Set();
    const distinct = [];
    orientations.forEach((o, t) => {
        const id = JSON.stringify(o);
        if (!seen.has(id)) {
            seen.add(id);
            distinct.push(t);
        }
    });
    return [key, { key, size: cells.length, cells, orientations, distinct }];
}));

export const TOTAL_SQUARES = PIECE_ORDER.reduce((n, k) => n + PIECES[k].size, 0);
export const ALL_BONUS = 15;      // 上級の得点法：全部置けた
export const MONO_BONUS = 5;      // 上級の得点法：最後が1マス
