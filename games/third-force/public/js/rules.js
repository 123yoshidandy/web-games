/**
 * 戦術（ルール）の形と評価
 * 戦術は「出撃ルール」（上から順に、条件 → 行動。最大 12 行）と、兵種ごとの「兵器の動き」（8 枚のカード）と、「編成」（最大 4 つ）でできている
 * 評価はすべて自分から見た向き（自陣が左・x=0）で行う。対戦（battle.js）が B の視点を座標の反転で作って渡す
 *
 * 形（JSON にそのまま書ける）:
 *   { name, rules: [{ on, when: [条件…], act: 行動, wait }], arms: { 兵種: { advance, keepFrom, keepDist, retreat: { empty, noTarget, lowLife } } }, formations: [[{ type, y }…]…] }
 */

import { ARMS, ARM_TYPES, WIDTH, HEIGHT, FIRE_RANGE, OVERLAP, TICKS_PER_SECOND, canHit, BAND, bandsOf } from './arms.js';

export const MAX_RULES = 12;
export const MAX_CONDS = 2;
export const MAX_FORMATIONS = 4;
export const MAX_FORMATION_SIZE = 8;
export const MAX_NAME_LENGTH = 16;

// ---------- 語彙（並びの順は共有コードの番号になるので、足すときは後ろに足す） ----------

export const COND_KINDS = ['always', 'money', 'threat', 'near', 'count', 'life', 'time', 'chance'];
export const CLASSES = ['all', 'ground', 'air', ...ARM_TYPES];             // 敵・味方の種類
export const NEAR_CLASSES = ['antiAir', 'antiGround', ...ARM_TYPES];       // 対象の高さの敵の種類
export const THREAT_DISTS = [25, 50, 75, 100, 150];
export const MONEY_STEP = 500;
export const MONEY_MAX = 20000;
export const COUNT_MAX = 20;
export const LIFE_STEP = 100;
export const LIFE_MIN = -1000;
export const LIFE_MAX = 1000;
export const TIME_STEP = 5;
export const TIME_MAX = 90;
export const CHANCE_STEP = 5;
export const WAITS = [0, 0.5, 1, 3, 5];                                    // 発動したあと、条件を見ない秒数
export const ACT_KINDS = ['spawn', 'formation', 'save'];
export const UNITS = ['random', ...ARM_TYPES];
export const POSITIONS = ['target', 'top', 'upper', 'middle', 'lower', 'bottom', 'random', 'weakest'];
export const POSITION_Y = { top: 0, upper: 25, middle: 50, lower: 75, bottom: 100 };
export const ADVANCES = ['enemyBase', 'range', 'center', 'home'];
export const KEEP_FROM = ['none', 'ground', 'air', 'antiAir', 'antiGround', ...ARM_TYPES]; // antiAir：空を撃てる敵、antiGround：地上を撃てる敵
export const KEEP_DISTS = [20, 40, 60, 80];
export const LOW_LIFES = [0, 25, 50];
export const HOME_X = 30;                                                  // 「自陣の前（守り）」で止まる位置
const WEAKEST_ORDER = [50, 25, 75, 0, 100];                                // 「一番手薄」の候補（同じなら前の方）

// 兵器の動きの既定（歩兵・爆撃機は敵陣まで、ほかは敵陣の射程の手前。退却は弾切れだけ）
export const defaultArm = (type) => ({
    advance: type === 'infantry' || type === 'bomber' ? 'enemyBase' : 'range',
    keepFrom: 'none',
    keepDist: 60,
    retreat: { empty: true, noTarget: false, lowLife: 0 }
});

export const defaultArms = () => Object.fromEntries(ARM_TYPES.map((type) => [type, defaultArm(type)]));

export const emptyTactic = (name = '新しい戦術') => ({
    name,
    rules: [
        { on: true, when: [{ k: 'money', op: 'lt', n: 2000 }], act: { k: 'save' }, wait: 0 },
        { on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'random', at: 'random' }, wait: 0 }
    ],
    arms: defaultArms(),
    formations: []
});

// ---------- 検証と正規化（端末・URL・サーバーから来た値は、すべてここを通す） ----------

const fail = (message) => { throw new Error(message); };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const oneOf = (value, list, what) => (list.includes(value) ? value : fail(`${what}が正しくありません`));
const intIn = (value, min, max, step, what) => (Number.isInteger(value) && value >= min && value <= max && (value - min) % step === 0
    ? value : fail(`${what}が範囲の外です`));
