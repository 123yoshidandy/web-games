/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビュー（氷・ペンギン・取った魚。どれも全員に見えている）だけを見て決める
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * 形勢の見積もり（evaluate）：その人の値 ＝ 取った魚 ＋ 足もとの氷 ＋ 届く氷 ＋ 動けるペンギン
 * - 届く氷：各人のペンギンから、氷のとなりをたどる歩数（ほかのペンギンは通れない）を数え、いちばん近い人のものとみる
 *   ほかの人が1人も届かない氷（自分で囲った領域）は満額、競う氷は近さで割り引き、同じ近さなら分ける
 * - 動けるペンギンが多いほどよく、閉じ込められたペンギンは損とみる
 * - 比べるのは「自分の値 − ほかの人の中でいちばん高い値」
 *
 * ふつう：先を読む。自分の手をすべて試し、見込みのよい手をいくつか選んで、ほかの人が順に一番よい手（その人の見積もりで）を返し、
 *        自分がもう1手打ったあとの形勢で決める。自分の領域を囲う手と、相手を閉じ込める手が、見積もりの差として選ばれる
 *        置くときは、置いた後の形勢がいちばんよいマスに置く
 * やさしい：置くのはでたらめ。動かすのは、半分は行き先の魚がいちばん多い手、半分はでたらめ
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { NEIGHBORS, slides } from './board.js';

export const CPU_LEVELS = ['easy', 'normal'];
const SHORTLIST = 5;        // 先を読む自分の手の数
const CONTEST_DECAY = 0.8;  // 競う氷を、歩数ごとに割り引く
const CONTEST_WEIGHT = 0.6; // 競う氷の重み

// ---- 写し（ビューから作る、軽い状態） ----

function fromView(view) {
    return {
        fish: [...view.fish],
        pens: view.penguins.map(p => ({ owner: p.owner, cell: p.cell })),
        got: view.players.map(p => p.fish),
        out: view.players.map(p => p.out),
        n: view.players.length,
        current: view.current
    };
}

const clone = (s) => ({ ...s, fish: [...s.fish], pens: s.pens.map(p => ({ ...p })), got: [...s.got], out: [...s.out] });

function occupiedSet(s) {
    const set = new Set();
    s.pens.forEach(p => { if (p.cell !== null) set.add(p.cell); });
    return set;
}

// その人の手（{ penguin, to }）
export function legalMoves(s, seat) {
    const occ = occupiedSet(s);
    const out = [];
    s.pens.forEach((p, i) => {
        if (p.owner !== seat || p.cell === null) return;
        slides(p.cell, c => s.fish[c] > 0, c => occ.has(c)).forEach(to => out.push({ penguin: i, to }));
    });
    return out;
}

// 手を打った写し。次の番の人まで進める（動けない人は抜ける）
function play(s, { penguin, to }) {
    const t = clone(s);
    const p = t.pens[penguin];
    t.got[p.owner] += t.fish[p.cell];
    t.fish[p.cell] = 0;
    p.cell = to;
    advance(t);
    return t;
}

function advance(t) {
    for (let k = 0; k < t.n; k++) {
        t.current = (t.current + 1) % t.n;
        if (t.out[t.current]) continue;
        if (legalMoves(t, t.current).length) return;
        // 抜ける：足もとの氷を取る
        t.pens.forEach(p => {
            if (p.owner !== t.current || p.cell === null) return;
            t.got[p.owner] += t.fish[p.cell];
            t.fish[p.cell] = 0;
            p.cell = null;
        });
        t.out[t.current] = true;
    }
}

// ---- 形勢 ----

// 各人の値
export function values(s) {
    const occ = occupiedSet(s);
    const INF = 99;
    // 各人の、氷ごとの歩数
    const dist = Array.from({ length: s.n }, () => new Array(s.fish.length).fill(INF));
    const value = [...s.got];
    for (let seat = 0; seat < s.n; seat++) {
        const d = dist[seat];
        const queue = [];
        s.pens.forEach(p => {
            if (p.owner === seat && p.cell !== null) {
                d[p.cell] = 0;
                queue.push(p.cell);
                value[seat] += s.fish[p.cell]; // 足もとの氷は、いずれ取れる
            }
        });
        for (let qi = 0; qi < queue.length; qi++) {
            const c = queue[qi];
            for (const nb of NEIGHBORS[c]) {
                if (nb < 0 || s.fish[nb] <= 0 || occ.has(nb) || d[nb] !== INF) continue;
                d[nb] = d[c] + 1;
                queue.push(nb);
            }
        }
    }
    for (let c = 0; c < s.fish.length; c++) {
        if (s.fish[c] <= 0 || occ.has(c)) continue;
        let best = INF;
        let owners = [];
        let reach = 0;
        for (let seat = 0; seat < s.n; seat++) {
            const d = dist[seat][c];
            if (d === INF) continue;
            reach++;
            if (d < best) {
                best = d;
                owners = [seat];
            } else if (d === best) {
                owners.push(seat);
            }
        }
        if (!owners.length) continue;
        const share = s.fish[c] / owners.length;
        const weight = reach === 1 ? 1 : CONTEST_WEIGHT * CONTEST_DECAY ** (best - 1);
        owners.forEach(seat => { value[seat] += share * weight; });
    }
    // 動けるペンギン（閉じ込められたペンギンは、その先の魚を取れない）
    for (let seat = 0; seat < s.n; seat++) {
        if (s.out[seat]) continue;
        s.pens.forEach(p => {
            if (p.owner !== seat || p.cell === null) return;
            const free = NEIGHBORS[p.cell].some(nb => nb >= 0 && s.fish[nb] > 0 && !occ.has(nb));
            value[seat] += free ? 1 : -1;
        });
    }
    return value;
}

