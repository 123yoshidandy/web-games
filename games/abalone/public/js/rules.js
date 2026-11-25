/**
 * アバロンのルールの中身（DOM に依存しない。CPU の先読みでも使う）
 *
 * 盤は1辺5マスの六角形（61マス）。マスは軸座標 (q, r)（|q|・|r|・|q+r| が4以下）で、番号は上の行から左から順に振る
 * 行 row = r + 4（0 が上）。各マスの中身は 0 空き・1 黒・2 白
 * 向き：0 右・1 右上・2 左上・3 左・4 左下・5 右下
 * 手：{ type: 'move', cells: [番号, ...]（1〜3個、昇順）, dir }
 *   列の向きに動かす（押し出し）：前に相手の玉があれば、自分の数より少なく（3対2・3対1・2対1）、その後ろが空きか盤の外なら押せる
 *   列の横に動かす（平行移動）：動く先がすべて空きのときだけ
 * 相手の玉を6個盤の外へ押し出したら勝ち。先手は黒
 */

export const RADIUS = 4;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const WIN_CAPTURES = 6;
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const DIR_NAMES = ['右', '右上', '左上', '左', '左下', '右下'];

export const CELLS = [];
export const INDEX = new Map();
for (let r = -RADIUS; r <= RADIUS; r++) {
    for (let q = Math.max(-RADIUS, -RADIUS - r); q <= Math.min(RADIUS, RADIUS - r); q++) {
        INDEX.set(`${q},${r}`, CELLS.length);
        CELLS.push({ q, r, row: r + RADIUS });
    }
}
export const SIZE = CELLS.length; // 61
// マス c から向き d に1つ進んだマス（盤の外なら -1）
export const STEP = CELLS.map(({ q, r }) => DIRS.map(([dq, dr]) => INDEX.get(`${q + dq},${r + dr}`) ?? -1));
export const ROW_LENGTHS = [5, 6, 7, 8, 9, 8, 7, 6, 5];
export const cellAt = (row, col) => {
    let i = 0;
    for (let k = 0; k < row; k++) i += ROW_LENGTHS[k];
    return i + col;
};
// 中央からの距離（0〜4）
export const RING = CELLS.map(({ q, r }) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)));

// 並べ方（上の行から。W 白・B 黒・. 空き）
export const LAYOUTS = {
    standard: [
        'WWWWW', 'WWWWWW', '..WWW..', '........', '.........', '........', '..BBB..', 'BBBBBB', 'BBBBB'
    ],
    belgian: [
        'WW.BB', 'WWWBBB', '.WW.BB.', '........', '.........', '........', '.BB.WW.', 'BBBWWW', 'BB.WW'
    ],
    german: [
        '.....', 'WW..BB', 'WWW.BBB', '.WW..BB.', '.........', '.BB..WW.', 'BBB.WWW', 'BB..WW', '.....'
    ]
};
export const LAYOUT_NAMES = { standard: '標準', belgian: 'ベルギーデイジー', german: 'ジャーマンデイジー' };

export function createState({ layout = 'standard' } = {}) {
    const rows = LAYOUTS[layout] ?? LAYOUTS.standard;
    const board = [];
    rows.forEach(row => [...row].forEach(ch => board.push(ch === 'B' ? BLACK : ch === 'W' ? WHITE : EMPTY)));
    return {
        board,
        current: BLACK,
        captured: { [BLACK]: 0, [WHITE]: 0 }, // その色が押し出した相手の玉の数
        result: null                             // { winner: 色 }
    };
}

export const other = (color) => (color === BLACK ? WHITE : BLACK);

export function cloneState(s) {
    return { board: s.board.slice(), current: s.current, captured: { ...s.captured }, result: s.result ? { ...s.result } : null };
}

// 玉の並びが一直線に続いているなら、その軸の向き（0〜2）を返す。1個なら -1、並んでいなければ null
export function lineAxis(cells) {
    if (cells.length === 1) return -1;
    if (cells.length > 3) return null;
    const sorted = cells.slice().sort((a, b) => a - b);
    for (let d = 0; d < 6; d++) {
        let ok = true;
        for (let i = 1; i < sorted.length && ok; i++) ok = STEP[sorted[i - 1]][d] === sorted[i];
        if (ok) return d % 3;
    }
    return null;
}

