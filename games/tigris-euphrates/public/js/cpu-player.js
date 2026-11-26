/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビュー（自分の手札と点・盤・ほかの人の手札の枚数）だけを見て決める。ほかの人の手札・点や袋の並びはのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう
 * - 手を1つずつビューの写し（sim.js）で試し、試したあとの局面の値がいちばん高い手を選ぶ
 * - 局面の値：自分の点を低い順に並べ、低い色ほど重く数える（宝物は、いちばん低い色に足す）。いちばん低い色を伸ばす手ほどよい
 *   盤の指導者は、王国の大きさと、守りの強さ（となりの神殿・同じ色のタイル）に応じて足す。ほかの人に点が入る手は引く
 * - 争い：相手が手札に持つその色の枚数を、見えていないタイルの色の割合から二項分布で見積もり、勝つ見込みを出す
 *   仕掛ける手は、勝ったときと負けたときの局面の値を、見込みで重み付けして比べる。見込みが低ければ仕掛けない
 *   攻めるときは、見込みが十分になる最小の枚数を出す。守るときは、同点にできるなら必要な分だけ出す
 * やさしい：点の入る手を半分の確率で選び、あとはでたらめ。争いで出す枚数もでたらめ
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { COLORS, BAG_COUNTS, HAND_SIZE } from './data.js';
import { NEIGHBORS, START_TEMPLES } from './board.js';
import { finalValues } from './game.js';
import { simFromView, cloneSim, tileCells, leaderCells } from './sim.js';

export const CPU_LEVELS = ['easy', 'normal'];
const WEIGHTS = [10, 4, 1.6, 0.6]; // 低い色から順の重み
const OTHER_POINT = 2.5;           // ほかの人に1点入るときの値
const ATTACK_SURE = 0.8;           // 攻めるとき、この見込みに届く最小の枚数を出す
const ATTACK_MIN = 0.45;           // 全部出してもこの見込みに届かなければ出さない

// ---- 局面の値 ----

function valueOf(sim, me) {
    const p = sim.players[me];
    const values = finalValues(p.scores, p.treasures);
    let v = values.reduce((s, x, i) => s + x * WEIGHTS[i], 0);
    // ほかの人の点（先読みの中で増えた分）
    sim.players.forEach(q => {
        if (q.id !== me) v -= OTHER_POINT * COLORS.reduce((s, c) => s + q.scores[c], 0);
    });
    // 盤の指導者の見込み
    COLORS.forEach(color => {
        const cell = p.leaders[color];
        if (cell === null) return;
        const cells = sim.region(cell);
        const tiles = cells.filter(c => sim.board[c]?.kind === 'tile');
        const same = tiles.filter(c => sim.board[c].color === color).length;
        v += 3 + 0.35 * Math.min(10, color === 'black' ? tiles.length * 0.5 : same) + 0.6 * Math.min(3, sim.templesAround(cell));
        // 宝物が2つ以上あって商人がいない王国に入れる商人は、宝物を取りに行ける
        if (color === 'green') v += 0.8 * Math.max(0, sim.treasures.filter(t => cells.includes(t)).length - 1);
    });
    // 手札の赤は内乱の守りに使える
    v += 0.25 * Math.min(4, p.hand.filter(c => c === 'red').length);
    v += 1.5 * p.catastrophes;
    return v;
}

// 見えていないタイルの中の、色の割合
function unseenShare(view, color) {
    const onBoard = Object.fromEntries(COLORS.map(c => [c, 0]));
    view.board.forEach((x, cell) => { if (x?.kind === 'tile' && !START_TEMPLES.includes(cell)) onBoard[x.color] += 1; });
    const mine = view.players[view.you].hand;
    const left = (c) => Math.max(0, BAG_COUNTS[c] - onBoard[c] - mine.filter(x => x === c).length);
    const total = COLORS.reduce((s, c) => s + left(c), 0);
    return total ? left(color) / total : 0.25;
}

// 相手の手札（n 枚）のうち、その色が k 枚未満である見込み
function chanceBelow(n, share, k) {
    if (k <= 0) return 0;
    let sum = 0;
    let comb = 1;
    for (let i = 0; i <= n && i < k; i++) {
        if (i > 0) comb = comb * (n - i + 1) / i;
        sum += comb * share ** i * (1 - share) ** (n - i);
    }
    return Math.min(1, sum);
}

