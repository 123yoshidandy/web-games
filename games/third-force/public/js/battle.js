/**
 * 対戦のシミュレーター（DOM・時刻・Math.random を使わない。同じシードと2つの戦術からは、いつも同じ対戦になる）
 *   const battle = createBattle({ seed, tactics: [A, B] });
 *   step(battle);          // 1 tick 進める
 *   runBattle({ seed, tactics }) // 終局まで進めて返す
 *
 * 1 tick の処理（原作と同じ）
 * - 偶数 tick：移動（退却した兵器を除いて費用を全額返す → 重なりの回避 → 目的地へ）→ 判断（両軍の戦術を同じ盤面で評価してから、出撃させる）
 * - 奇数 tick：射撃（両軍が撃ってから死んだ兵器を除く）→ 陣地の攻撃 → 両軍のお金 +50
 * - どちらかの体力が 0 以下か、5000 tick で終わり。体力の多い方が勝ち、同じなら引き分け
 * 乱数はシードから3本に分ける（射撃の的の選び方・A の戦術・B の戦術）。相手の戦術で、自分の引く値の並びは変わらない
 * B の視点は、評価のときに盤面を 180 度回して作る（x → 200 - x、y → 100 - y）。状態は書き換えない
 */

import { ARMS, WIDTH, HEIGHT, OVERLAP, FIRE_RANGE, MAX_TICKS, START_LIFE, START_MONEY, INCOME, RAIDERS, canHit, BAND, bandsOf } from './arms.js';
import { armOrders, decideSpawns } from './rules.js';
import { createRandom } from './random.js';

// 対戦の結果が変わる直しをしたら上げる（古い記録は「この版では再現できない」と出す）
export const ENGINE_VERSION = 1;

const SHOT_TICKS = 6; // 射撃の線を描きに残す tick 数

export function createBattle({ seed, tactics }) {
    const root = createRandom(seed >>> 0);
    const seeds = [0, 1, 2].map(() => Math.floor(root() * 2 ** 32));
    const side = (i) => ({
        life: START_LIFE, money: START_MONEY, arms: [], waits: [], counts: [],
        random: createRandom(seeds[i + 1]),
        stats: { spawned: 0, lost: 0, killed: 0, raids: 0, retreats: 0 }
    });
    return {
        engine: ENGINE_VERSION,
        seed: seed >>> 0,
        tactics,
        time: 0,
        sides: [side(0), side(1)],
        combat: createRandom(seeds[0]),
        nextId: 1,
        events: [],   // 出来事 { t, side, kind: spawn/kill/raid/retreat, type, line? }
        shots: [],    // 描画用の射撃の線 { t, x1, y1, x2, y2 }
        blasts: [],   // 描画用の陣地の爆発 { t, x, y }
        over: false,
        winner: null  // 0・1、引き分けは null
    };
}

// 自分から見た向きの座標
const viewX = (side, x) => (side === 0 ? x : WIDTH - x);
const viewY = (side, y) => (side === 0 ? y : HEIGHT - y);

function viewArms(battle, side, of) {
    return battle.sides[of].arms.map((a) => ({
        ref: a, type: a.type, x: viewX(side, a.x), y: viewY(side, a.y), life: a.life, maxLife: a.maxLife,
        bullets: a.bullets, onAir: a.onAir, vsAir: a.vsAir, vsEarth: a.vsEarth, range: a.range
    }));
}

function spawn(battle, side, type, y, line) {
    const s = battle.sides[side];
    const spec = ARMS[type];
    const x = side === 0 ? 0 : WIDTH;
    if (s.money < spec.cost) return false;
    if (s.arms.some((a) => Math.abs(a.x - x) <= OVERLAP && Math.abs(a.y - y) <= OVERLAP)) return false;
    s.money -= spec.cost;
    s.arms.push({
        id: battle.nextId++, side, type, x, y,
        life: spec.life, maxLife: spec.life, attack: spec.attack, range: spec.range, cooltime: spec.cooltime,
        bullets: spec.bullets, speed: spec.speed, cost: spec.cost, onAir: spec.onAir, vsAir: spec.vsAir, vsEarth: spec.vsEarth,
        dest: side === 0 ? WIDTH : 0, ret: false, fired: -100, stopped: false, dodge: -1
    });
    s.stats.spawned++;
    battle.events.push({ t: battle.time, side, kind: 'spawn', type, line });
    return true;
}

