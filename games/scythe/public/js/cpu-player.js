/**
 * CPU
 * 自分から見える情報だけで選ぶ（ほかの人の戦闘カードの数字・目標・山札の並びは見ない）
 * 区画ごとに、上段の候補と下段の候補を写しの上で試し、盤面の評価がいちばん上がる組み合わせを選ぶ
 * ゲームの乱数は使わない（ゆらぎは状態から作った数で決める）ので、記録の再現はずれない
 *
 * 強さ
 *   easy：ゆらぎが大きく、移動は1体ずつしか考えない。戦闘の見積もりも甘い
 *   normal：上段の候補の上位3つと下段を組み合わせて比べる。勝てる見込みのある戦闘だけを仕掛ける
 */

import { MAP, FACTIONS, MATS, RESOURCES, BOTTOMS, TOP_UPGRADES, ONE_TIME, STRUCTURES, ENCOUNTER_CARDS, FACTORY_CARDS } from './data.js';
import {
    WORKERS_MAX, hexOf, isBoard, isFighter, unitsAt, structureAt, workersOnBoard, hasAbility, controllerOf,
    controlledHexes, resourceTotals, reachable, stepTargets, tierOf, structureBonusOf, territoryCount
} from './rules.js';

export const LEVELS = { easy: 'やさしい', normal: 'ふつう' };
export const PROFILES = {
    easy: { name: 'easy', noise: 4, moveUnits: 1, lookahead: 1, careful: false },
    normal: { name: 'normal', noise: 0.6, moveUnits: 3, lookahead: 3, careful: true }
};

const STAR_VALUE = 10;
const TOP_SPOT_VALUE = { moveUnits: 1.5, gainCoins: 0.6, power: 0.8, cards: 0.8, popularity: 1.5, produce: 2.4 };
const MECH_VALUE = { speed: 2.5, riverwalk: 1.5 };

export const cpuActors = (game) => game.actors().filter(s => game.players[s].isCPU);

// 状態から作るゆらぎ（-1〜1）。ゲームの乱数は使わない
function jitter(game, seat, salt) {
    let h = (game.turnCount * 2654435761 + seat * 40503 + salt * 97 + (game.options.seed >>> 0)) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13;
    return ((h >>> 0) / 4294967295) * 2 - 1;
}

// ---- 盤面の評価 ----

function bottomRemaining(p) {
    return [6 - p.upgrades.top.length, 4 - p.mechs.filter(Boolean).length, 4 - p.built.length, 4 - p.recruits.filter(Boolean).length];
}

// 指導者から、まだある遭遇の印と工場までの近さ
function charTargetValue(S, seat) {
    const p = S.players[seat];
    const char = S.units.find(u => u.seat === seat && u.kind === 'char');
    if (!char) return 0;
    const targets = new Map(S.encounters.map(h => [h, 5]));
    if (p.factoryCard === null && controllerOf(S, MAP.factory) !== seat) targets.set(MAP.factory, 6);
    if (targets.size === 0) return 0;
    const dist = new Map([[char.hex, 0]]);
    let frontier = [char.hex];
    let best = 0;
    for (let d = 1; d <= 6 && frontier.length; d++) {
        const next = [];
        frontier.forEach(h => stepTargets(S, seat, 'char', h).forEach(t => {
            if (dist.has(t)) return;
            dist.set(t, d);
            next.push(t);
            if (targets.has(t)) best = Math.max(best, targets.get(t) - d * 1.1);
        }));
        frontier = next;
    }
    return Math.max(0, best);
}