const bool = (value, what) => (typeof value === 'boolean' ? value : fail(`${what}が正しくありません`));

export function normalizeCond(c) {
    if (!isObject(c)) fail('条件の形が正しくありません');
    const k = oneOf(c.k, COND_KINDS, '条件の種類');
    switch (k) {
        case 'always': return { k };
        case 'money': return { k, op: oneOf(c.op, ['ge', 'lt'], 'お金の比べ方'), n: intIn(c.n, 0, MONEY_MAX, MONEY_STEP, 'お金') };
        case 'threat': {
            const unless = c.unless ?? [];
            if (!Array.isArray(unless) || unless.length > ARM_TYPES.length) fail('迎撃の兵種が正しくありません');
            const set = new Set(unless.map((t) => oneOf(t, ARM_TYPES, '迎撃の兵種')));
            return { k, cls: oneOf(c.cls, CLASSES, '脅威の種類'), dist: oneOf(c.dist, THREAT_DISTS, '脅威の距離'), unless: ARM_TYPES.filter((t) => set.has(t)) };
        }
        case 'near': return { k, cls: oneOf(c.cls, NEAR_CLASSES, '対象の高さの敵の種類'), has: bool(c.has, 'いる・いない') };
        case 'count': return {
            k, who: oneOf(c.who, ['own', 'enemy'], '数える軍'), cls: oneOf(c.cls, CLASSES, '数える種類'),
            op: oneOf(c.op, ['ge', 'le'], '数の比べ方'), n: intIn(c.n, 0, COUNT_MAX, 1, '数')
        };
        case 'life': return {
            k, who: oneOf(c.who, ['own', 'enemy', 'diff'], '体力の対象'), op: oneOf(c.op, ['ge', 'le'], '体力の比べ方'),
            n: intIn(c.n, LIFE_MIN, LIFE_MAX, LIFE_STEP, '体力')
        };
        case 'time': return { k, op: oneOf(c.op, ['ge', 'lt'], '時間の比べ方'), n: intIn(c.n, 0, TIME_MAX, TIME_STEP, '時間') };
        case 'chance': return { k, n: intIn(c.n, CHANCE_STEP, 100 - CHANCE_STEP, CHANCE_STEP, '確率') };
        default: return fail('条件の種類が正しくありません');
    }
}

export function normalizeAct(a, formationCount) {
    if (!isObject(a)) fail('行動の形が正しくありません');
    const k = oneOf(a.k, ACT_KINDS, '行動の種類');
    if (k === 'spawn') return { k, unit: oneOf(a.unit, UNITS, '出撃の兵種'), at: oneOf(a.at, POSITIONS, '出撃の位置') };
    if (k === 'formation') {
        if (!Number.isInteger(a.i) || a.i < 0 || a.i >= formationCount) fail('編成の番号が正しくありません');
        return { k, i: a.i };
    }
    return { k };
}

export function normalizeArm(arm, type) {
    if (!isObject(arm) || !isObject(arm.retreat)) fail(`${ARMS[type].name}の動きが正しくありません`);
    return {
        advance: oneOf(arm.advance, ADVANCES, '進む先'),
        keepFrom: oneOf(arm.keepFrom, KEEP_FROM, '間合いの相手'),
        keepDist: oneOf(arm.keepDist, KEEP_DISTS, '間合いの距離'),
        retreat: {
            empty: bool(arm.retreat.empty, '弾切れの退却'),
            noTarget: bool(arm.retreat.noTarget, '撃てる敵がいないときの退却'),
            lowLife: oneOf(arm.retreat.lowLife, LOW_LIFES, '体力の退却')
        }
    };
}