function move(battle) {
    for (let side = 0; side < 2; side++) {
        const s = battle.sides[side];
        for (let i = s.arms.length - 1; i >= 0; i--) {
            const arm = s.arms[i];
            if (!arm.ret) continue;
            s.money += arm.cost; // 退却：傷ついていても、生成の費用を全額返す（原作どおり）
            s.stats.retreats++;
            battle.events.push({ t: battle.time, side, kind: 'retreat', type: arm.type });
            s.arms.splice(i, 1);
        }
    }
    // 味方を x の帯に分ける（tick の初めの位置で。1 tick に動く量は帯の幅より小さいので、両隣の帯まで見れば足りる）
    const friendBands = [bandsOf(battle.sides[0].arms, 'x'), bandsOf(battle.sides[1].arms, 'x')];
    for (const arm of battle.sides[0].arms.concat(battle.sides[1].arms)) {
        arm.stopped = true;
        const bands = friendBands[arm.side];
        const center = Math.floor(arm.x / BAND);
        let conflict = false;
        for (let band = center - 1; band <= center + 1 && !conflict; band++) {
            const list = bands[band];
                if (list) for (const f of list) {
                if (f !== arm && Math.abs(arm.x - f.x) <= OVERLAP && Math.abs(arm.y - f.y) <= OVERLAP && f.stopped) { conflict = true; break; }
            }
        }
        if (conflict) {
            // 重なったら縦によける（原作は上へだけ。盤面の端に着いたら向きを変え、盤面の外へは出ない）
            if (arm.y + arm.dodge * arm.speed < 0 || arm.y + arm.dodge * arm.speed > HEIGHT) arm.dodge = -arm.dodge;
            arm.y = Math.max(0, Math.min(HEIGHT, arm.y + arm.dodge * arm.speed));
            arm.stopped = false;
        } else if (arm.x < arm.dest) {
            arm.x = Math.min(arm.x + (arm.side === 0 ? arm.speed : 0.5 * arm.speed), arm.dest); // 後ろへは半分の速さ
        } else if (arm.x > arm.dest) {
            arm.x = Math.max(arm.x - (arm.side === 0 ? 0.5 * arm.speed : arm.speed), arm.dest);
        }
    }
}

// 関数の戦術（テストの参考の版）に渡す形。戻り値は { spawns: [[y, type]…], orders: [{ arm, dest, ret }] }
function decideByFunction(tactic, battle, side, view) {
    const s = battle.sides[side];
    const result = tactic({ time: battle.time, own: { ...view.own, money: s.money, life: s.life }, enemy: view.enemy, random: s.random });
    return { line: -1, spawns: (result.spawns ?? []).map(([y, type]) => ({ type, y })), orders: result.orders ?? [] };
}

function command(battle) {
    const decisions = [0, 1].map((side) => {
        const s = battle.sides[side];
        const enemy = battle.sides[1 - side];
        const view = { own: { arms: viewArms(battle, side, side) }, enemy: { arms: viewArms(battle, side, 1 - side) } };
        const tactic = battle.tactics[side];
        if (typeof tactic === 'function') return decideByFunction(tactic, battle, side, view);
        const orders = armOrders(view, tactic);
        const env = {
            time: battle.time, random: s.random,
            own: { money: s.money, life: s.life, arms: view.own.arms, waits: s.waits, counts: s.counts },
            enemy: { life: enemy.life, arms: view.enemy.arms }
        };
        return { ...decideSpawns(tactic, env), orders };
    });
    decisions.forEach(({ orders, spawns, line }, side) => {
        for (const { arm, dest, ret } of orders) {
            arm.dest = viewX(side, dest);
            arm.ret = ret;
        }
        for (const { type, y } of spawns) spawn(battle, side, type, Math.max(0, Math.min(HEIGHT, viewY(side, y))), line);
    });
}