// seat から見た形勢（自分 − ほかの人の最高）
export function evaluate(s, seat) {
    const v = values(s);
    let other = -Infinity;
    v.forEach((x, i) => { if (i !== seat && x > other) other = x; });
    return v[seat] - other;
}

// 1手だけ読んで、seat にとっていちばんよい手
function bestReply(s, seat) {
    let best = null;
    for (const m of legalMoves(s, seat)) {
        const score = evaluate(play(s, m), seat);
        if (!best || score > best.score) best = { move: m, score };
    }
    return best?.move ?? null;
}

// ---- 手を選ぶ（ビューだけを見る） ----

// rand を渡さないときの迷い。見えている局面から作るので、同じ局面なら同じ手を選ぶ
function viewRandom(view) {
    const s = JSON.stringify(view);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

export function chooseCommand(view, level = 'normal', rand = viewRandom(view)) {
    const seat = view.you;
    if (view.phase === 'place') {
        if (!view.placeable.length) return null;
        if (level === 'easy') return { type: 'place', cell: view.placeable[Math.floor(rand() * view.placeable.length)] };
        return { type: 'place', cell: choosePlace(view, rand) };
    }
    if (view.phase !== 'move') return null;
    const s = fromView(view);
    const moves = legalMoves(s, seat);
    if (!moves.length) return null;
    if (level === 'easy') {
        const m = rand() < 0.5
            ? moves.reduce((b, m2) => (s.fish[m2.to] > s.fish[b.to] ? m2 : b))
            : moves[Math.floor(rand() * moves.length)];
        return { type: 'move', penguin: m.penguin, to: m.to };
    }
    // greedy は、先を読む効き目を測るための比べる相手（1手だけ読む。画面からは選べない）
    if (level === 'greedy') return { type: 'move', ...bestReply(s, seat) };
    return { type: 'move', ...chooseMove(s, seat, moves, rand) };
}

function choosePlace(view, rand) {
    const s = fromView(view);
    const index = s.pens.findIndex(p => p.owner === view.you && p.cell === null);
    let best = null;
    for (const cell of view.placeable) {
        const t = clone(s);
        t.pens[index].cell = cell;
        // 置くときは、行ける先の多さも見る（まっすぐ動ける先の魚）
        const occ = occupiedSet(t);
        const reach = slides(cell, c => t.fish[c] > 0, c => occ.has(c)).reduce((sum, c) => sum + t.fish[c], 0);
        const score = evaluate(t, view.you) + reach * 0.15 + rand() * 0.3;
        if (!best || score > best.score) best = { cell, score };
    }
    return best.cell;
}

function chooseMove(s, seat, moves, rand) {
    // 1手目をすべて見積もり、よいものを残す
    const first = moves.map(m => ({ m, t: play(s, m) }))
        .map(x => ({ ...x, score: evaluate(x.t, seat) + rand() * 0.05 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, SHORTLIST);
    let best = null;
    for (const { m, t: start } of first) {
        // ほかの人が順に一番よい手を返し、自分の番まで進める
        let t = start;
        for (let k = 0; k < s.n && t.current !== seat && !t.out.every(Boolean); k++) {
            const reply = bestReply(t, t.current);
            if (!reply) break;
            t = play(t, reply);
        }
        // 自分がもう1手打ったあと
        let score;
        if (t.current === seat && !t.out[seat]) {
            const mine = bestReply(t, seat);
            score = evaluate(mine ? play(t, mine) : t, seat);
        } else {
            score = evaluate(t, seat);
        }
        if (!best || score > best.score) best = { m, score };
    }
    return best.m;
}

// CPU 用の乱数（ゲームの乱数とは別）
export const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 操作を待っている CPU に1手打たせる。思わぬ選択を求められたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, level ?? game.players[seat].cpuLevel ?? 'normal', cpuRandom(game, seat));
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = game.phase === 'place'
        ? { type: 'place', cell: game.placeable()[0] }
        : (() => {
            const i = game.movablePenguins(seat)[0];
            return { type: 'move', penguin: i, to: game.movesOf(i)[0] };
        })();
    return game.applyCommand(seat, fallback) ? fallback : null;
}

// ヒント：人が操作する番に、CPU（ふつう）が選ぶ手を返す。盤は全員に見えているので、隠す情報はない
// 状態は変えず、ゲームの乱数も使わない（CPU 用の別の乱数）ので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return chooseCommand(createGameView(game, seat), 'normal', cpuRandom(game, seat));
}
