/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（ほかの人の役割・手札、山札、伏せたゴールの中身はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 *
 * 正体の推測：このラウンドの記録（道を置いた・壊した・直した・落盤）を順にたどり、各人に疑いの点数を付ける
 * - 道：道の先端からゴールまでの距離を縮めたら金鉱掘りらしい。行き止まりで延ばしたり遠ざけたりしたらお邪魔者らしい
 * - 壊す：疑わしい人を壊したら金鉱掘りらしい。信用できる人を壊したらお邪魔者らしい
 * - 直す：直した相手と同じ側らしい
 * - 落盤：進んでいる道を取り除いたらお邪魔者らしい。行き止まりを取り除いたら金鉱掘りらしい
 *
 * 金鉱掘り：金に近づく道を置く。金の場所が分からなければ地図を使う。疑わしい人を壊し、信用できる人を直す
 * お邪魔者：道がゴールから遠いうちは、金鉱掘りのふりをすることが多い。近づくほど、行き止まり・壊す・落盤で邪魔をする
 */

import { CARDS, GOAL_POSITIONS, DIRS, START_POS } from './cards.js';
import { key, parseKey, liveCells, cellEdges, placements } from './board.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { noise: 0.5, secondBest: 0.2, disguise: 0.7 },
    strong: { noise: 0.05, secondBest: 0, disguise: 0.5 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

const FAR = 20;                 // 道の先端がないときの距離
const NEAR = 4;                 // これより近いと、お邪魔者が本気で邪魔をする
const SUSPECT_LINE = 1.2;       // これより疑わしい人の道具を壊す
const TRUST_LINE = -0.6;        // これより信用できる人の道具を直す

export const isCpuTurn = (game) => game.phase !== 'end' && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// ---- 盤面の見積もり ----

// 目指すゴールの候補：地図で金と分かっていればそこだけ。そうでなければ、めくれていず石と分かっていないゴール
export function targetGoals(goals, knownGoals = {}) {
    const known = Object.entries(knownGoals).find(([, v]) => v === 'gold');
    if (known) return [Number(known[0])];
    const list = goals.map((g, i) => i).filter(i => !goals[i].revealed && knownGoals[i] !== 'stone');
    return list.length ? list : goals.map((g, i) => i).filter(i => !goals[i].revealed);
}

// 道の先端から、目指すゴールまでの距離（候補が複数なら平均）
export function frontierDistance(board, goals, targets) {
    const live = liveCells(board, goals);
    const ends = [];
    live.forEach(k => {
        const [x, y] = parseKey(k);
        const edges = cellEdges(board[k], goals);
        DIRS.forEach(([dx, dy], d) => { if (edges[d] && !board[key(x + dx, y + dy)]) ends.push([x + dx, y + dy]); });
    });
    if (targets.length === 0) return 0;
    const distances = targets.map(g => {
        const [gx, gy] = goals[g].pos;
        return ends.length ? Math.min(...ends.map(([x, y]) => Math.abs(x - gx) + Math.abs(y - gy))) : FAR;
    });
    return distances.reduce((s, v) => s + v, 0) / distances.length;
}

const withPath = (board, id, x, y, rotated) => ({ ...board, [key(x, y)]: { type: 'path', id, rotated } });
const without = (board, x, y) => {
    const copy = { ...board };
    delete copy[key(x, y)];
    return copy;
};

// ---- 正体の推測 ----

// このラウンドの記録をたどって、各人の疑いの点数を出す（大きいほどお邪魔者らしい）。自分は自分の役割で固定
export function suspicions(view) {
    const n = view.players.length;
    const score = Array(n).fill(0);
    const lastDeal = view.events.findLastIndex(e => e.type === 'deal');
    let board = { [key(...START_POS)]: { type: 'start' } };
    const goals = GOAL_POSITIONS.map(pos => ({ pos, revealed: false, rotated: false, card: 0 }));
    goals.forEach((g, i) => { board[key(...g.pos)] = { type: 'goal', goal: i }; });
    const clamp = (v) => Math.max(-2, Math.min(3, v));
    for (const event of view.events.slice(lastDeal + 1)) {
        const s = event.seat;
        if (event.type === 'path') {
            const targets = targetGoals(goals);
            const before = frontierDistance(board, goals, targets);
            board = withPath(board, event.card, event.x, event.y, event.rotated);
            const gain = before - frontierDistance(board, goals, targets);
            const dead = !CARDS[event.card].connected;
            score[s] = clamp(score[s] + (gain > 0 ? -0.5 * gain : 0.7 * -gain) + (dead ? 1 : 0));
        } else if (event.type === 'rockfall') {
            const removed = CARDS[event.removed];
            const targets = targetGoals(goals);
            const before = frontierDistance(board, goals, targets);
            board = without(board, event.x, event.y);
            const loss = frontierDistance(board, goals, targets) - before;
            score[s] = clamp(score[s] + (removed.connected ? 0.4 + 0.5 * Math.max(0, loss) : -0.8));
        } else if (event.type === 'reveal') {
            Object.assign(goals[event.goal], { revealed: true, rotated: event.rotated, card: event.card });
        } else if (event.type === 'break') {
            score[s] = clamp(score[s] + 0.8 - 0.6 * score[event.target]);
        } else if (event.type === 'repair' && event.target !== s) {
            score[s] = clamp(score[s] + 0.5 * score[event.target]);
        }
    }
    if (view.you !== null) score[view.you] = view.role === 'saboteur' ? 3 : -2;
    return score;
}

// ---- 手の候補 ----

// 人の席のおすすめの手（ヒント）。CPU（ふつう）と同じ判断を、その席のビューだけで出す。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.phase !== 'play' || seat !== game.current) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length });
    const random = cpuRandom(game, seat);
    const candidates = candidateActions(view, random, profile);
    if (profile.random) {
        // 出せるカードがなければ、捨てる手から選ぶ
        const playable = candidates.filter(c => !c.fallback);
        const pool = playable.length ? playable : candidates;
        return pool[Math.floor(random() * pool.length)].command;
    }
    candidates.forEach(c => { c.score += (Math.abs(c.score) + 1) * (random() * 2 - 1) * profile.noise; });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && random() < profile.secondBest) return candidates[1].command;
    return candidates[0].command;
}

