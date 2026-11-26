/**
 * CPU
 * - ふつう：置ける手をすべて調べ、「得点 − 相手にクワークルを作らせる危うさ ＋ 残る手札の良さ」が一番高い手を打つ
 *   よい手がなく手札が悪いときは、要らないタイル（重複・ほかと組めないもの）を交換する
 * - やさしい：得点に大きなゆらぎを足して選ぶ。守りは考えない。置けないときだけ交換する
 * - 見てよい情報だけを使う（盤・自分の手札・袋の枚数）。ほかの人の手札と袋の中身はのぞかない
 * - ゲームの乱数は使わない（記録の再現がずれないように）。ゆらぎは状態から作った別の乱数
 */

import { createRandom } from './random.js';
import { keyOf, lineThrough, kindOf, colorOf, shapeOf, END_BONUS, HAND_SIZE } from './board.js';

export const W = {
    danger5: 1,        // 5枚の列を残す（あと1枚でクワークル）：相手がその1枚を持っている見込み × 12点 に掛ける
    danger4: 0.3,      // 4枚の列を残す（あと2枚）：同じく
    duplicate: 1.2,    // 残る手札の、同じ種類の重複1組あたり
    pair: 0.35,        // 残る手札の、色か形の合うタイルの組1つあたり
    keepQwirkle: 3,    // 自分の手札で、5枚の列を次に完成できる見込み
    tradeBelow: 4,     // ふつう：一番よい手がこれ未満で、要らないタイルが多ければ交換する
    easyNoise: 12
};

export function isCpuTurn(game) {
    return !game.isOver() && game.players[game.current].isCPU;
}

export function runCpuStep(game, seat = game.current) {
    if (game.isOver() || seat !== game.current) return false;
    const command = decide(game, seat);
    if (command && game.applyCommand(seat, command)) return true;
    // 決めた手が通らなければ、いちばん単純な手で進める
    const fallbacks = [{ type: 'pass' }];
    if (game.bag.length) fallbacks.unshift({ type: 'trade', tiles: game.players[seat].hand.slice(0, Math.min(game.bag.length, HAND_SIZE)) });
    const move = game.movesFor(seat)[0];
    if (move) fallbacks.unshift({ type: 'play', placements: move.placements });
    return fallbacks.some(c => game.applyCommand(seat, c));
}

