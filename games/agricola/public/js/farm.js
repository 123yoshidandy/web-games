/**
 * 農場（3段×5列の15マス）の計算。ゲームと CPU（ビューだけを見る）と画面で共通に使う、状態を持たない関数
 *
 * 農場の形（JSON にできる）
 *   { house: 'wood'|'clay'|'stone', rooms: [マス], fields: [{ cell, crop: null|'grain'|'veg', n }], stables: [マス], pastures: [[マス]] }
 * マスの番号は 段×5＋列（0〜14）。最初の部屋は左の列の下2マス（5 と 10）
 * 柵は持たず、牧場の境界から数える（ちがう牧場どうし・牧場と牧場でないものの境が柵）
 */

export const ROWS = 3;
export const COLS = 5;
export const CELLS = ROWS * COLS;
export const START_ROOMS = [5, 10];
export const MAX_FENCES = 15;
export const MAX_STABLES = 4;
export const ANIMALS = ['sheep', 'boar', 'cattle'];

export const rowOf = (c) => Math.floor(c / COLS);
export const colOf = (c) => c % COLS;

export function neighbors(c) {
    const r = rowOf(c);
    const k = colOf(c);
    const result = [];
    if (r > 0) result.push(c - COLS);
    if (r < ROWS - 1) result.push(c + COLS);
    if (k > 0) result.push(c - 1);
    if (k < COLS - 1) result.push(c + 1);
    return result;
}

export const createFarm = () => ({ house: 'wood', rooms: [...START_ROOMS], fields: [], stables: [], pastures: [] });

export const inFarm = (c) => Number.isInteger(c) && c >= 0 && c < CELLS;

export const fieldAt = (farm, c) => farm.fields.find(f => f.cell === c) ?? null;
export const pastureIndex = (farm, c) => farm.pastures.findIndex(p => p.includes(c));

// マスの使われ方
export function cellKind(farm, c) {
    if (farm.rooms.includes(c)) return 'room';
    if (fieldAt(farm, c)) return 'field';
    if (pastureIndex(farm, c) >= 0) return 'pasture';
    if (farm.stables.includes(c)) return 'stable';
    return 'empty';
}

// 柵：マス c の4辺（上・右・下・左）のうち柵があるもの
export function cellFences(farm, c) {
    const own = pastureIndex(farm, c);
    const r = rowOf(c);
    const k = colOf(c);
    const side = (nb) => {
        const other = nb === null ? -1 : pastureIndex(farm, nb);
        return own !== other && (own >= 0 || other >= 0);
    };
    return {
        top: side(r > 0 ? c - COLS : null),
        right: side(k < COLS - 1 ? c + 1 : null),
        bottom: side(r < ROWS - 1 ? c + COLS : null),
        left: side(k > 0 ? c - 1 : null)
    };
}

// 柵の辺の一覧（'h段_列' は段の上の横の辺、'v段_列' は列の左の縦の辺）
export function fenceEdges(pastures) {
    const index = new Map();
    pastures.forEach((p, i) => p.forEach(c => index.set(c, i)));
    const of = (c) => (c === null ? -1 : index.get(c) ?? -1);
    const edges = new Set();
    const check = (a, b, key) => {
        const x = of(a);
        const y = of(b);
        if (x !== y && (x >= 0 || y >= 0)) edges.add(key);
    };
    for (let r = 0; r <= ROWS; r++) {
        for (let k = 0; k < COLS; k++) check(r > 0 ? (r - 1) * COLS + k : null, r < ROWS ? r * COLS + k : null, `h${r}_${k}`);
    }
    for (let r = 0; r < ROWS; r++) {
        for (let k = 0; k <= COLS; k++) check(k > 0 ? r * COLS + k - 1 : null, k < COLS ? r * COLS + k : null, `v${r}_${k}`);
    }
    return edges;
}

export const fenceCount = (farm) => fenceEdges(farm.pastures).size;

function connected(cells) {
    if (!cells.length) return false;
    const set = new Set(cells);
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
        const c = stack.pop();
        neighbors(c).forEach(n => {
            if (set.has(n) && !seen.has(n)) {
                seen.add(n);
                stack.push(n);
            }
        });
    }
    return seen.size === set.size;
}

function components(cells) {
    const rest = new Set(cells);
    const result = [];
    while (rest.size) {
        const start = rest.values().next().value;
        const part = [start];
        rest.delete(start);
        for (let i = 0; i < part.length; i++) {
            neighbors(part[i]).forEach(n => {
                if (rest.has(n)) {
                    rest.delete(n);
                    part.push(n);
                }
            });
        }
        result.push(part.sort((a, b) => a - b));
    }
    return result;
}

const sorted = (cells) => [...cells].sort((a, b) => a - b);