export function normalizeTactic(input) {
    if (!isObject(input)) fail('戦術の形が正しくありません');
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    const formations = input.formations ?? [];
    if (!Array.isArray(formations) || formations.length > MAX_FORMATIONS) fail('編成の数が多すぎます');
    const normFormations = formations.map((f) => {
        if (!Array.isArray(f) || f.length < 1 || f.length > MAX_FORMATION_SIZE) fail('編成の兵器の数が正しくありません');
        return f.map((e) => {
            if (!isObject(e)) fail('編成の形が正しくありません');
            return { type: oneOf(e.type, ARM_TYPES, '編成の兵種'), y: intIn(e.y, 0, HEIGHT, 1, '編成の高さ') };
        });
    });
    if (!Array.isArray(input.rules) || input.rules.length > MAX_RULES) fail('出撃ルールの行が多すぎます');
    const rules = input.rules.map((line) => {
        if (!isObject(line) || !Array.isArray(line.when) || line.when.length > MAX_CONDS) fail('出撃ルールの行の形が正しくありません');
        const when = line.when.map(normalizeCond);
        const act = normalizeAct(line.act, normFormations.length);
        return { on: line.on !== false, when, act, wait: oneOf(line.wait ?? 0, WAITS, '待ち時間') };
    });
    const armsIn = input.arms ?? {};
    if (!isObject(armsIn)) fail('兵器の動きの形が正しくありません');
    const arms = Object.fromEntries(ARM_TYPES.map((type) => [type, armsIn[type] ? normalizeArm(armsIn[type], type) : defaultArm(type)]));
    return { name: name || '名前のない戦術', rules, arms, formations: normFormations };
}

// 「対象の高さ」を使う行に、対象を決める「脅威」の条件があるか（エディタの注意と、評価の既定に使う）
export const lineHasThreat = (line) => line.when.some((c) => c.k === 'threat');

// ---------- 評価 ----------

const matchClass = (arm, cls) => cls === 'all' || (cls === 'ground' ? !arm.onAir : cls === 'air' ? arm.onAir : arm.type === cls);
const matchNear = (arm, cls) => (cls === 'antiAir' ? arm.vsAir : cls === 'antiGround' ? arm.vsEarth : arm.type === cls);
const matchKeep = (arm, cls) => (cls === 'antiAir' || cls === 'antiGround' ? matchNear(arm, cls) : matchClass(arm, cls));
const compare = (value, op, n) => (op === 'ge' ? value >= n : op === 'lt' ? value < n : value <= n);

/**
 * 自分から見た向きの盤面（view）で、兵器の動きを決める。兵器ごとに { arm, dest（自分の向き）, ret } を返す
 * view: { own: { arms }, enemy: { arms } }。arms の各項目は { ref, type, x, y, life, maxLife, bullets, onAir, vsAir, vsEarth, range }
 */
export function armOrders(view, tactic) {
    const orders = [];
    let enemies = null; // 高さの帯に分けた敵（要るときだけ作る）
    for (const self of view.own.arms) {
        const card = tactic.arms[self.type];
        let dest = card.advance === 'enemyBase' ? WIDTH
            : card.advance === 'range' ? WIDTH - self.range
                : card.advance === 'center' ? WIDTH / 2 : HOME_X;
        let ret = false;
        let canShootAhead = false;
        let nearest = null;
        const needEnemies = card.keepFrom !== 'none' || (card.retreat.noTarget && self.type !== 'bomber');
        if (needEnemies) {
            enemies ??= bandsOf(view.enemy.arms, 'y');
            const last = Math.floor((self.y + FIRE_RANGE) / BAND);
            for (let band = Math.floor((self.y - FIRE_RANGE) / BAND); band <= last; band++) {
                const list = enemies[band];
                if (list) for (const e of list) {
                    if (e.x <= self.x || Math.abs(e.y - self.y) > FIRE_RANGE) continue; // 前方かつ同じ高さだけを見る
                    if (canHit(self, e)) canShootAhead = true;
                    if (card.keepFrom !== 'none' && matchKeep(e, card.keepFrom) && (!nearest || e.x < nearest.x)) nearest = e;
                }
            }
        }
        if (nearest) dest = Math.min(dest, nearest.x - card.keepDist);
        if (card.retreat.empty && self.bullets <= 0) ret = true;
        if (card.retreat.noTarget && self.type !== 'bomber' && !canShootAhead) ret = true;
        if (card.retreat.lowLife > 0 && self.life * 100 <= self.maxLife * card.retreat.lowLife) ret = true;
        orders.push({ arm: self.ref, dest, ret });
    }
    return orders;
}

