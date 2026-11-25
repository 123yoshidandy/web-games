/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（公開された情報と、自分の個人の目標）だけを見て決める。袋から次に出るダイスや、ほかの人の個人の目標はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：窓の良さを点にし（埋まったマス、個人の目標、公共の目標、空きマスに置ける色と目の数）、置いたあとの点が一番高い手を選ぶ
 *   - 置ける場所を残す：空きマスごとに、置ける（色・目）の組の数を数え、0になるマスは大きく減点する
 *   - 目標に寄せる：行・列の目標は、まだ重なりのない行・列を埋まり具合で見込み、組の目標は今の組の数で数える
 *   - 置けないときや、点が十分に上がるときは、やっとこ・砥石・コルクの定規を使う（ほかの道具は使わない）
 *   - 1人用は、取ったダイスと道具の払いに使ったダイスの目だけ目標の点が下がるので、その分を足して比べる
 * やさしい：置けるところから、点の見積もりに大きな迷いを足して選ぶ。道具は使わない
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { COLORS, CELLS, PATTERNS, TOOLS, OBJECTIVES } from './data.js';
import { canPlace, legalCells, orthogonal, matchesCell, objectiveScore, privateScore } from './rules.js';

export const CPU_LEVELS = ['easy', 'normal'];
const CPU_TOOLS = ['grozing', 'grinding', 'cork'];

const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

const ROW_LINES = Array.from({ length: 4 }, (_, r) => Array.from({ length: 5 }, (_, c) => r * 5 + c));
const COL_LINES = Array.from({ length: 5 }, (_, c) => Array.from({ length: 4 }, (_, r) => r * 5 + c));

// 空きマス i に置ける（色・目）の組の数（すでにあるダイスとの縦横の決まりと、マスの制約だけを見る）
function options(window, pattern, i) {
    let n = 0;
    const near = orthogonal(i).map(j => window[j]).filter(Boolean);
    for (const color of COLORS) {
        if (near.some(d => d.color === color)) continue;
        for (let value = 1; value <= 6; value++) {
            if (near.some(d => d.value === value)) continue;
            if (matchesCell(pattern, i, { color, value })) n++;
        }
    }
    return n;
}

// 行・列の目標の見込み：まだ重なりがなければ、埋まり具合の2乗で割り引く
function linePotential(window, lines, key, points) {
    let total = 0;
    for (const cells of lines) {
        const dice = cells.map(i => window[i]).filter(Boolean);
        if (new Set(dice.map(d => d[key])).size !== dice.length) continue;
        const ratio = dice.length / cells.length;
        total += points * (ratio === 1 ? 1 : ratio * ratio * 0.75);
    }
    return total;
}

// 窓の良さ（大きいほどよい）
export function evaluate(window, pattern, { objectives, privates }) {
    let score = 0;
    const filled = window.filter(Boolean).length;
    score += filled * 1.0;
    score += Math.max(...privates.map(c => privateScore(window, c))) * 0.9;
    for (const id of objectives) {
        const points = OBJECTIVES[id].points;
        if (id === 'rowColor') score += linePotential(window, ROW_LINES, 'color', points);
        else if (id === 'colColor') score += linePotential(window, COL_LINES, 'color', points);
        else if (id === 'rowShade') score += linePotential(window, ROW_LINES, 'value', points);
        else if (id === 'colShade') score += linePotential(window, COL_LINES, 'value', points);
        else score += objectiveScore(window, id) * 0.9;
    }
    // 置ける場所を残す
    for (let i = 0; i < CELLS; i++) {
        if (window[i]) continue;
        const n = options(window, pattern, i);
        if (n === 0) score -= 2.2;
        else if (n <= 2) score -= 0.6;
        else if (n <= 5) score -= 0.2;
    }
    return score;
}

const placed = (window, cell, die) => {
    const next = [...window];
    next[cell] = die;
    return next;
};

// 置ける手を全部挙げ、良さを付ける
function draftOptions(view, me, pattern, context) {
    const list = [];
    for (const die of view.pool) {
        for (const cell of legalCells(me.window, pattern, die)) {
            // 1人用は、プールに残ったダイスの目が目標の点になるので、取ったダイスの目だけ目標が下がる
            const solo = view.solo ? die.value : 0;
            list.push({ command: { type: 'draft', die: die.id, cell }, value: evaluate(placed(me.window, cell, die), pattern, context) + solo });
        }
    }
    return list;
}

