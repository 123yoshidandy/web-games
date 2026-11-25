/**
 * ハイブのルールの中身（盤面の状態と、通る手・手を当てる・勝ち負け）
 * DOM に依存しない。CPU の先読みでも使うので、状態は素のオブジェクトにして、複製（cloneState）して手を当てる
 *
 * 盤は六角形のマス。座標は軸座標 (q, r) を "q,r" の文字列で持つ。マスには駒が積み重なる（カブトムシの上乗り）
 *
 * ルール（基本ゲーム＋選べる拡張の駒）
 * - 手番には、駒を1つ置くか、盤の駒を1つ動かす。どちらもできなければパス
 * - 置く：最初の1手は中央、2手目（相手の最初）はそれに接して置く。3手目からは、自分の駒に接し、相手の駒に接しない空きマス
 *   （積み重なったマスは、いちばん上の駒の色）。4手目までに女王蜂を置く。トーナメントルールでは、最初の手に女王蜂を置けない
 * - 動かす：自分の女王蜂を置くまでは動かせない
 *   ひとつながり：動かす駒を取り除いても、巣が2つに分かれないこと（動かす途中も、巣に接したまま進む）
 *   すき間：両側がふさがっている（高さも含めて）すき間は、滑って通れない
 * - 駒の動き：女王蜂は1マス、カブトムシは1マス（上に乗れる。乗られた駒は動けない）、バッタは一直線に1つ以上の駒を跳び越す、
 *   クモはちょうど3マス（戻らない）、アリは何マスでも
 *   テントウムシ：2マス巣の上を進み、3マス目で降りる。蚊：接している駒の動きをまねる（巣の上ではカブトムシ）。
 *   ダンゴムシ：女王蜂と同じに動くか、接している駒（積み重なっていない）を自分の上を通して、自分に接する空きマスへ動かす。
 *     直前の手番に動いた駒は動かせない。ダンゴムシに動かされた駒は、次の手番に動けない（ダンゴムシの力も使えない）
 * - 女王蜂の6方向がすべてふさがったら負け。両方同時なら引き分け。同じ局面が3回目になったら引き分け
 */

export const KINDS = ['Q', 'B', 'G', 'S', 'A', 'L', 'M', 'P'];
export const BASE_COUNTS = { Q: 1, B: 2, G: 3, S: 2, A: 3 };
export const EXPANSIONS = ['L', 'M', 'P'];
export const KIND_NAMES = { Q: '女王蜂', B: 'カブトムシ', G: 'バッタ', S: 'クモ', A: 'アリ', L: 'テントウムシ', M: '蚊', P: 'ダンゴムシ' };
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const ORIGIN = '0,0';
export const REPETITION_LIMIT = 3;

export const keyOf = (q, r) => `${q},${r}`;
export const parseKey = (key) => key.split(',').map(Number);
export function neighbors(key) {
    const [q, r] = parseKey(key);
    return DIRS.map(([dq, dr]) => keyOf(q + dq, r + dr));
}
const step = (key, d) => {
    const [q, r] = parseKey(key);
    return keyOf(q + DIRS[d][0], r + DIRS[d][1]);
};

// ---- 状態 ----

// expansions: 入れる拡張の駒（'L'・'M'・'P' の配列）
export function createState({ expansions = [], tournament = true } = {}) {
    const counts = { ...BASE_COUNTS };
    expansions.forEach(k => { counts[k] = 1; });
    return {
        board: {},                  // "q,r" → [{ id, owner, kind }]（下から上へ）
        hands: [{ ...counts }, { ...counts }],
        current: 0,                 // 手番の人（0 が先手＝白）
        turns: [0, 0],              // それぞれが終えた手番の数
        nextId: 0,
        lastMoved: null,            // 直前の手番に動いた駒（置いた駒は含めない）
        frozen: null,               // 直前の手番にダンゴムシに動かされた駒（この手番は動けない）
        tournament,
        result: null,               // null / { winner: 0|1|null }（null は引き分け）
        history: {}                 // 局面 → 出た回数
    };
}