// 条件を1つ確かめる。ctx.target は「脅威」の条件が決めた対象
function test(cond, env, ctx) {
    switch (cond.k) {
        case 'always': return true;
        case 'money': return compare(env.own.money, cond.op, cond.n);
        case 'threat': {
            let target = null;
            for (const e of env.enemy.arms) {
                if (e.x > cond.dist || !matchClass(e, cond.cls)) continue;
                if (cond.unless.length > 0 && env.own.arms.some((f) => cond.unless.includes(f.type) && f.x < e.x && Math.abs(e.y - f.y) <= FIRE_RANGE)) continue;
                if (!target || e.x < target.x) target = e;
            }
            ctx.target = target;
            return target !== null;
        }
        case 'near': {
            if (!ctx.target) return false;
            const found = env.enemy.arms.some((e) => Math.abs(e.y - ctx.target.y) <= FIRE_RANGE && matchNear(e, cond.cls));
            return found === cond.has;
        }
        case 'count': {
            const arms = cond.who === 'own' ? env.own.arms : env.enemy.arms;
            let n = 0;
            for (const a of arms) if (matchClass(a, cond.cls)) n++;
            return compare(n, cond.op, cond.n);
        }
        case 'life': {
            const value = cond.who === 'own' ? env.own.life : cond.who === 'enemy' ? env.enemy.life : env.own.life - env.enemy.life;
            return compare(value, cond.op, cond.n);
        }
        case 'time': return compare(env.time / TICKS_PER_SECOND, cond.op, cond.n);
        case 'chance': return env.random() * 100 < cond.n;
        default: return false;
    }
}

const occupied = (arms, y) => arms.some((a) => Math.abs(a.x) <= OVERLAP && Math.abs(a.y - y) <= OVERLAP);

function positionOf(at, env, ctx) {
    if (at in POSITION_Y) return POSITION_Y[at];
    if (at === 'target') return ctx.target ? ctx.target.y : POSITION_Y.middle;
    if (at === 'random') return Math.floor(env.random() * HEIGHT);
    // 一番手薄：味方の少ない高さ
    let best = WEAKEST_ORDER[0];
    let bestCount = Infinity;
    for (const y of WEAKEST_ORDER) {
        let n = 0;
        for (const a of env.own.arms) if (Math.abs(a.y - y) <= FIRE_RANGE) n++;
        if (n < bestCount) { best = y; bestCount = n; }
    }
    return best;
}

/**
 * 出撃ルールを上から見て、条件の合った最初の1行だけを発動する
 * env: { time, random, own: { money, life, arms, waits, counts }, enemy: { life, arms } }（arms は自分の向き。生成の地点は x=0）
 * 返り値：{ line（発動した行の番号か -1）, spawns: [{ type, y }]（自分の向き） }。waits・counts はここで書き換える
 * - 条件は合ったがお金が足りない：そこで止めて貯める（下の行は見ない）
 * - 生成の地点が埋まっている：次の行へ
 */
export function decideSpawns(tactic, env) {
    for (let i = 0; i < tactic.rules.length; i++) {
        const line = tactic.rules[i];
        if (!line.on || (env.own.waits[i] ?? 0) > env.time) continue;
        const ctx = { target: null };
        let ok = true;
        for (const cond of line.when) {
            if (!test(cond, env, ctx)) { ok = false; break; }
        }
        if (!ok) continue;
        const act = line.act;
        if (act.k === 'save') {
            env.own.counts[i] = (env.own.counts[i] ?? 0) + 1;
            return { line: i, spawns: [] };
        }
        let spawns;
        if (act.k === 'spawn') {
            const type = act.unit === 'random' ? ARM_TYPES[Math.floor(env.random() * ARM_TYPES.length)] : act.unit;
            const y = Math.max(0, Math.min(HEIGHT, positionOf(act.at, env, ctx)));
            if (env.own.money < ARMS[type].cost) return { line: -1, spawns: [] };
            if (occupied(env.own.arms, y)) continue;
            spawns = [{ type, y }];
        } else {
            const formation = tactic.formations[act.i];
            const total = formation.reduce((sum, e) => sum + ARMS[e.type].cost, 0);
            if (env.own.money < total) return { line: -1, spawns: [] };
            spawns = [];
            for (const e of formation) {
                if (!occupied(env.own.arms, e.y) && !spawns.some((s) => Math.abs(s.y - e.y) <= OVERLAP)) spawns.push({ type: e.type, y: e.y });
            }
            if (spawns.length === 0) continue;
        }
        env.own.counts[i] = (env.own.counts[i] ?? 0) + 1;
        env.own.waits[i] = env.time + Math.round(line.wait * TICKS_PER_SECOND);
        return { line: i, spawns };
    }
    return { line: -1, spawns: [] };
}