// CPU に1手打たせる。決めた手が断られたら、手札の先頭を捨てる（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return game.players[seat].hand.some(card => game.applyCommand(seat, { type: 'discard', card }));
}

function candidateActions(view, random, profile) {
    const me = view.players[view.you];
    const saboteur = view.role === 'saboteur';
    const suspect = suspicions(view);
    const targets = targetGoals(view.goals, view.knownGoals);
    const distance = frontierDistance(view.board, view.goals, targets);
    const knowsGold = Object.values(view.knownGoals).includes('gold');
    // お邪魔者は、道が遠いうちはふりをする（このターンの気分）
    const disguised = saboteur && distance > NEAR && random() < profile.disguise;
    const list = [];

    view.hand.forEach(id => {
        const card = CARDS[id];
        // 捨てる（ほかに手がないとき用）。役に立たないカードほど捨てやすい
        list.push({ command: { type: 'discard', card: id }, score: -2 + discardValue(card, saboteur), fallback: true });

        if (card.kind === 'path' && me.broken.length === 0) {
            placements(view.board, view.goals, id).forEach(({ x, y, rotated }) => {
                const after = withPath(view.board, id, x, y, rotated);
                const gain = distance - frontierDistance(after, view.goals, targets);
                let score;
                if (!saboteur || disguised) {
                    // 金鉱掘り（とふりをするお邪魔者）：先端を縮める道。行き止まりは置かない
                    score = gain * 2 - (card.connected ? 0 : 3) + (disguised ? -Math.max(0, gain - 1) * 1.5 : 0);
                    if (!saboteur && reachesKnownGold(after, view, x, y)) score += 20;
                } else if (distance <= NEAR) {
                    // お邪魔者（ゴールが近い）：先端を延ばさない・ふさぐ道
                    score = -gain * 4 + (card.connected ? 0 : 3) - 1;
                } else {
                    // お邪魔者（まだ遠い）：目立たないよう、行き止まりは使わず、横に延ばすような道
                    score = 1 - Math.abs(gain + 0.3) * 1.5 - (card.connected ? 0 : 2.5);
                }
                list.push({ command: { type: 'path', card: id, x, y, rotated }, score });
            });
        }
        if (card.kind === 'map') {
            const unknown = view.goals.filter((g, i) => !g.revealed && !view.knownGoals[i]).length;
            if (unknown > 0 && !knowsGold) list.push({ command: { type: 'map', card: id, goal: pickGoalToMap(view, random) }, score: saboteur ? 1.5 : (distance <= 6 ? 4.5 : 3) });
        }
        if (card.kind === 'break') {
            const tool = card.tools[0];
            view.players.forEach(p => {
                if (p.id === view.you || p.broken.includes(tool)) return;
                let score;
                // お邪魔者は、ゴールが近づくまでは、すでに疑われている人だけを壊す（金鉱掘りらしく見える）
                if (saboteur) score = distance > NEAR + 1 || disguised ? (suspect[p.id] > SUSPECT_LINE ? 1.5 : -3) : 2.5 - suspect[p.id];
                else score = suspect[p.id] > SUSPECT_LINE ? 1.5 + suspect[p.id] : -3;
                list.push({ command: { type: 'break', card: id, target: p.id }, score });
            });
        }
        if (card.kind === 'repair') {
            card.tools.forEach(tool => {
                view.players.forEach(p => {
                    if (!p.broken.includes(tool)) return;
                    let score;
                    if (p.id === view.you) score = 5;
                    else if (saboteur) score = suspect[p.id] > SUSPECT_LINE ? 1.5 : -1;
                    else score = suspect[p.id] < TRUST_LINE ? 2.5 - suspect[p.id] : -1;
                    list.push({ command: { type: 'repair', card: id, target: p.id, tool }, score });
                });
            });
        }
        if (card.kind === 'rockfall') {
            Object.entries(view.board).forEach(([k, cell]) => {
                if (cell.type !== 'path') return;
                const [x, y] = parseKey(k);
                const after = without(view.board, x, y);
                const gain = distance - frontierDistance(after, view.goals, targets);
                const dead = !CARDS[cell.id].connected;
                let score;
                if (!saboteur || disguised) score = dead && gain > 0 ? 1 + gain * 2 : -4;
                else score = !dead && gain < 0 && distance <= NEAR + 1 ? -gain * 2.5 : -3;
                list.push({ command: { type: 'rockfall', card: id, x, y }, score });
            });
        }
    });
    return list;
}