export function cloneState(s) {
    const board = {};
    for (const k in s.board) board[k] = s.board[k].slice();
    return {
        ...s, board, hands: [{ ...s.hands[0] }, { ...s.hands[1] }], turns: [...s.turns],
        history: s.history // 先読みでは書き換えない（applyAction が新しく作る）
    };
}

export const heightAt = (board, key) => board[key]?.length ?? 0;
export const topAt = (board, key) => board[key]?.[board[key].length - 1] ?? null;
export const pieceCount = (board) => Object.values(board).reduce((s, st) => s + st.length, 0);

export function queenCell(board, owner) {
    for (const k in board) if (board[k].some(p => p.kind === 'Q' && p.owner === owner)) return k;
    return null;
}

// 女王蜂のまわりのふさがったマスの数（置いていなければ null）
export function queenSurround(board, owner) {
    const q = queenCell(board, owner);
    return q === null ? null : neighbors(q).filter(n => board[n]).length;
}

// ---- ひとつながり：取り除くと巣が分かれるマス（関節点） ----

export function articulationPoints(board) {
    const keys = Object.keys(board);
    const result = new Set();
    if (keys.length < 3) return result;
    const disc = new Map();
    const low = new Map();
    let time = 0;
    // 再帰の深さを避けるため、手で積む
    const root = keys[0];
    const stack = [[root, null, neighbors(root).filter(n => board[n]), 0]];
    disc.set(root, time);
    low.set(root, time++);
    let rootChildren = 0;
    while (stack.length) {
        const frame = stack[stack.length - 1];
        const [node, parent, adj] = frame;
        if (frame[3] < adj.length) {
            const next = adj[frame[3]++];
            if (!disc.has(next)) {
                disc.set(next, time);
                low.set(next, time++);
                if (node === root) rootChildren++;
                stack.push([next, node, neighbors(next).filter(n => board[n]), 0]);
            } else if (next !== parent) {
                low.set(node, Math.min(low.get(node), disc.get(next)));
            }
        } else {
            stack.pop();
            if (parent !== null) {
                low.set(parent, Math.min(low.get(parent), low.get(node)));
                if (parent !== root && low.get(node) >= disc.get(parent)) result.add(parent);
            }
        }
    }
    if (rootChildren > 1) result.add(root);
    return result;
}

// ---- すき間：from から to（隣）へ。hFrom は動く駒の下の高さ、hTo は行き先の高さ ----

function canPass(board, from, d, hFrom, hTo) {
    const to = step(from, d);
    const c1 = heightAt(board, step(from, (d + 5) % 6));
    const c2 = heightAt(board, step(from, (d + 1) % 6));
    if (Math.min(c1, c2) > Math.max(hFrom, hTo)) return false;
    // 地面を滑るときは、巣に接したまま進む（両側とも空きなら離れてしまう）
    if (Math.max(hFrom, hTo) === 0 && c1 === 0 && c2 === 0) return false;
    return to !== null;
}

// 地面を1マス滑る先（board からは動く駒を取り除いてある）
function slides(board, from) {
    const out = [];
    for (let d = 0; d < 6; d++) {
        const to = step(from, d);
        if (!board[to] && canPass(board, from, d, 0, 0)) out.push(to);
    }
    return out;
}

// ---- 駒ごとの動き（board からは動く駒を取り除いてある。from に駒が残っていれば、その上にいた） ----

function queenMoves(board, from) {
    return slides(board, from);
}

function beetleMoves(board, from) {
    const out = [];
    const hFrom = heightAt(board, from);
    for (let d = 0; d < 6; d++) {
        const to = step(from, d);
        if (canPass(board, from, d, hFrom, heightAt(board, to))) out.push(to);
    }
    return out;
}

function grasshopperMoves(board, from) {
    const out = [];
    for (let d = 0; d < 6; d++) {
        let cur = step(from, d);
        if (!board[cur]) continue;
        while (board[cur]) cur = step(cur, d);
        out.push(cur);
    }
    return out;
}

function spiderMoves(board, from) {
    const out = new Set();
    const walk = (cell, depth, visited) => {
        if (depth === 3) {
            out.add(cell);
            return;
        }
        for (const next of slides(board, cell)) {
            if (visited.has(next)) continue;
            visited.add(next);
            walk(next, depth + 1, visited);
            visited.delete(next);
        }
    };
    walk(from, 0, new Set([from]));
    out.delete(from);
    return [...out];
}

