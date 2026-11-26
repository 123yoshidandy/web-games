/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビュー（自分の手札・全員のキルト・市場・猫）だけを見て決める。袋の順とほかの人の手札はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：キルトの値（estimate）がいちばん上がる置き方・取り方を選ぶ
 * - 今の点：ボタン・虹のボタン・猫
 * - ボタンの見込み：まだボタンのない色のまとまり（3枚未満）で、まわりに空きがあるもの。(枚数/3)² × 3 × buttonHope
 * - 猫の見込み：まだ猫のいない模様のまとまりで、条件の枚数に届く空きがあるもの。(枚数/条件)² × 猫の点 × catHope
 * - 目標の見込み：色と模様のそれぞれで、まだ合わせられるなら、埋まった割合から見込みを出す（埋まって合えば確実）
 * - 置く：置いたあとの値に、手札に残す1枚の次の手番の伸びを keep 倍して足す
 * - 取る：市場の3枚それぞれについて、手札の1枚と合わせた2枚の「どちらを先に置くか」まで見て比べる
 * - 目標タイルは、点と合わせやすさ（EASE）を掛けた値の高い3枚を選ぶ
 * やさしい：半分はすぐ取れる点だけで選び、半分はでたらめ
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { TILES, GOALS, CATS, COLORS, BUTTON_POINTS, RAINBOW_POINTS } from './data.js';
import { OPEN_CELLS, NEIGHBORS, GOAL_CELLS, BORDER } from './board.js';
import { groupAt, patchAt, awardsFor, goalFeasible, catFits } from './scoring.js';

export const CPU_LEVELS = ['easy', 'normal'];
// 見込みの重み（scripts で比べて決めた。README を参照）
export const TUNING = { buttonHope: 0.55, catHope: 0.5, goalBase: 0.12, goalGrow: 0.9, rainbow: 0.5, keep: 0.8 };
const EASE = { aabbcd: 0.9, aaabbc: 0.8, aabbcc: 0.7, diff: 0.55, aaabbb: 0.55, aaaabb: 0.5 };

// ---- 盤の値 ----

const emptyAround = (quilt, cells) => {
    const out = new Set();
    cells.forEach(c => NEIGHBORS[c].forEach(n => {
        if (OPEN_CELLS.includes(n) && quilt[n] == null) out.add(n);
    }));
    return out.size;
};

// まとまりの一覧（key：'color' か 'pattern'）。縁を含む
function groupsOf(player, key) {
    const seen = new Set();
    const out = [];
    for (let cell = 0; cell < player.quilt.length; cell++) {
        if (seen.has(cell) || !patchAt(player.board, player.quilt, cell)) continue;
        const g = groupAt(player.board, player.quilt, cell, key);
        g.forEach(c => seen.add(c));
        out.push(g);
    }
    return out;
}

// キルトの値（今の点＋見込み）。player：{ board, quilt, goals, buttons, rainbow, cats }
export function estimate(player, cats) {
    let value = player.buttons.length * BUTTON_POINTS + (player.rainbow ? RAINBOW_POINTS : 0)
        + player.cats.reduce((s, c) => s + CATS[c.cat].points, 0);
    const filled = player.quilt.filter(x => x != null).length;
    const late = filled / OPEN_CELLS.length;
    // ボタンの見込み
    groupsOf(player, 'color').forEach(g => {
        if (g.length >= 3 || player.buttons.some(b => g.includes(b.cell)) || g.every(c => BORDER.includes(c))) return;
        if (emptyAround(player.quilt, g) >= 3 - g.length) value += BUTTON_POINTS * (g.length / 3) ** 2 * TUNING.buttonHope * (1 - late * 0.5);
    });
    if (!player.rainbow) {
        const kinds = new Set(player.buttons.map(b => b.color)).size;
        value += RAINBOW_POINTS * (kinds / COLORS.length) ** 2 * TUNING.rainbow;
    }
    // 猫の見込み
    groupsOf(player, 'pattern').forEach(g => {
        const pattern = patchAt(player.board, player.quilt, g[0]).pattern;
        const cat = cats.find(c => c.patterns.includes(pattern));
        if (!cat || player.cats.some(c => g.includes(c.cell)) || g.every(c => BORDER.includes(c))) return;
        const need = CATS[cat.id].size;
        if (catFits(cat.id, g)) return;
        if (emptyAround(player.quilt, g) >= Math.max(1, need - g.length)) {
            value += CATS[cat.id].points * Math.min(1, g.length / need) ** 2 * TUNING.catHope * (1 - late * 0.6);
        }
    });
    // 目標の見込み
    (player.goals ?? []).forEach((goalId, spot) => {
        const goal = GOALS[goalId];
        const around = NEIGHBORS[GOAL_CELLS[spot]].map(c => patchAt(player.board, player.quilt, c)).filter(Boolean);
        const done = around.length / 6;
        const chance = (key) => {
            if (!goalFeasible(around.map(p => p[key]), goal.counts)) return 0;
            return done === 1 ? 1 : TUNING.goalBase + TUNING.goalGrow * done ** 2;
        };
        const pc = chance('color');
        const pp = chance('pattern');
        value += pc * pp * goal.both + (pc * (1 - pp) + pp * (1 - pc)) * goal.one;
    });
    return value;
}