/**
 * 手を調べる。通るなら { moves: [[from, to]...]（自分の玉）, pushed: [[from, to|-1]...]（相手の玉。-1 は盤の外） }、通らなければ { error }
 */
export function examineMove(s, cells, dir) {
    const me = s.current;
    if (!Array.isArray(cells) || cells.length < 1 || cells.length > 3 || !(dir >= 0 && dir < 6) || !Number.isInteger(dir)) return { error: 'range' };
    if (new Set(cells).size !== cells.length || cells.some(c => !Number.isInteger(c) || c < 0 || c >= SIZE || s.board[c] !== me)) return { error: 'own' };
    const axis = lineAxis(cells);
    if (axis === null) return { error: 'line' };
    if (axis === -1 || axis === dir % 3) {
        // 列の向き：先頭の玉の先を見る
        const head = cells.find(c => !cells.includes(STEP[c][dir]));
        let next = STEP[head][dir];
        if (next === -1) return { error: 'edge' };
        const moves = cells.map(c => [c, STEP[c][dir]]);
        if (s.board[next] === EMPTY) return { moves, pushed: [] };
        if (s.board[next] === me) return { error: 'blocked' };
        // 相手の玉を押す
        const pushed = [];
        while (next !== -1 && s.board[next] === other(me)) {
            pushed.push(next);
            next = STEP[next][dir];
        }
        if (pushed.length >= cells.length) return { error: 'outnumbered' };
        if (next !== -1 && s.board[next] !== EMPTY) return { error: 'sandwich' };
        return { moves, pushed: pushed.map(c => [c, STEP[c][dir]]) };
    }
    // 横に動かす：動く先がすべて空き
    const moves = [];
    for (const c of cells) {
        const to = STEP[c][dir];
        if (to === -1) return { error: 'edge' };
        if (s.board[to] !== EMPTY) return { error: 'side' };
        moves.push([c, to]);
    }
    return { moves, pushed: [] };
}

// 手番の人の通る手。同じ結果の手は1つにまとめない（1個の玉と、それを含む列の手は別）
export function legalMoves(s) {
    if (s.result) return [];
    const me = s.current;
    const list = [];
    for (let c = 0; c < SIZE; c++) {
        if (s.board[c] !== me) continue;
        const groups = [[c]];
        // 右・右下・左下へ伸ばした2個と3個の列（同じ列を二度数えないように、3方向だけ）
        for (const d of [0, 5, 4]) {
            const b = STEP[c][d];
            if (b === -1 || s.board[b] !== me) continue;
            groups.push([c, b]);
            const t = STEP[b][d];
            if (t !== -1 && s.board[t] === me) groups.push([c, b, t]);
        }
        for (const g of groups) {
            const cells = g.slice().sort((x, y) => x - y);
            for (let dir = 0; dir < 6; dir++) {
                const r = examineMove(s, cells, dir);
                if (!r.error) list.push({ type: 'move', cells, dir, push: r.pushed.length > 0 });
            }
        }
    }
    return list;
}

export const moveKey = (m) => `${[...m.cells].sort((a, b) => a - b).join(',')}>${m.dir}`;

// 手を当てた新しい状態を返す（元の状態は変えない）。examineMove で通ることを確かめてから呼ぶ
export function applyMove(s, move, examined = examineMove(s, move.cells, move.dir)) {
    const next = cloneState(s);
    const me = s.current;
    const opp = other(me);
    examined.moves.forEach(([from]) => { next.board[from] = EMPTY; });
    examined.pushed.forEach(([from]) => { next.board[from] = EMPTY; });
    examined.moves.forEach(([, to]) => { next.board[to] = me; });
    examined.pushed.forEach(([, to]) => {
        if (to === -1) next.captured[me]++;
        else next.board[to] = opp;
    });
    if (next.captured[me] >= WIN_CAPTURES) next.result = { winner: me };
    next.current = opp;
    return next;
}

export const positionKey = (s) => `${s.current}${s.board.join('')}`;
export const countOf = (s, color) => s.board.reduce((n, v) => n + (v === color ? 1 : 0), 0);