function antMoves(board, from) {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
        const cell = queue.shift();
        for (const next of slides(board, cell)) {
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }
    seen.delete(from);
    return [...seen];
}

function ladybugMoves(board, from) {
    const out = new Set();
    for (let d1 = 0; d1 < 6; d1++) {
        const a = step(from, d1);
        if (!board[a] || !canPass(board, from, d1, heightAt(board, from), heightAt(board, a))) continue;
        for (let d2 = 0; d2 < 6; d2++) {
            const b = step(a, d2);
            if (b === from || !board[b] || !canPass(board, a, d2, heightAt(board, a), heightAt(board, b))) continue;
            for (let d3 = 0; d3 < 6; d3++) {
                const c = step(b, d3);
                if (c === from || board[c] || !canPass(board, b, d3, heightAt(board, b), 0)) continue;
                out.add(c);
            }
        }
    }
    return [...out];
}

const MOVERS = { Q: queenMoves, B: beetleMoves, G: grasshopperMoves, S: spiderMoves, A: antMoves, L: ladybugMoves, P: queenMoves };

// 蚊：巣の上にいればカブトムシ。地面なら、接している駒（いちばん上）の動きをまねる（蚊はまねない）
function mosquitoMoves(board, from) {
    if (heightAt(board, from) > 0) return beetleMoves(board, from);
    const kinds = new Set(neighbors(from).map(n => topAt(board, n)?.kind).filter(k => k && k !== 'M'));
    const out = new Set();
    kinds.forEach(k => MOVERS[k](board, from).forEach(c => out.add(c)));
    return [...out];
}

// ---- 通る手 ----

// 手の形：{ type: 'place', kind, to } / { type: 'move', from, to, via? }（via はダンゴムシの力を使ったときのダンゴムシのマス）/ { type: 'pass' }
export const actionKey = (a) => (a.type === 'place' ? `P:${a.kind}@${a.to}` : a.type === 'move' ? `M:${a.from}>${a.to}${a.via ? `/${a.via}` : ''}` : 'pass');

export function placementCells(state, player) {
    const board = state.board;
    const keys = Object.keys(board);
    if (keys.length === 0) return [ORIGIN];
    if (pieceCount(board) === 1 && state.turns[player] === 0) return neighbors(keys[0]);
    const cells = new Set();
    for (const k of keys) {
        if (topAt(board, k).owner !== player) continue;
        for (const n of neighbors(k)) if (!board[n]) cells.add(n);
    }
    return [...cells].filter(c => neighbors(c).every(n => !board[n] || topAt(board, n).owner === player));
}

export function placeableKinds(state, player) {
    const hand = state.hands[player];
    const turn = state.turns[player];
    const queenInHand = hand.Q > 0;
    // 4手目までに女王蜂：4手目（それまでに3手を終えた）で女王蜂がまだなら、女王蜂しか置けない
    if (queenInHand && turn === 3) return ['Q'];
    return KINDS.filter(k => (hand[k] ?? 0) > 0 && !(k === 'Q' && turn === 0 && state.tournament));
}

// 盤の駒を動かす手（ダンゴムシの力も）
export function moveActions(state, player) {
    const board = state.board;
    if (state.hands[player].Q > 0) return [];
    const cut = articulationPoints(board);
    const out = [];
    for (const from of Object.keys(board)) {
        const stack = board[from];
        const piece = stack[stack.length - 1];
        if (piece.owner !== player || piece.id === state.frozen) continue;
        // 動く駒を取り除いた盤（浅い写し）で調べる（積み重なりの上なら、下の駒は残る）。元の盤は書き換えない
        const movable = stack.length > 1 || !cut.has(from);
        if (movable) {
            const rest = { ...board };
            if (stack.length > 1) rest[from] = stack.slice(0, -1);
            else delete rest[from];
            const dests = piece.kind === 'M' ? mosquitoMoves(rest, from) : MOVERS[piece.kind](rest, from);
            dests.forEach(to => { if (to !== from) out.push({ type: 'move', from, to }); });
        }
        // ダンゴムシの力（ダンゴムシか、ダンゴムシに接した地面の蚊）
        const usesPill = stack.length === 1 && piece.id !== state.lastMoved
            && (piece.kind === 'P' || (piece.kind === 'M' && neighbors(from).some(n => topAt(board, n)?.kind === 'P')));
        if (usesPill) pillbugActions(state, from, cut).forEach(a => out.push(a));
    }
    return out;
}

