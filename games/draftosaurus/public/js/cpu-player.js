/**
 * CPU：自分のビュー（自分の手と、公開されている全員の公園）だけで判断する
 *
 * 手の恐竜と置ける場所の組み合わせごとに、次の和で評価して、一番よいものを選ぶ
 *   今の点の増え方：その場所に置いたとき、今の時点の点が何点増えるか（ビューの gain）
 *   先の伸び：囲いの先の伸びの見込み（森と草原の次の 1 匹、恋人の相手、3 匹の木の残り、空いた王の座・島）の変化
 *     見込みは、残りの手番が多いほど、その種類がまだ出ていないほど大きくする
 * 2 人のときの箱に戻す恐竜は、交換で相手に渡ったときに相手が一番得をするもの（自分の得も少し差し引く）を選ぶ
 * 強すぎないように、人間らしいゆらぎを入れる（LEVELS）
 */

import { createRandom } from './random.js';
import { SPECIES_KEYS, FOREST_POINTS, MEADOW_POINTS, LOVE_PAIR_POINTS, TRIO_POINTS, KING_POINTS, ISLAND_POINTS } from './dinos.js';
import { clonePark, countSpecies, legalZones, placementGain } from './park.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    easy: { noise: 3.2, foresight: 0.4 },
    normal: { noise: 1.4, foresight: 1 },
    // 強さを測るための、ゆらぎのない CPU（画面では使わない）
    strong: { noise: 0, foresight: 1 },
    // 比べるための、でたらめに打つ CPU（画面では使わない）
    random: { noise: 100, foresight: 0 }
};

function viewRandom(view) {
    return createRandom((Math.imul(view.eventSeq + 1, 2654435761) ^ Math.imul(view.seat + 1, 40503) ^ (view.round * 977)) >>> 0);
}

// まだ見えていない（袋か誰かの手にある）その種類の数の目安。自分の手の分は除く
function unseenOf(view) {
    return Object.fromEntries(SPECIES_KEYS.map(s => {
        const placed = view.players.reduce((sum, p) => sum + countSpecies(p.park, s), 0);
        const inHand = view.hand.filter(d => d === s).length;
        return [s, Math.max(0, view.perSpecies - placed - inHand)];
    }));
}

/**
 * 公園の先の伸びの見込み（点）。rest：このあと自分が置ける回数、unseen：種類ごとのまだ出ていない数
 */
export function potential(park, rest, unseen) {
    if (rest <= 0) return 0;
    const t = Math.min(1, rest / 6);
    const plenty = s => Math.min(1.2, (unseen[s] ?? 0) / 5);
    let value = 0;
    const forest = park.forest;
    if (forest.length > 0 && forest.length < 6) value += (FOREST_POINTS[forest.length + 1] - FOREST_POINTS[forest.length]) * 0.55 * t * plenty(forest[0]);
    if (forest.length === 0) value += 2.5 * t;
    const meadow = park.meadow;
    if (meadow.length < 6) {
        const fresh = SPECIES_KEYS.filter(s => !meadow.includes(s) && (unseen[s] ?? 0) > 0).length;
        if (fresh > 0) value += (MEADOW_POINTS[meadow.length + 1] - MEADOW_POINTS[meadow.length]) * 0.5 * t;
    }
    const love = park.love;
    const singles = SPECIES_KEYS.filter(s => love.filter(d => d === s).length % 2 === 1);
    singles.forEach(s => { value += LOVE_PAIR_POINTS * 0.45 * t * plenty(s); });
    if (love.length === 0) value += 1.2 * t;
    const trio = park.trio.length;
    if (trio === 1) value += TRIO_POINTS * 0.4 * t;
    if (trio === 2) value += TRIO_POINTS * 0.65 * t;
    if (trio === 0) value += 1.8 * t;
    if (park.king.length === 0) value += KING_POINTS * 0.3 * t;
    if (park.island.length === 0) value += ISLAND_POINTS * 0.35 * t;
    return value;
}

// このあと自分が置ける回数（今の手番の分を除く）
const restAfter = view => (view.rounds - view.round) * view.turns + (view.turns - view.turn);

/**
 * 手の候補と評価を全部返す（テストと強さの測定に使う）
 */
export function scoreCandidates(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const me = view.players[view.seat];
    const unseen = unseenOf(view);
    const rest = restAfter(view);
    const base = potential(me.park, rest, unseen);
    const candidates = [];
    view.handOptions.forEach(({ dino, zones }) => {
        zones.forEach(({ zone, gain }) => {
            const next = clonePark(me.park);
            next[zone].push(dino);
            const ahead = (potential(next, rest, unseen) - base) * cfg.foresight;
            candidates.push({ command: { type: 'place', dino, zone }, value: gain + ahead + (random() * 2 - 1) * cfg.noise });
        });
    });
    return candidates;
}

// その席がその恐竜を置いたときの、一番よい評価（ダイスの決まりは分からないので見ない）
function bestUse(view, seat, dino, rest, unseen) {
    const parks = view.players.map(p => p.park);
    const park = parks[seat];
    const base = potential(park, rest, unseen);
    return Math.max(...legalZones(park, dino, null).map(zone => {
        const next = clonePark(park);
        next[zone].push(dino);
        return placementGain(parks, seat, dino, zone) + potential(next, rest, unseen) - base;
    }));
}

/**
 * 2 人のとき：箱に戻す恐竜の候補と評価（残りの手は相手に渡る）
 */
export function scoreDiscards(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const other = view.players.find(p => p.id !== view.seat).id;
    const unseen = unseenOf(view);
    const rest = restAfter(view);
    return [...new Set(view.hand)].map(dino => ({
        command: { type: 'discard', dino },
        value: (bestUse(view, other, dino, rest, unseen) - 0.25 * bestUse(view, view.seat, dino, rest, unseen)) * cfg.foresight + (random() * 2 - 1) * cfg.noise
    }));
}

export function chooseCommand(view, cfg = LEVELS.normal) {
    let best = null;
    (view.discarding ? scoreDiscards(view, cfg) : scoreCandidates(view, cfg)).forEach(c => { if (!best || c.value > best.value) best = c; });
    return best?.command ?? null;
}

// 想定外の断りでも止めないための手：箱に戻す番なら手の最初の恐竜を戻し、置く番なら川に置く（川にはいつでも置ける）
export function fallbackCommand(game, seat) {
    const dino = game.hands[seat][0];
    return game.phase === 'discard' ? { type: 'discard', dino } : { type: 'place', dino, zone: 'river' };
}

// 選ぶ番の CPU の席
export function cpuSeatsToAct(game) {
    if (game.isOver()) return [];
    return game.waiting.filter(s => game.players[s].isCPU && !game.pending?.[s]);
}

// CPU の席 seat が 1 手選ぶ。選べたら true（CPU には自分のビューだけを渡す）
export function runCpuStep(game, seat, levelOf = () => 'normal') {
    if (!cpuSeatsToAct(game).includes(seat)) return false;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, LEVELS[levelOf(seat)] ?? LEVELS.normal);
    if (command && game.applyCommand(seat, command)) return true;
    return game.applyCommand(seat, fallbackCommand(game, seat));
}

// 全員が CPU のとき、全員が選び終わるまで進める（テストと測定に使う）
export function runCpuRound(game, levelOf) {
    let moved = false;
    for (const seat of cpuSeatsToAct(game)) moved = runCpuStep(game, seat, levelOf) || moved;
    return moved;
}