// 道具（やっとこ・砥石・コルクの定規）を使う手
function toolOptions(view, me, pattern, context) {
    const list = [];
    if (view.turn.toolUsed || view.turn.drafted) return list;
    for (const tool of view.tools) {
        if (!CPU_TOOLS.includes(tool.id)) continue;
        for (const die of view.pool) {
            // 払い：1人用はプールの同じ色のダイス（選ぶダイスとは別）、ほかは好意トークン
            let pay = null;
            let cost;
            if (view.solo) {
                if (tool.used) continue;
                pay = view.pool.find(d => d.color === TOOLS[tool.id].color && d.id !== die.id);
                if (!pay) continue;
                // 払ったダイスはラウンドトラックに行かないので、その目だけ目標の点が下がる
                cost = -pay.value;
            } else {
                if (me.tokens < tool.cost) continue;
                cost = tool.cost;
            }
            const variants = [];
            if (tool.id === 'grozing') [-1, 1].forEach(delta => { if (die.value + delta >= 1 && die.value + delta <= 6) variants.push({ changed: { ...die, value: die.value + delta }, extra: { delta } }); });
            if (tool.id === 'grinding') variants.push({ changed: { ...die, value: 7 - die.value }, extra: {} });
            if (tool.id === 'cork') variants.push({ changed: die, extra: {}, alone: true });
            for (const v of variants) {
                const cells = v.alone ? legalCells(me.window, pattern, v.changed, { alone: true }) : legalCells(me.window, pattern, v.changed);
                for (const cell of cells) {
                    const command = { type: 'tool', tool: tool.id, die: die.id, cell, ...v.extra };
                    if (pay) command.pay = pay.id;
                    list.push({ command, value: evaluate(placed(me.window, cell, v.changed), pattern, context) - cost });
                }
            }
        }
    }
    return list;
}

// ---- 手を選ぶ ----

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    if (!view.actors.includes(seat)) return null;
    const rand = cpuRandom(game, seat);
    const me = view.players[seat];
    if (view.phase === 'choose') return { type: 'choose', pattern: choosePattern(me, level, rand) };
    const pattern = PATTERNS[me.pattern];
    const context = { objectives: view.objectives, privates: me.privates };
    const pending = view.pending;
    if (pending?.kind === 'fluxValue') {
        // 置いたときの良さが一番高い目
        let best = { value: 1, v: -Infinity };
        for (let value = 1; value <= 6; value++) {
            const die = { id: pending.die, color: pending.color, value };
            for (const cell of legalCells(me.window, pattern, die)) {
                const v = evaluate(placed(me.window, cell, die), pattern, context);
                if (v > best.v) best = { value, v };
            }
        }
        return { type: 'fluxValue', value: best.value };
    }
    if (pending?.kind === 'place') {
        const die = view.pool.find(d => d.id === pending.die);
        const cells = legalCells(me.window, pattern, die);
        if (!cells.length) return { type: 'place', cell: null };
        const best = cells.map(cell => ({ cell, v: evaluate(placed(me.window, cell, die), pattern, context) })).sort((a, b) => b.v - a.v)[0];
        return { type: 'place', cell: best.cell };
    }
    if (view.turn.drafted) return { type: 'end' };
    const drafts = draftOptions(view, me, pattern, context);
    if (level === 'easy') {
        if (!drafts.length) return { type: 'end' };
        return drafts.map(o => ({ ...o, v: o.value + rand() * 12 })).sort((a, b) => b.v - a.v)[0].command;
    }
    const tools = toolOptions(view, me, pattern, context);
    const bestDraft = drafts.sort((a, b) => b.value - a.value)[0] ?? null;
    const bestTool = tools.sort((a, b) => b.value - a.value)[0] ?? null;
    // 道具は、置けないときか、置くより十分に良いときだけ
    if (bestTool && (!bestDraft || bestTool.value > bestDraft.value + 1.2)) return bestTool.command;
    if (bestDraft) return bestDraft.command;
    return { type: 'end' };
}

// 窓：個人の目標の色のマスが多く、難しすぎないもの（やさしいは、配られた中から気まぐれに）
function choosePattern(me, level, rand) {
    if (level === 'easy') return me.offers[Math.floor(rand() * me.offers.length)];
    const score = (id) => {
        const p = PATTERNS[id];
        const mine = p.cells.filter(c => c && c.color && me.privates.includes(c.color)).length;
        return p.difficulty * 0.6 + mine * 0.8 - (p.difficulty >= 6 ? 1 : 0) + rand() * 0.2;
    };
    return [...me.offers].sort((a, b) => score(b) - score(a))[0];
}

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 待っている CPU に1手打たせる。思わぬ形なら、いちばん単純な答えで進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    let command = null;
    try {
        command = chooseCommand(game, seat, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = simplestCommand(game, seat);
    return fallback && game.applyCommand(seat, fallback) ? fallback : null;
}

// いちばん単純な答え（窓は1枚目、置くのは最初に置ける場所、目は1、ほかは番を終える）
export function simplestCommand(game, seat) {
    if (game.phase === 'choose') return { type: 'choose', pattern: game.players[seat].offers[0] };
    const pending = game.pending;
    const p = game.players[seat];
    const pattern = PATTERNS[p.pattern];
    if (pending?.kind === 'fluxValue') return { type: 'fluxValue', value: 1 };
    if (pending?.kind === 'place') {
        const die = game.pool.find(d => d.id === pending.die);
        return { type: 'place', cell: legalCells(p.window, pattern, die)[0] ?? null };
    }
    if (!game.turn.drafted) {
        for (const die of game.pool) {
            const cell = legalCells(p.window, pattern, die)[0];
            if (cell !== undefined && canPlace(p.window, pattern, cell, die)) return { type: 'draft', die: die.id, cell };
        }
    }
    return { type: 'end' };
}