function attackEnemy(battle) {
    for (let side = 0; side < 2; side++) {
        const enemies = bandsOf(battle.sides[1 - side].arms, 'y'); // 高さの帯に分け、|dy| が FIRE_RANGE 以内の帯だけを見る
        for (const arm of battle.sides[side].arms) {
            if (arm.bullets <= 0 || !(battle.time > arm.fired + arm.cooltime)) continue;
            const targets = [];
            const last = Math.floor((arm.y + FIRE_RANGE) / BAND);
            for (let band = Math.floor((arm.y - FIRE_RANGE) / BAND); band <= last; band++) {
                const list = enemies[band];
                if (list) for (const e of list) {
                    const ahead = side === 0 ? arm.x <= e.x && e.x <= arm.x + arm.range : arm.x - arm.range <= e.x && e.x <= arm.x;
                    if (ahead && Math.abs(arm.y - e.y) <= FIRE_RANGE && canHit(arm, e)) targets.push(e);
                }
            }
            if (targets.length === 0) continue;
            const target = targets[Math.floor(battle.combat() * targets.length)];
            target.life -= arm.attack;
            arm.bullets--;
            arm.fired = battle.time;
            battle.shots.push({ t: battle.time, x1: arm.x, y1: arm.y, x2: target.x, y2: target.y, side });
        }
    }
    // 両軍が撃ってから、死んだ兵器を除く（同時に解決する）
    for (let side = 0; side < 2; side++) {
        const s = battle.sides[side];
        for (let i = s.arms.length - 1; i >= 0; i--) {
            const arm = s.arms[i];
            if (arm.life > 0) continue;
            s.stats.lost++;
            battle.sides[1 - side].stats.killed++;
            battle.events.push({ t: battle.time, side, kind: 'kill', type: arm.type });
            s.arms.splice(i, 1);
        }
    }
}

function attackArea(battle) {
    for (let side = 0; side < 2; side++) {
        const s = battle.sides[side];
        for (let i = s.arms.length - 1; i >= 0; i--) {
            const arm = s.arms[i];
            if (!RAIDERS.includes(arm.type)) continue;
            if (side === 0 ? arm.x < WIDTH - 1 : arm.x > 1) continue;
            battle.sides[1 - side].life -= arm.attack;
            s.stats.raids++;
            battle.events.push({ t: battle.time, side, kind: 'raid', type: arm.type });
            battle.blasts.push({ t: battle.time, x: arm.x, y: arm.y, side });
            s.arms.splice(i, 1);
        }
    }
}

export function step(battle) {
    if (battle.over) return battle;
    if (battle.time % 2 === 0) {
        move(battle);
        command(battle);
    } else {
        attackEnemy(battle);
        attackArea(battle);
        battle.sides[0].money += INCOME;
        battle.sides[1].money += INCOME;
    }
    battle.time++;
    if (battle.shots.length > 0 && battle.shots[0].t < battle.time - SHOT_TICKS) battle.shots = battle.shots.filter((s) => s.t >= battle.time - SHOT_TICKS);
    if (battle.blasts.length > 0 && battle.blasts[0].t < battle.time - SHOT_TICKS * 4) battle.blasts = battle.blasts.filter((b) => b.t >= battle.time - SHOT_TICKS * 4);
    const [a, b] = battle.sides;
    if (a.life <= 0 || b.life <= 0 || battle.time >= MAX_TICKS) {
        battle.over = true;
        battle.winner = a.life > b.life ? 0 : a.life < b.life ? 1 : null;
    }
    return battle;
}

// tick まで進める（続きから・リプレイの早送り）
export function advanceTo(battle, tick) {
    while (!battle.over && battle.time < tick) step(battle);
    return battle;
}

export function runBattle({ seed, tactics }) {
    const battle = createBattle({ seed, tactics });
    while (!battle.over) step(battle);
    return battle;
}

// 結果の要約（勝者・体力・ルールごとの発動回数）
export const summaryOf = (battle) => ({
    over: battle.over,
    winner: battle.winner,
    time: battle.time,
    life: battle.sides.map((s) => s.life),
    counts: battle.sides.map((s) => [...s.counts]),
    stats: battle.sides.map((s) => ({ ...s.stats }))
});

// 状態のハッシュ（決定性のテスト）。数は文字にしてから FNV-1a で混ぜる
export function hashBattle(battle) {
    const parts = [battle.time, battle.winner, battle.nextId];
    for (const s of battle.sides) {
        parts.push(s.life, s.money, s.counts.join(','));
        for (const a of s.arms) parts.push(a.id, a.type, a.x, a.y, a.life, a.bullets, a.dest, a.ret ? 1 : 0);
    }
    for (const e of battle.events) parts.push(e.t, e.side, e.kind, e.type, e.line ?? '');
    let h = 0x811c9dc5;
    const text = parts.join('|');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