// 攻める側が count 枚出したときに勝つ見込み（守る側は、持っていれば同点まで出す）
function attackChance(view, conflict, count) {
    const { attacker, defender, color } = conflict;
    const n = view.players[defender.seat].handCount;
    const margin = attacker.base + count - defender.base; // 守る側がこれ以上出せば負け
    return chanceBelow(n, unseenShare(view, color), margin);
}

// 攻めるときに出す枚数
function attackCount(view, conflict, have) {
    for (let k = 0; k <= have; k++) {
        if (attackChance(view, conflict, k) >= ATTACK_SURE) return k;
    }
    return attackChance(view, conflict, have) >= ATTACK_MIN ? have : 0;
}

// ---- 先読み ----

// 争い・順番・記念碑の選択を、見込みで進めた値（me から見た）
function settle(sim, me, view, depth = 0) {
    for (let guard = 0; guard < 20; guard++) {
        if (sim.phase === 'monument') {
            const id = bestMonument(sim, me);
            sim.applyCommand(sim.current, id === null ? { type: 'skip' } : { type: 'monument', cell: sim.monumentChoice.squares[0], monument: id });
            continue;
        }
        if (sim.phase === 'warOrder') {
            sim.applyCommand(sim.current, { type: 'war', color: sim.war.pending[0].color });
            continue;
        }
        if (sim.phase !== 'support') break;
        const c = sim.conflict;
        if (c.attacker.commit === null) {
            if (c.attacker.seat === me) {
                const have = sim.players[me].hand.filter(x => x === c.color).length;
                const count = attackCount(view, c, have);
                const chance = attackChance(view, c, count);
                sim.applyCommand(me, { type: 'support', count });
                if (depth > 0) {
                    // 2つ目からの争いは、見込みの高いほうの結果だけを見る
                    forceOutcome(sim, chance >= 0.5);
                    continue;
                }
                const win = cloneSim(sim);
                forceOutcome(win, true);
                const lose = sim;
                forceOutcome(lose, false);
                return chance * settle(win, me, view, depth + 1) + (1 - chance) * settle(lose, me, view, depth + 1);
            }
            // ほかの人が攻める側（手札は見えない）：出さずに進める
            sim.conflict.attacker.commit = 0;
            continue;
        }
        // 守る側：同点にするのに必要な分を出せれば勝ち。見えない手札は、守る側が勝つと見る
        const need = Math.max(0, c.attacker.base + c.attacker.commit - c.defender.base);
        const have = sim.players[c.defender.seat].hand.filter(x => x === c.color).length;
        if (c.defender.seat === me) sim.applyCommand(me, { type: 'support', count: need <= have ? need : 0 });
        else forceOutcome(sim, false);
    }
    return valueOf(sim, me);
}

// 先読みの中で、攻める側が勝つか負けるかを決めて争いを終える
function forceOutcome(sim, attackerWins) {
    const c = sim.conflict;
    if (c.attacker.commit === null) c.attacker.commit = 0;
    const a = c.attacker.base + c.attacker.commit;
    c.defender.base = attackerWins ? Math.min(c.defender.base, a - 1) : Math.max(c.defender.base, a);
    c.defender.commit = 0;
    sim.resolveConflict();
}

function bestMonument(sim, me) {
    const choice = sim.monumentChoice;
    const p = sim.players[me];
    let best = null;
    sim.monuments.forEach((m, id) => {
        if (m.cell !== null || !m.colors.includes(choice.color)) return;
        const other = m.colors.find(c => c !== choice.color);
        // 自分の指導者の色で、自分の低い色ほどよい
        const score = (p.leaders[other] !== null ? 2 : 0) + 1 / (1 + p.scores[other]);
        if (!best || score > best.score) best = { id, score };
    });
    return best?.id ?? null;
}