function seedOf(game, seat) {
    const text = `${game.options.seed}|${game.commands.length}|${seat}|${game.players[seat].hand.join(',')}`;
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

export function decide(game, seat) {
    const me = game.players[seat];
    const moves = game.movesFor(seat);
    if (!moves.length) {
        if (game.bag.length && !game.isFirstMove()) return { type: 'trade', tiles: tradePick(me.hand, game.bag.length, true) };
        return { type: 'pass' };
    }
    if (me.level === 'easy') {
        const random = createRandom(seedOf(game, seat));
        let best = moves[0];
        let bestValue = -Infinity;
        moves.forEach(m => {
            const v = m.score + random() * W.easyNoise;
            if (v > bestValue) {
                bestValue = v;
                best = m;
            }
        });
        return { type: 'play', placements: best.placements };
    }
    const seen = seenKinds(game, me.hand);
    let best = null;
    let bestValue = -Infinity;
    moves.forEach(m => {
        const v = moveValue(game, me, m, seen);
        if (v > bestValue) {
            bestValue = v;
            best = m;
        }
    });
    // よい手がなく、要らないタイルが多ければ交換する
    if (bestValue < W.tradeBelow && game.bag.length >= 3 && !game.isFirstMove()) {
        const junk = tradePick(me.hand, game.bag.length, false);
        if (junk.length >= 3) return { type: 'trade', tiles: junk };
    }
    return { type: 'play', placements: best.placements };
}

// 見えているタイルの種類ごとの枚数（盤と自分の手札。3枚とも見えていれば、その種類はもう出てこない）
function seenKinds(game, hand) {
    const seen = new Array(36).fill(0);
    game.board.forEach(t => { seen[kindOf(t)]++; });
    hand.forEach(t => { seen[kindOf(t)]++; });
    return seen;
}

export function moveValue(game, me, move, seen) {
    let v = move.score;
    const rest = [...me.hand];
    move.placements.forEach(p => rest.splice(rest.indexOf(p.tile), 1));
    if (!rest.length && game.bag.length === 0) v += END_BONUS;
    const others = game.players.filter(p => p.id !== me.id).reduce((sum, p) => sum + p.hand.length, 0);
    const unseen = 108 - game.board.size - me.hand.length;
    const next = new Map(game.board);
    move.placements.forEach(p => next.set(keyOf(p.x, p.y), p.tile));
    // 置いたタイルが入る列のうち、5枚・4枚の列は、相手にクワークルを作らせる危うさ
    const checked = new Set();
    move.placements.forEach(p => {
        [[1, 0], [0, 1]].forEach(([dx, dy]) => {
            const line = lineThrough(next, p.x, p.y, dx, dy);
            const id = `${dx}:${line[0].x},${line[0].y}`;
            if (checked.has(id) || line.length < 4 || line.length >= 6) return;
            checked.add(id);
            const open = [[line[0].x - dx, line[0].y - dy], [line.at(-1).x + dx, line.at(-1).y + dy]].filter(([x, y]) => !next.has(keyOf(x, y))).length;
            if (!open) return;
            const missing = missingKinds(line.map(c => c.tile));
            // 足りない種類の、まだ見えていない枚数（盤と自分の手札に3枚とも見えていれば、もう出てこない）
            const left = missing.reduce((sum, k) => sum + Math.max(0, 3 - seen[k] - move.placements.filter(q => kindOf(q.tile) === k).length), 0);
            // 相手がそのどれかを持っている見込み ≒ 残りの枚数 × 相手の手札の枚数 ÷ 見えていないタイルの数
            const odds = Math.min(1, left * others / Math.max(1, unseen));
            const mineToo = missing.some(k => rest.some(t => kindOf(t) === k));
            if (line.length === 5) {
                v -= W.danger5 * 12 * odds;
                if (mineToo) v += W.keepQwirkle * (1 - odds);
            } else {
                v -= W.danger4 * 12 * odds * odds;
            }
        });
    });
    // 残る手札の良さ
    v += handQuality(rest);
    return v;
}

// 列に足りない種類（同じ色の列なら、まだない形。同じ形の列なら、まだない色）
function missingKinds(tiles) {
    const out = [];
    if (tiles.every(t => colorOf(t) === colorOf(tiles[0]))) {
        const c = colorOf(tiles[0]);
        for (let s = 0; s < 6; s++) if (!tiles.some(t => shapeOf(t) === s)) out.push(c * 6 + s);
    }
    if (tiles.every(t => shapeOf(t) === shapeOf(tiles[0]))) {
        const s = shapeOf(tiles[0]);
        for (let c = 0; c < 6; c++) if (!tiles.some(t => colorOf(t) === c)) out.push(c * 6 + s);
    }
    return [...new Set(out)];
}

function handQuality(hand) {
    let q = 0;
    for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
            const a = hand[i];
            const b = hand[j];
            if (kindOf(a) === kindOf(b)) q -= W.duplicate;
            else if (colorOf(a) === colorOf(b) || shapeOf(a) === shapeOf(b)) q += W.pair;
        }
    }
    return q;
}

// 交換するタイル：重複と、ほかのタイルと色も形も合わないもの。all なら全部（袋の枚数まで）
export function tradePick(hand, bagCount, all) {
    if (all) return hand.slice(0, Math.min(bagCount, hand.length));
    const out = [];
    const kept = [];
    hand.forEach(t => {
        if (kept.some(k => kindOf(k) === kindOf(t))) out.push(t);
        else kept.push(t);
    });
    kept.forEach(t => {
        const partners = kept.filter(k => k !== t && (colorOf(k) === colorOf(t) || shapeOf(k) === shapeOf(t)));
        if (!partners.length) out.push(t);
    });
    return out.slice(0, bagCount);
}

// ヒント：人の番に、ふつうの CPU が選ぶ手を返す。見るのは盤・自分の手札・袋と手札の枚数だけ（隠れた情報はのぞかない）
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.isOver() || game.current !== seat) return null;
    const me = game.players[seat];
    const had = Object.hasOwn(me, 'level');
    const level = me.level;
    me.level = 'normal'; // 人の席にやさしいの印があっても、ふつうの判断で出す
    try {
        return decide(game, seat);
    } finally {
        if (had) me.level = level;
        else delete me.level;
    }
}
