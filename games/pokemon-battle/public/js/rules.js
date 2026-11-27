/**
 * 盤の判定と戦術ルールの評価（状態を変えない）
 * ゲーム（game.js）とビュー（game-view.js）の両方に同じ形の { map, sides } があるので、どちらにも使える
 * マスは { x, y }。距離は縦横の歩数（マンハッタン距離）
 */

import { W, H, MOVES, LOW_HP } from './data.js';
import { expectedDamage } from './damage.js';

export const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
export const key = (c) => c.y * W + c.x;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const alive = (u) => !u.fainted;
export const unitsOf = (s, seat) => s.sides?.[seat]?.units ?? [];
export const enemiesOf = (s, seat) => unitsOf(s, 1 - seat).map((u, i) => ({ u, i })).filter(e => alive(e.u));

function blockSet(s) {
    return new Set(s.map.blocks.map(([x, y]) => y * W + x));
}

// 動けるマス（自分のマスを含む）。味方は通り抜けられるが、止まれない。敵と岩は通れない
// 戻り値：Map(key → { x, y, steps })
export function reachable(s, seat, i) {
    const u = unitsOf(s, seat)[i];
    const blocks = blockSet(s);
    const foes = new Set(enemiesOf(s, seat).map(e => key(e.u)));
    const friends = new Set(unitsOf(s, seat).filter((f, j) => j !== i && alive(f)).map(key));
    const seen = new Map([[key(u), { x: u.x, y: u.y, steps: 0 }]]);
    const queue = [{ x: u.x, y: u.y, steps: 0 }];
    while (queue.length) {
        const c = queue.shift();
        if (c.steps >= u.mov) continue;
        for (const [dx, dy] of DIRS) {
            const x = c.x + dx;
            const y = c.y + dy;
            const k = y * W + x;
            if (!inside(x, y) || seen.has(k) || blocks.has(k) || foes.has(k)) continue;
            const next = { x, y, steps: c.steps + 1 };
            seen.set(k, next);
            queue.push(next);
        }
    }
    for (const k of friends) seen.delete(k);
    return seen;
}

// 岩だけをよけた、あるマスから各マスへの歩数（ユニットは無視）。遠くの敵へ近づくときに使う
export function distanceField(s, from) {
    const blocks = blockSet(s);
    const d = new Array(W * H).fill(Infinity);
    d[key(from)] = 0;
    const queue = [from];
    while (queue.length) {
        const c = queue.shift();
        for (const [dx, dy] of DIRS) {
            const x = c.x + dx;
            const y = c.y + dy;
            const k = y * W + x;
            if (!inside(x, y) || blocks.has(k) || d[k] !== Infinity) continue;
            d[k] = d[key(c)] + 1;
            queue.push({ x, y });
        }
    }
    return d;
}

// 攻撃の候補：動けるマス × 技 × 届く敵。exp は期待ダメージ
export function attackOptions(s, seat, i, cells = reachable(s, seat, i)) {
    const u = unitsOf(s, seat)[i];
    const foes = enemiesOf(s, seat);
    const options = [];
    for (const c of cells.values()) {
        u.moves.forEach((moveId, m) => {
            for (const e of foes) {
                if (dist(c, e.u) <= MOVES[moveId].range) {
                    options.push({ to: { x: c.x, y: c.y }, steps: c.steps, move: m, target: e.i, exp: expectedDamage(u, e.u, moveId) });
                }
            }
        });
    }
    return options;
}

// 今いるマスから技 m で届く敵
export function targetsFrom(s, seat, i, at, m) {
    const u = unitsOf(s, seat)[i];
    return enemiesOf(s, seat).filter(e => dist(at, e.u) <= MOVES[u.moves[m]].range).map(e => e.i);
}

// 条件を満たすか
export function conditionMet(s, seat, i, cond, options) {
    const u = unitsOf(s, seat)[i];
    if (cond === 'inRange') return options.length > 0;
    if (cond === 'lowHp') return u.hp <= u.maxHp * LOW_HP;
    if (cond === 'adjacent') return enemiesOf(s, seat).some(e => dist(e.u, u) === 1);
    return cond === 'always';
}