export function evaluate(S, seat) {
    const p = S.players[seat];
    const mat = MATS[p.mat];
    let v = 0;
    v += p.coins;
    v += p.starCount * STAR_VALUE;
    // 星までの進み具合
    v += p.upgrades.top.length * 2.6 + p.upgrades.top.reduce((a, k) => a + TOP_SPOT_VALUE[k], 0);
    v += p.upgrades.bottom.reduce((a, n, i) => a + n * (i === 0 ? 0.8 : 1.4), 0);
    const abilities = FACTIONS[p.faction].mechs;
    p.mechs.forEach((on, i) => { if (on) v += 3 + (MECH_VALUE[abilities[i]] ?? 0.8); });
    v += p.built.length * 3 + (p.built.includes('mill') ? 1 : 0);
    v += structureBonusOf(S, seat, S.structureBonus ?? 0).points * 0.6;
    v += p.recruits.filter(Boolean).length * 2.8;
    const workers = workersOnBoard(S, seat);
    v += Math.min(workers, WORKERS_MAX) * 1.6;
    // 人気と力は、星（18・16）に近づくほど高く数える
    v += p.popularity * 0.6 + (p.popularity >= 7 ? 2 : 0) + (p.popularity >= 13 ? 3 : 0) + Math.max(0, p.popularity - 10) * 0.7;
    v += Math.min(p.power, 16) * 0.3 + Math.max(0, Math.min(p.power, 16) - 9) * 0.6;
    v += Math.min(p.cards?.length ?? p.cardCount ?? 0, 8) * 0.7;
    if (p.factoryCard !== null) v += 4;
    // 資源：下段に使う分は高く、余りは安く数える
    const res = resourceTotals(S, seat);
    const remaining = bottomRemaining(p);
    BOTTOMS.forEach((key, i) => {
        const r = ['oil', 'metal', 'wood', 'food'][i];
        const cost = mat.bottom[i].cost - p.upgrades.bottom[i];
        const need = remaining[i] > 0 ? cost * Math.min(2, remaining[i]) : 0;
        const have = res[r];
        v += Math.min(have, need) * 0.9 + Math.max(0, have - need) * 0.3;
    });
    // 領地と、生産の見込み
    v += territoryCount(S, seat) * 1.1;
    const tier = tierOf(p.popularity);
    v += tier.territory * 0;
    const hexes = [...new Set(S.units.filter(u => u.seat === seat && u.kind === 'worker' && isBoard(u.hex)).map(u => u.hex))];
    const yields = hexes.map(h => {
        const n = S.units.filter(u => u.seat === seat && u.kind === 'worker' && u.hex === h).length;
        const t = hexOf(h).terrain;
        if (t === 'village') return workers < WORKERS_MAX ? n * 1.2 : 0;
        if (t === 'factory' || t === 'lake') return 0;
        return n;
    }).sort((a, b) => b - a);
    v += yields.slice(0, p.upgrades.top.includes('produce') ? 3 : 2).reduce((a, b) => a + b, 0) * 0.5;
    v += charTargetValue(S, seat) * 0.6;
    return v;
}

// ---- 戦闘の見積もり ----

const topCards = (cards, n) => [...cards].sort((a, b) => b - a).slice(0, n);

// 相手の強さの見積もり（カードの数字は見えないので、枚数から見積もる）
function foeEstimate(game, foe, hex) {
    const F = game.players[foe];
    const allow = Math.min(game.cardAllowance(foe, hex), F.cards.length);
    return Math.min(7, F.power) + allow * 3.6;
}

// 自分が仕掛けたときに勝てそうか（仕掛ける側は引き分けで勝つ）
function attackChance(game, seat, hex, foe, careful) {
    const P = game.players[seat];
    const sim = game;
    const mine = Math.min(7, P.power) + topCards(P.cards, sim.cardAllowance(seat, hex)).reduce((a, b) => a + b, 0);
    const theirs = foeEstimate(game, foe, hex);
    if (mine >= theirs + (careful ? 1.5 : -2)) return 0.85;
    if (mine >= theirs) return careful ? 0.45 : 0.6;
    return careful ? 0.1 : 0.4;
}

// ---- 候補の手 ----

function apply(game, seat, commands) {
    const g = game.clone();
    for (const c of commands) if (!g.applyCommand(seat, c)) return null;
    return g;
}

const scoreOf = (g, seat) => evaluate({ ...g, structureBonus: g.structureBonus }, seat);