// ダンゴムシ（via のマス）が、接している駒を自分の上を通して、自分に接する空きマスへ動かす
function pillbugActions(state, via, cut) {
    const board = state.board;
    const out = [];
    const empties = [];
    for (let d = 0; d < 6; d++) {
        const cell = step(via, d);
        if (!board[cell]) empties.push(d);
    }
    for (let d = 0; d < 6; d++) {
        const from = step(via, d);
        const stack = board[from];
        if (!stack || stack.length !== 1) continue;
        const target = stack[0];
        if (target.id === state.lastMoved || target.id === state.frozen || cut.has(from)) continue;
        const rest = { ...board };
        delete rest[from];
        // from からダンゴムシの上へ（高さ0→1）、ダンゴムシの上から空きマスへ（1→0）
        const back = (d + 3) % 6;
        if (canPass(rest, from, back, 0, 1)) {
            for (const e of empties) {
                const to = step(via, e);
                if (to !== from && canPass(rest, via, e, 1, 0)) out.push({ type: 'move', from, to, via });
            }
        }
    }
    return out;
}

export function legalActions(state) {
    if (state.result) return [];
    const player = state.current;
    const actions = [];
    const cells = placementCells(state, player);
    for (const kind of placeableKinds(state, player)) for (const to of cells) actions.push({ type: 'place', kind, to });
    // 4手目で女王蜂を置かなければならないときは、動かせない（女王蜂がまだなので、もともと動かせない）
    moveActions(state, player).forEach(a => actions.push(a));
    // 同じ行き先に、ふつうの動きとダンゴムシの力の両方で行けるときは、両方を残す（動かされた駒は次の手番に動けないので、結果が違う）
    if (actions.length === 0) actions.push({ type: 'pass' });
    return actions;
}

export function positionKey(state) {
    const parts = Object.keys(state.board).sort().map(k => `${k}:${state.board[k].map(p => p.owner + p.kind).join('')}`);
    return `${state.current}|${parts.join(' ')}|${state.frozen ?? ''}`;
}

// 手を当てた新しい状態（action は legalActions のものであること。検証は呼ぶ側で行う）
// { trackHistory: false } にすると、局面の回数を数えない（先読み用）
export function applyAction(state, action, { trackHistory = true } = {}) {
    const s = cloneState(state);
    const player = s.current;
    let moved = null;
    s.frozen = null;
    if (action.type === 'place') {
        const piece = { id: s.nextId++, owner: player, kind: action.kind };
        s.hands[player][action.kind]--;
        s.board[action.to] = [piece];
    } else if (action.type === 'move') {
        const piece = s.board[action.from].pop();
        if (s.board[action.from].length === 0) delete s.board[action.from];
        (s.board[action.to] ??= []).push(piece);
        moved = piece.id;
        if (action.via) s.frozen = piece.id;
    }
    s.lastMoved = moved;
    s.turns[player]++;
    s.current = 1 - player;
    // 勝ち負け：女王蜂の6方向がふさがる
    const lost = [0, 1].map(p => queenSurround(s.board, p) === 6);
    if (lost[0] && lost[1]) s.result = { winner: null, reason: 'both' };
    else if (lost[0]) s.result = { winner: 1, reason: 'queen' };
    else if (lost[1]) s.result = { winner: 0, reason: 'queen' };
    if (trackHistory) {
        const key = positionKey(s);
        s.history = { ...state.history, [key]: (state.history[key] ?? 0) + 1 };
        if (!s.result && s.history[key] >= REPETITION_LIMIT) s.result = { winner: null, reason: 'repetition' };
    }
    return s;
}