// 捨てるときの値打ち（高いほど捨ててよい）
function discardValue(card, saboteur) {
    if (card.kind === 'path') return saboteur ? (card.connected ? 0.8 : 0) : (card.connected ? 0 : 1);
    if (card.kind === 'map') return 0.3;
    if (card.kind === 'rockfall') return 0.5;
    return 0.2;
}

// 道を置いた結果、地図で金と分かっているゴールに届くか
function reachesKnownGold(board, view, x, y) {
    const gold = Object.entries(view.knownGoals).find(([, v]) => v === 'gold');
    if (!gold) return false;
    const [gx, gy] = view.goals[Number(gold[0])].pos;
    if (Math.abs(gx - x) + Math.abs(gy - y) !== 1) return false;
    const live = liveCells(board, view.goals);
    if (!live.has(key(x, y))) return false;
    const d = DIRS.findIndex(([dx, dy]) => x + dx === gx && y + dy === gy);
    return cellEdges(board[key(x, y)], view.goals)[d];
}

// 地図で見るゴール：まだ分からないゴールから選ぶ
function pickGoalToMap(view, random) {
    const unknown = view.goals.map((g, i) => i).filter(i => !view.goals[i].revealed && !view.knownGoals[i]);
    return unknown[Math.floor(random() * unknown.length)];
}