// 移動の候補を、1体ずつ貪欲に組み立てる
function planMove(game, seat, limit, range, prof) {
    const g = game.clone();
    const moves = [];
    const moved = new Set();
    let bonus = 0;               // ここまでの移動の見積もり（戦闘・遭遇など）
    let base = evaluate(g, seat);
    for (let k = 0; k < limit; k++) {
        let best = null;
        const units = g.units.filter(u => u.seat === seat && !moved.has(u.id));
        for (const unit of units) {
            const steps = range ?? (isFighter(unit) && hasAbility(g, seat, 'speed') ? 2 : 1);
            const dests = reachable(g, unit, steps);
            const riders = unit.kind === 'mech' ? g.units.filter(u => u.seat === seat && u.kind === 'worker' && u.hex === unit.hex && !moved.has(u.id)) : [];
            for (const to of dests.keys()) {
                const variants = riders.length > 0 && hexOf(to).terrain !== 'lake' ? [[], riders.map(r => r.id), [riders[0].id]] : [[]];
                for (const workers of variants) {
                    const r = trialMove(g, seat, unit, to, workers, prof);
                    if (r === null) continue;
                    r.value += bonus;
                    if (!best || r.value > best.value) best = { ...r, unit, to, workers };
                }
            }
        }
        if (!best || best.value - base <= 0.25) break;
        // 写しの上で動かす
        const carry = best.carry;
        commitSim(g, best.unit, best.to, best.workers, carry);
        best.workers.forEach(id => moved.add(id));
        moved.add(best.unit.id);
        moves.push({ unit: best.unit.id, to: best.to, workers: best.workers, carry });
        bonus += best.bonus;
        base = best.value;
        if (best.stop) break; // 戦闘・遭遇の先の手は読まない
    }
    return { moves, value: base };
}

function commitSim(g, unit, to, workers, carry) {
    const from = unit.hex;
    unit.hex = to;
    workers.forEach(id => { g.units.find(u => u.id === id).hex = to; });
    if (carry && isBoard(from) && isBoard(to)) {
        RESOURCES.forEach(r => {
            g.res[to][r] += g.res[from][r];
            g.res[from][r] = 0;
        });
    }
}

// 1体を動かしてみた評価（戦闘・遭遇・工場は見積もりで足す）
function trialMove(g, seat, unit, to, workers, prof) {
    const from = unit.hex;
    const fromRes = isBoard(from) ? { ...g.res[from] } : null;
    const toRes = isBoard(to) ? { ...g.res[to] } : null;
    const enemies = unitsAt(g, to).filter(u => u.seat !== seat);
    const leaving = isBoard(from) && unitsAt(g, from).filter(u => u.seat === seat).length === 1 + workers.length && !structureAt(g, from);
    const carry = leaving && fromRes && RESOURCES.some(r => fromRes[r] > 0) && isBoard(to);
    const P = g.players[seat];
    let bonus = 0;
    let stop = false;
    const fighters = enemies.filter(isFighter);
    let moveAway = [];
    if (isFighter(unit) && fighters.length > 0) {
        const foe = fighters[0].seat;
        const chance = attackChance(g, seat, to, foe, prof.careful);
        const star = P.combatStars < 2 || P.faction === 'saxony' ? STAR_VALUE : 0;
        const loot = toRes ? RESOURCES.reduce((a, r) => a + toRes[r], 0) * 0.8 : 0;
        const lostWorkers = enemies.filter(u => u.kind === 'worker').length;
        const expectedPower = Math.min(7, P.power) * 0.6;
        bonus += chance * (star + loot + 2 - lostWorkers * 0.6) - (1 - chance) * (6 + workers.length * 1.5) - expectedPower * 0.3;
        stop = true;
    } else if (enemies.length > 0) {
        // 労働者だけ：退かせる（人気が下がる）
        const n = enemies.length;
        bonus += -n * (hasAbility(g, seat, 'camaraderie') ? 0 : 0.9) + (toRes ? RESOURCES.reduce((a, r) => a + toRes[r], 0) * 0.8 : 0) + 1;
        moveAway = enemies;
    }
    if (unit.kind === 'char' && g.encounters.includes(to)) {
        bonus += 6;
        stop = true;
    }
    if (unit.kind === 'char' && to === MAP.factory && P.factoryCard === null) {
        bonus += 7;
        stop = true;
    }
    // 動かして測り、元に戻す
    const saved = moveAway.map(u => [u, u.hex]);
    moveAway.forEach(u => { u.hex = -1; });
    const riders = workers.map(id => g.units.find(u => u.id === id));
    unit.hex = to;
    riders.forEach(u => { u.hex = to; });
    if (carry) RESOURCES.forEach(r => { g.res[to][r] += fromRes[r]; g.res[from][r] = 0; });
    const value = evaluate(g, seat) + bonus;
    unit.hex = from;
    riders.forEach(u => { u.hex = from; });
    if (carry) RESOURCES.forEach(r => { g.res[to][r] = toRes[r]; g.res[from][r] = fromRes[r]; });
    saved.forEach(([u, h]) => { u.hex = h; });
    return { value, bonus, stop, carry: !!carry };
}