// 候補を比べる：先の値が大きいほうを選ぶ。同じなら歩数が少ないほう、マスの番号が小さいほう（決定的にする）
function best(list, ...scores) {
    let top = null;
    let topVals = null;
    for (const item of list) {
        const vals = [...scores.map(f => f(item)), -(item.steps ?? 0), -key(item.to ?? item)];
        if (!topVals || greater(vals, topVals)) {
            top = item;
            topVals = vals;
        }
    }
    return top;
}

function greater(a, b) {
    for (let j = 0; j < a.length; j++) {
        if (a[j] !== b[j]) return a[j] > b[j];
    }
    return false;
}

const minFoeDist = (s, seat, c) => Math.min(...enemiesOf(s, seat).map(e => dist(c, e.u)));
const stay = (u) => ({ to: { x: u.x, y: u.y }, move: null, target: null });

// 敵 t へ近づく：岩をよけた歩数がいちばん小さくなるマスへ動き、攻撃はしない
function approach(s, seat, i, t, cells) {
    const field = distanceField(s, t);
    const c = best([...cells.values()].map(c => ({ ...c, to: c })), c => -field[key(c)]);
    return { to: { x: c.x, y: c.y }, move: null, target: null };
}

const asCommand = (o) => ({ to: { ...o.to }, move: o.move, target: o.target });

// 行動 act を、操作 { to, move, target } にする（move・target が null なら待機）
export function planAction(s, seat, i, act, cells = reachable(s, seat, i), options = attackOptions(s, seat, i, cells)) {
    const u = unitsOf(s, seat)[i];
    const foes = enemiesOf(s, seat);
    if (act === 'wait' || foes.length === 0) return stay(u);
    if (act === 'kite') {
        if (options.length) return asCommand(best(options, o => minFoeDist(s, seat, o.to), o => o.exp));
        const c = best([...cells.values()].map(c => ({ ...c, to: c })), c => minFoeDist(s, seat, c));
        return { to: { x: c.x, y: c.y }, move: null, target: null };
    }
    if (act === 'weakest') {
        if (options.length) {
            const targets = [...new Set(options.map(o => o.target))];
            const t = targets.reduce((a, b) => (unitsOf(s, 1 - seat)[b].hp < unitsOf(s, 1 - seat)[a].hp ? b : a));
            return asCommand(best(options.filter(o => o.target === t), o => o.exp));
        }
        const t = foes.reduce((a, b) => (b.u.hp < a.u.hp ? b : a));
        return approach(s, seat, i, t.u, cells);
    }
    // nearest：今いる場所から最も近い敵（同じなら HP の少ない敵）
    const t = foes.reduce((a, b) => {
        const da = dist(u, a.u);
        const db = dist(u, b.u);
        return db < da || (db === da && b.u.hp < a.u.hp) ? b : a;
    });
    const onT = options.filter(o => o.target === t.i);
    if (onT.length) return asCommand(best(onT, o => o.exp));
    return approach(s, seat, i, t.u, cells);
}

// 戦術ルールを上から評価し、最初に合ったルールの行動を返す。どれも合わなければ「最も近い敵を攻撃」
export function planTactics(s, seat, i, rules = unitsOf(s, seat)[i].rules ?? []) {
    const cells = reachable(s, seat, i);
    const options = attackOptions(s, seat, i, cells);
    const rule = rules.find(r => conditionMet(s, seat, i, r.cond, options));
    return { ...planAction(s, seat, i, rule?.act ?? 'nearest', cells, options), rule: rule ? rules.indexOf(rule) : null };
}

// 決着の判定用：残りHPの割合の合計
export const hpScore = (s, seat) => unitsOf(s, seat).reduce((sum, u) => sum + Math.max(0, u.hp) / u.maxHp, 0);