// 牧場を順に足す。新しい牧場か、今の牧場を分ける（中のマスだけを選ぶ）か。
// 結果 { farm, newFences } か、だめなら { error }
export function addPastures(farm, list) {
    let pastures = farm.pastures.map(p => [...p]);
    const before = fenceEdges(pastures).size;
    for (const cells of list) {
        if (!Array.isArray(cells) || !cells.length) return { error: '牧場のマスを選んでください' };
        if (!cells.every(c => Number.isInteger(c) && c >= 0 && c < CELLS) || new Set(cells).size !== cells.length) return { error: 'マスが正しくありません' };
        if (cells.some(c => farm.rooms.includes(c) || fieldAt(farm, c))) return { error: '部屋と畑は囲えません' };
        if (!connected(cells)) return { error: '牧場はつながったマスで作ります' };
        const owners = new Set(cells.map(c => pastures.findIndex(p => p.includes(c))));
        if (owners.size === 1 && !owners.has(-1)) {
            // 分ける
            const i = [...owners][0];
            const rest = pastures[i].filter(c => !cells.includes(c));
            if (!rest.length) return { error: '同じ牧場です' };
            pastures.splice(i, 1, sorted(cells), ...components(rest));
        } else if (owners.size === 1 && owners.has(-1)) {
            // 2つ目からは、今の牧場のとなりに作る
            if (pastures.length && !cells.some(c => neighbors(c).some(n => pastures.some(p => p.includes(n))))) {
                return { error: '新しい牧場は、今の牧場のとなりに作ります' };
            }
            pastures.push(sorted(cells));
        } else {
            return { error: '今の牧場と、囲っていないマスをまぜられません' };
        }
    }
    const after = fenceEdges(pastures).size;
    if (after > MAX_FENCES) return { error: `柵は${MAX_FENCES}本までです` };
    return { farm: { ...farm, pastures }, newFences: after - before };
}

// 耕せるマス
export function canPlow(farm, c) {
    if (!inFarm(c) || cellKind(farm, c) !== 'empty') return false;
    return !farm.fields.length || neighbors(c).some(n => fieldAt(farm, n));
}

export const plowCells = (farm) => Array.from({ length: CELLS }, (_, c) => c).filter(c => canPlow(farm, c));

// 部屋を建てられるマス（built：この行動で先に建てた部屋）
export function canRoom(farm, c, built = []) {
    if (!inFarm(c) || cellKind(farm, c) !== 'empty' || built.includes(c)) return false;
    return neighbors(c).some(n => farm.rooms.includes(n) || built.includes(n));
}

export const canStable = (farm, c) => inFarm(c) && !farm.stables.includes(c) && !farm.rooms.includes(c) && !fieldAt(farm, c);

export const ROOM_COST = { wood: { wood: 5, reed: 2 }, clay: { clay: 5, reed: 2 }, stone: { stone: 5, reed: 2 } };
export const NEXT_HOUSE = { wood: 'clay', clay: 'stone', stone: null };
export function renovationCost(farm) {
    const next = NEXT_HOUSE[farm.house];
    return next ? { [next]: farm.rooms.length, reed: 1 } : null;
}

// ---- 動物 ----

export function pastureCapacity(farm, cells) {
    const stables = cells.filter(c => farm.stables.includes(c)).length;
    return 2 * cells.length * 2 ** stables;
}

export const freeStables = (farm) => farm.stables.filter(c => pastureIndex(farm, c) < 0);

// 動物の置き方。牧場ごとに種類を決め、あふれた分を柵のない厩（1頭ずつ）と家の中（1頭）に置く
// 結果 { overflow：置けない頭数, pastures: [{ type, n }], stables: [type|null], pet: type|null }
export function arrangeAnimals(farm, animals) {
    const caps = farm.pastures.map(p => pastureCapacity(farm, p));
    const flex = freeStables(farm).length + 1;
    let best = null;
    const assign = Array(caps.length).fill(null);
    const search = (i, left) => {
        if (i === caps.length) {
            const over = ANIMALS.reduce((s, t) => s + left[t], 0);
            const overflow = Math.max(0, over - flex);
            if (!best || overflow < best.overflow) best = { overflow, assign: [...assign], left: { ...left } };
            return;
        }
        if (best?.overflow === 0) return;
        // 置く動物が多い種類から試す
        const order = [...ANIMALS].sort((a, b) => left[b] - left[a]);
        for (const t of order) {
            if (!left[t]) continue;
            assign[i] = t;
            search(i + 1, { ...left, [t]: Math.max(0, left[t] - caps[i]) });
        }
        assign[i] = null;
        search(i + 1, left);
    };
    search(0, { sheep: animals.sheep ?? 0, boar: animals.boar ?? 0, cattle: animals.cattle ?? 0 });
    const placed = { sheep: animals.sheep ?? 0, boar: animals.boar ?? 0, cattle: animals.cattle ?? 0 };
    const pastures = best.assign.map((t, i) => {
        if (!t) return { type: null, n: 0 };
        const n = Math.min(caps[i], placed[t]);
        placed[t] -= n;
        return { type: n ? t : null, n };
    });
    const rest = ANIMALS.flatMap(t => Array(best.left[t]).fill(t));
    const stables = freeStables(farm).map(() => rest.shift() ?? null);
    const pet = rest.shift() ?? null;
    return { overflow: best.overflow, pastures, stables, pet };
}

export const fits = (farm, animals) => arrangeAnimals(farm, animals).overflow === 0;

// 使っているマス（得点で、空きマスに数えないもの）
export function usedCells(farm) {
    let n = 0;
    for (let c = 0; c < CELLS; c++) if (cellKind(farm, c) !== 'empty') n += 1;
    return n;
}