// 試す手の一覧
function candidates(view, sim, level) {
    const me = view.you;
    const p = view.players[me];
    const out = [];
    const colors = [...new Set(p.hand)];
    // タイル：点の入りそうな、すでにあるものに接したマスだけを試す（離れたマスは、王国につながらないので点がない）
    const near = (cell) => NEIGHBORS[cell].some(nb => view.board[nb] && view.board[nb].kind !== 'cat');
    colors.forEach(color => tileCells(sim, me, color).forEach(cell => {
        if (level === 'easy' || near(cell)) out.push({ type: 'tile', color, cell });
    }));
    COLORS.forEach(color => {
        const from = p.leaders[color];
        leaderCells(sim, me, color).forEach(cell => out.push({ type: 'leader', color, cell, moving: from !== null }));
    });
    return out;
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
    const me = view.you;
    if (view.phase === 'end' || !view.answering.includes(me)) return null;
    const p = view.players[me];
    if (view.phase === 'support') return { type: 'support', count: supportCount(view, level, rand) };
    if (view.phase === 'warOrder') {
        const pending = view.war.pending;
        return { type: 'war', color: pending[Math.floor(rand() * pending.length)].color };
    }
    if (view.phase === 'monument') {
        const sim = simFromView(view);
        const id = level === 'easy' && rand() < 0.3 ? null : bestMonument(sim, me);
        return id === null ? { type: 'skip' } : { type: 'monument', cell: view.monumentChoice.squares[0], monument: id };
    }
    const sim = simFromView(view);
    const moves = candidates(view, sim, level);
    if (level === 'easy') return chooseEasy(view, sim, moves, rand);
    const base = valueOf(sim, me);
    let best = null;
    for (const move of moves) {
        const s = cloneSim(sim);
        const { moving, ...command } = move;
        if (!s.applyCommand(me, command)) continue;
        let v = settle(s, me, view) - base;
        if (moving) v -= 1.2; // 動かすのは、置くより得が少ないことが多い
        v += rand() * 0.3;
        if (!best || v > best.v) best = { command, v };
    }
    // 得のある手がなければ、使わない色を取り替える
    if ((!best || best.v < 0.5) && view.bagCount >= HAND_SIZE) {
        const useless = p.hand.filter(c => c !== 'red' && p.leaders[c] === null && p.leaders.black === null);
        if (useless.length >= 3) return { type: 'swap', tiles: useless };
    }
    if (best) return best.command;
    return fallback(view, sim);
}

function chooseEasy(view, sim, moves, rand) {
    const me = view.you;
    if (!moves.length) return fallback(view, sim);
    if (rand() < 0.5) {
        const scoring = moves.filter(m => {
            const s = cloneSim(sim);
            const { moving, ...command } = m;
            const before = COLORS.reduce((t, c) => t + s.players[me].scores[c], 0);
            if (!s.applyCommand(me, command)) return false;
            return COLORS.reduce((t, c) => t + s.players[me].scores[c], 0) > before;
        });
        if (scoring.length) {
            const { moving, ...command } = scoring[Math.floor(rand() * scoring.length)];
            return command;
        }
    }
    // 指導者は盤にいない人だけ置く（でたらめに動かし続けないように）
    const pool = moves.filter(m => m.type === 'tile' || !m.moving);
    const { moving, ...command } = pool[Math.floor(rand() * pool.length)] ?? moves[0];
    return command;
}

function supportCount(view, level, rand) {
    const c = view.conflict;
    const me = view.you;
    const have = view.players[me].hand.filter(x => x === c.color).length;
    if (level === 'easy') return Math.floor(rand() * (have + 1));
    if (c.attacker.seat === me && c.attacker.commit === null) return attackCount(view, c, have);
    const need = Math.max(0, c.attacker.base + c.attacker.commit - c.defender.base);
    return need <= have ? need : 0;
}

// いちばん単純な手：置けるタイル、なければ見送る
function fallback(view, sim) {
    const me = view.you;
    for (const color of new Set(view.players[me].hand)) {
        const [cell] = tileCells(sim, me, color);
        if (cell !== undefined) return { type: 'tile', color, cell };
    }
    return { type: 'pass' };
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
    const simple = {
        support: { type: 'support', count: 0 },
        warOrder: { type: 'war', color: game.war?.pending[0]?.color },
        monument: { type: 'skip' },
        action: fallback(view, simFromView(view))
    }[game.phase];
    if (simple && game.applyCommand(seat, simple)) return simple;
    const pass = { type: 'pass' };
    return game.phase === 'action' && game.applyCommand(seat, pass) ? pass : null;
}