// 上段の候補（section を選んだ状態の game を受け取る）
function topCandidates(game, seat, prof) {
    const p = game.players[seat];
    const key = game.topOf(game.section);
    const list = [{ command: { type: 'skip' } }];
    if (key === 'move') {
        list.push({ command: { type: 'gain' } });
        const plan = planMove(game, seat, Math.min(prof.moveUnits, game.moveLimit(seat)), null, prof);
        if (plan.moves.length > 0) list.push({ command: { type: 'move', moves: plan.moves }, extra: plan.value });
    } else if (key === 'bolster') {
        if (p.coins >= 1) list.push({ command: { type: 'bolster', choice: 'power' } }, { command: { type: 'bolster', choice: 'cards' } });
    } else if (key === 'trade') {
        if (p.coins >= 1) {
            list.push({ command: { type: 'trade', mode: 'popularity' } });
            const hex = workerHexes(game, seat).sort((a, b) => b.n - a.n)[0]?.hex;
            if (hex !== undefined) {
                for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) {
                    const res = {};
                    res[RESOURCES[i]] = (res[RESOURCES[i]] ?? 0) + 1;
                    res[RESOURCES[j]] = (res[RESOURCES[j]] ?? 0) + 1;
                    list.push({ command: { type: 'trade', mode: 'res', res, hex } });
                }
            }
        }
    } else if (key === 'produce') {
        const hexes = produceHexes(game, seat);
        const limit = game.produceLimit(seat);
        combos(hexes, limit).forEach(c => list.push({ command: { type: 'produce', hexes: c } }));
    } else if (key === 'factoryTop') {
        list.push({ command: { type: 'factoryTop' } });
    }
    return list;
}

function workerHexes(game, seat) {
    const map = new Map();
    game.units.forEach(u => {
        if (u.seat === seat && u.kind === 'worker' && isBoard(u.hex)) map.set(u.hex, (map.get(u.hex) ?? 0) + 1);
    });
    return [...map].map(([hex, n]) => ({ hex, n }));
}

function produceHexes(game, seat) {
    const set = new Set(workerHexes(game, seat).map(w => w.hex));
    game.structures.forEach(s => { if (s.seat === seat && s.type === 'mill' && controllerOf(game, s.hex) === seat) set.add(s.hex); });
    return [...set].filter(h => hexOf(h).terrain !== 'lake' && hexOf(h).terrain !== 'factory');
}

// 大きさ max までの組み合わせのうち、ちょうど min(max, 個数) のもの
function combos(items, max) {
    const k = Math.min(max, items.length);
    const out = [];
    const rec = (start, acc) => {
        if (acc.length === k) { out.push([...acc]); return; }
        for (let i = start; i < items.length; i++) rec(i + 1, [...acc, items[i]]);
    };
    if (k > 0) rec(0, []);
    return out.slice(0, 60);
}