// 置いたあとの player（ボタンと猫の判定も行う）
export function afterPlace(player, cats, tileId, cell) {
    const next = { ...player, quilt: [...player.quilt], buttons: [...player.buttons], cats: [...player.cats] };
    next.quilt[cell] = tileId;
    const award = awardsFor(next, cats, cell);
    if (award.button) next.buttons.push({ color: award.button, cell });
    if (award.rainbow) next.rainbow = true;
    if (award.cat) next.cats.push({ cat: award.cat, cell });
    return next;
}

const openCells = (player) => OPEN_CELLS.filter(c => player.quilt[c] == null);

// いちばんよい置き場とその値
function bestCell(player, cats, tileId) {
    let best = null;
    openCells(player).forEach(cell => {
        const v = estimate(afterPlace(player, cats, tileId, cell), cats);
        if (!best || v > best.value) best = { cell, value: v };
    });
    return best;
}

// ---- 手を選ぶ ----

function chooseGoals(view, level, rand) {
    const offered = view.players[view.you].offered;
    const order = offered.map((g, i) => ({ i, v: level === 'easy' ? rand() : GOALS[g].one * EASE[g] + rand() * 0.01 }))
        .sort((a, b) => b.v - a.v);
    return { type: 'goals', pick: order.slice(0, 3).map(o => o.i) };
}

// rand を渡さないときの迷い。見えている局面から作るので、同じ局面なら同じ手を選ぶ
function viewRandom(view) {
    const s = JSON.stringify(view);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

// ヒント：自分が操作する番に、CPU（ふつう）が選ぶ操作。ビュー（自分に見えるもの）だけで決める
export function suggest(view) {
    return chooseCommand(view, 'normal');
}

export function chooseCommand(view, level = 'normal', rand = viewRandom(view)) {
    const seat = view.you;
    if (!view.answering.includes(seat)) return null;
    const me = view.players[seat];
    if (view.phase === 'goals') return chooseGoals(view, level, rand);
    const cats = view.cats;
    if (view.phase === 'place') {
        const cells = openCells(me);
        if (level === 'easy' && rand() < 0.5) {
            return { type: 'place', hand: Math.floor(rand() * me.hand.length), cell: cells[Math.floor(rand() * cells.length)] };
        }
        let best = null;
        me.hand.forEach((tileId, hand) => cells.forEach(cell => {
            const next = afterPlace(me, cats, tileId, cell);
            let v;
            if (level === 'easy') v = next.buttons.length * 3 + next.cats.length * 4 + rand();
            else {
                v = estimate(next, cats);
                // 手札に残す1枚の、次の手番の伸び
                const kept = me.hand[1 - hand];
                if (kept != null && TUNING.keep > 0 && cells.length > 1) {
                    const b = bestCell(next, cats, kept);
                    if (b) v += TUNING.keep * (b.value - v);
                }
                v += rand() * 0.01;
            }
            if (!best || v > best.value) best = { value: v, command: { type: 'place', hand, cell } };
        }));
        return best.command;
    }
    if (view.phase === 'take') {
        const choices = view.market.map((tileId, market) => ({ tileId, market })).filter(x => x.tileId != null);
        if (level === 'easy' || openCells(me).length === 0) return { type: 'take', market: choices[Math.floor(rand() * choices.length)].market };
        let best = null;
        const held = me.hand[0];
        choices.forEach(({ tileId, market }) => {
            // 次の手番：手札の2枚のどちらを置き、どちらを残すか
            let v = -Infinity;
            [[tileId, held], [held, tileId]].forEach(([first, second]) => {
                if (first == null) return;
                const b = bestCell(me, cats, first);
                if (!b) return;
                let value = b.value;
                if (second != null && TUNING.keep > 0) {
                    const after = afterPlace(me, cats, first, b.cell);
                    const c = bestCell(after, cats, second);
                    if (c) value += TUNING.keep * (c.value - b.value);
                }
                v = Math.max(v, value);
            });
            v += rand() * 0.01;
            if (!best || v > best.value) best = { value: v, market };
        });
        return { type: 'take', market: best.market };
    }
    return null;
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

// 操作を待っている CPU に1手打たせる。思わぬことで断られたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const view = createGameView(game, seat);
    let command = null;
    try {
        command = chooseCommand(view, level ?? game.players[seat].cpuLevel ?? 'normal', cpuRandom(game, seat));
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = game.phase === 'goals' ? { type: 'goals', pick: [0, 1, 2] }
        : game.phase === 'take' ? { type: 'take', market: game.market.findIndex(t => t != null) }
            : { type: 'place', hand: 0, cell: OPEN_CELLS.find(c => game.players[seat].quilt[c] == null) };
    return game.applyCommand(seat, fallback) ? fallback : null;
}

export { TILES };