// 下段の候補（top を終えた状態の game を受け取る）
function bottomCandidates(game, seat) {
    const p = game.players[seat];
    const key = game.bottomOf(game.section);
    const list = [{ type: 'skip' }];
    const hexes = workerHexes(game, seat).map(w => w.hex);
    if (key === 'upgrade') {
        Object.keys(TOP_UPGRADES).filter(k => !p.upgrades.top.includes(k)).forEach(top => {
            [0, 1, 2, 3].forEach(bottom => {
                if (game.bottomCost(seat, bottom) > MATS[p.mat].bottom[bottom].min) list.push({ type: 'upgrade', top, bottom });
            });
        });
    } else if (key === 'deploy') {
        p.mechs.forEach((on, mech) => { if (!on) hexes.forEach(hex => list.push({ type: 'deploy', mech, hex })); });
    } else if (key === 'build') {
        Object.keys(STRUCTURES).filter(s => !p.built.includes(s)).forEach(structure => {
            hexes.filter(h => h !== MAP.factory && !structureAt(game, h)).forEach(hex => list.push({ type: 'build', structure, hex }));
        });
    } else if (key === 'enlist') {
        p.recruits.forEach((on, recruit) => {
            if (!on) Object.keys(ONE_TIME).filter(b => !p.oneTime.includes(b)).forEach(bonus => list.push({ type: 'enlist', recruit, bonus }));
        });
    }
    return list;
}

// 募集の常時の恩恵は、選んだ下段がよく使われるほどよい（両隣の分も入る）
function recruitBonus(game, seat, command) {
    if (command.type !== 'enlist') return 0;
    return [1.2, 1, 0.8, 0.6][command.recruit];
}

function bestBottom(game, seat, prof) {
    let best = null;
    for (const command of bottomCandidates(game, seat)) {
        const g = apply(game, seat, [command]);
        if (!g) continue;
        const value = finalValue(g, seat) + recruitBonus(game, seat, command);
        if (!best || value > best.value) best = { command, value };
    }
    return best;
}

// 終わっていれば、勝ち負けを大きく数える
// 負けで終わる手は避けるが、手番が長引くほど受け入れる（負けている側が終わらせずに、いつまでも続くのを防ぐ）
function finalValue(g, seat) {
    if (g.isOver()) {
        const results = g.results();
        const mine = results.find(r => r.seat === seat).total;
        const others = Math.max(...results.filter(r => r.seat !== seat).map(r => r.total));
        if (mine >= others) return 1000 + (mine - others) * 5;
        const turns = g.turnCount / g.players.length;
        return evaluate(g, seat) - (others - mine) * 0.5 + Math.max(0, turns - 30) * 4;
    }
    return evaluate(g, seat);
}

// 区画を選んだ状態から、上段と下段の組み合わせを試す
function planSection(game, seat, prof) {
    const tops = topCandidates(game, seat, prof).map(t => {
        const g = apply(game, seat, [t.command]);
        if (!g) return null;
        let value;
        if (g.step === 'bottom' || g.step === 'choose' || g.isOver()) value = finalValue(g, seat);
        else value = (t.extra ?? evaluate(g, seat)) + 0; // 戦闘・遭遇の途中（移動の見積もりを使う）
        return { ...t, g, value };
    }).filter(Boolean).sort((a, b) => b.value - a.value);
    let best = null;
    tops.slice(0, prof.lookahead).forEach(t => {
        let value = t.value;
        if (t.g.step === 'bottom') {
            const b = bestBottom(t.g, seat, prof);
            if (b) value = b.value;
        } else if (t.g.step !== 'choose' && !t.g.isOver()) {
            // 戦闘などの後に下段がある。今の状態で下段を見積もる
            const g2 = apply(game, seat, [{ type: 'skip' }]);
            const b = g2 && bestBottom(g2, seat, prof);
            if (b) value += Math.max(0, b.value - evaluate(g2, seat));
        }
        if (!best || value > best.value) best = { top: t.command, value };
    });
    return best;
}

function chooseSection(game, seat, prof) {
    const p = game.players[seat];
    let best = null;
    for (let index = 0; index <= 4; index++) {
        const g = apply(game, seat, [{ type: 'section', index }]);
        if (!g) continue;
        const plan = planSection(g, seat, prof);
        if (!plan) continue;
        const value = plan.value + jitter(game, seat, index) * prof.noise;
        if (!best || value > best.value) best = { index, value };
    }
    void p;
    return best ? { type: 'section', index: best.index } : null;
}

// ---- 戦闘・遭遇・工場 ----

function combatChoice(game, seat, prof) {
    const { hex, attacker, defender } = game.combat;
    const P = game.players[seat];
    const foe = seat === attacker ? defender : attacker;
    const allow = game.cardAllowance(seat, hex);
    const maxDial = Math.min(7, P.power);
    if (prof.name === 'easy') {
        const cards = topCards(P.cards, allow);
        const power = Math.round(maxDial * (0.5 + 0.5 * Math.abs(jitter(game, seat, 7))));
        return { type: 'combat', power, cards };
    }
    const theirs = Math.ceil(foeEstimate(game, foe, hex));
    const need = theirs + (seat === defender ? 1 : 0);
    const cards = topCards(P.cards, allow);
    const sum = cards.reduce((a, b) => a + b, 0);
    if (maxDial + sum >= need) return { type: 'combat', power: Math.max(0, Math.min(maxDial, need - sum)), cards };
    // 勝てそうにないときは、力とカードを温存する（力を1使って、負けたときのカードをもらう）
    if (maxDial + sum >= need - 3) return { type: 'combat', power: maxDial, cards };
    return { type: 'combat', power: Math.min(1, maxDial), cards: [] };
}

function encounterChoice(game, seat) {
    const max = game.players[seat].faction === 'polania' ? 2 : 1;
    const options = [[0], [1], [2]];
    if (max === 2) options.push([0, 1], [0, 2], [1, 2]);
    let best = null;
    options.forEach(o => {
        const g = apply(game, seat, [{ type: 'encounter', options: o }]);
        if (!g) return;
        const value = finalValue(g, seat);
        if (!best || value > best.value) best = { o, value };
    });
    void ENCOUNTER_CARDS;
    return { type: 'encounter', options: best ? best.o : [0] };
}

function factoryChoice(game, seat) {
    let best = null;
    game.factoryOffer.forEach(card => {
        const c = FACTORY_CARDS[card];
        const value = Object.values(c.gain).reduce((a, b) => a + b, 0) - Object.values(c.cost).reduce((a, b) => a + b, 0) * 0.8;
        if (!best || value > best.value) best = { card, value };
    });
    return { type: 'factory', card: best.card };
}

// ---- 1手 ----

export function decide(game, seat, prof = PROFILES.normal) {
    switch (game.step) {
        case 'choose': return chooseSection(game, seat, prof);
        case 'top': return planSection(game, seat, prof)?.top ?? { type: 'skip' };
        case 'bottom': {
            if (game.section === 4) {
                const plan = planMove(game, seat, 1, 2, prof);
                const g = apply(game, seat, [{ type: 'skip' }]);
                if (plan.moves.length > 0 && g && plan.value > evaluate(g, seat) + 0.3) return { type: 'factoryMove', moves: plan.moves };
                return { type: 'skip' };
            }
            return bestBottom(game, seat, prof)?.command ?? { type: 'skip' };
        }
        case 'combat': return combatChoice(game, seat, prof);
        case 'encounter': return encounterChoice(game, seat);
        case 'factory': return factoryChoice(game, seat);
        default: return null;
    }
}

// 1手進める。進めたら true。決めた手が断られたら、いちばん単純な手で抜ける
export function runCpuStep(game, seat, prof = PROFILES.normal) {
    const command = decide(game, seat, prof);
    if (command && game.applyCommand(seat, command)) return true;
    const fallbacks = {
        choose: [0, 1, 2, 3, 4].map(index => ({ type: 'section', index })),
        top: [{ type: 'skip' }],
        bottom: [{ type: 'skip' }],
        combat: [{ type: 'combat', power: 0, cards: [] }],
        encounter: [{ type: 'encounter', options: [0] }],
        factory: (game.factoryOffer ?? []).map(card => ({ type: 'factory', card }))
    }[game.step] ?? [];
    return fallbacks.some(c => game.applyCommand(seat, c));
}

export { scoreOf as cpuScore, territoryCount, controlledHexes };
