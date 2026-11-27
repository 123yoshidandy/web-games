/**
 * CPU と、時刻で起きること（自動でめくる・CPU のベル・時間切れ）
 *
 * CPU のベル：見えているカードが変わるたびに、鳴らすかどうかと、鳴らすまでの時間を決め直す
 * - ちょうど5つの果物があれば、強さに応じた反応の時間で鳴らす（ときどき見落とす）
 * - なくても、4つか6つの果物があると、強さに応じた割合でまちがえて鳴らす
 * 乱数はゲームの乱数を使わず、「シード・席・場の版」から作った別の乱数で決める（同じ記録からは同じ時刻になり、再現がずれない）
 * 自動でめくる時刻はゲームが決める（手番が来てから、めくる間隔のあと。ベルのあとは少し待つ）
 * どの操作も人と同じ applyCommand を通るので、そのまま記録・再現できる
 */

import { fruitTotals, TARGET } from './game.js';
import { createRandom } from './random.js';

// 強さごとの反応の時間（ミリ秒。mean を中心に ±spread でばらつく）・見落とす割合・まちがえて鳴らす割合
export const CPU_LEVELS = {
    easy: { mean: 980, spread: 650, min: 420, miss: 0.12, falseRate: 0.07 },
    normal: { mean: 820, spread: 550, min: 340, miss: 0.07, falseRate: 0.045 },
    hard: { mean: 680, spread: 450, min: 280, miss: 0.04, falseRate: 0.025 }
};
// まちがえて鳴らすときは、5つのときより少し遅い（迷ってから押す）
const FALSE_SLOWER = 1.25;

// 2つの数を混ぜて 32 ビットにする
function mix(a, b) {
    let h = Math.imul((a ^ 0x9E3779B9) >>> 0, 0x85EBCA6B) ^ b;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
}

// 場の版ごと・席ごとの乱数（ゲームの乱数とは別）
function cpuRandom(game, seat) {
    return createRandom(mix(mix(game.seed, seat + 1), game.tableVersion + 7919));
}

// 3つの乱数の平均で、真ん中に寄ったばらつき（-1〜1）
const bell = random => ((random() + random() + random()) / 3 - 0.5) * 2;

// CPU の席が、今の場でベルを鳴らす時刻（鳴らさなければ Infinity）。level を省くとゲームの強さ
export function cpuRingTime(game, seat, level = game.level) {
    const player = game.players[seat];
    if (!player?.isCPU || player.out || game.isOver) return Infinity;
    if (player.rangVersion === game.tableVersion) return Infinity;
    const totals = fruitTotals(game.tops());
    const five = totals.includes(TARGET);
    const near = totals.some(total => total === TARGET - 1 || total === TARGET + 1);
    if (!five && !near) return Infinity;
    const speed = CPU_LEVELS[level] ?? CPU_LEVELS.normal;
    const random = cpuRandom(game, seat);
    const roll = random();
    if (five ? roll < speed.miss : roll >= speed.falseRate) return Infinity;
    const delay = Math.max(speed.min, Math.round((speed.mean + bell(random) * speed.spread) * (five ? 1 : FALSE_SLOWER)));
    return Math.max(game.changedAt + delay, player.lockUntil, game.lastT);
}

// 次に起きること（一番早いもの。同じ時刻ならベル（席の若い順）→ めくる → 時間切れ）。なければ null
// levels：席ごとの強さ（CPU どうしの対戦で比べるとき）
export function nextEvent(game, levels = null) {
    if (game.isOver) return null;
    let best = null;
    const consider = (event) => {
        if (event.due === Infinity) return;
        if (!best || event.due < best.due || (event.due === best.due && event.order < best.order)) best = event;
    };
    game.players.forEach((player, seat) => {
        if (!player.isCPU) return;
        consider({ type: 'ring', seat, due: cpuRingTime(game, seat, levels?.[seat] ?? game.level), order: seat });
    });
    consider({ type: 'flip', seat: game.turn, due: game.flipDue(), order: 100 });
    consider({ type: 'timeup', seat: game.turn, due: Math.max(game.limitMs, game.lastT), order: 200 });
    return best;
}

// t の時刻までに来たことをすべて起こす。起こした数を返す
export function runUntil(game, t, limit = 100, levels = null) {
    let moved = 0;
    while (moved < limit && !game.isOver) {
        const next = nextEvent(game, levels);
        if (!next || next.due > t) break;
        if (!game.applyCommand(next.seat, { type: next.type, t: next.due })) break;
        moved += 1;
    }
    return moved;
}

// おすすめ（ヒントとオンラインの試験で使う）：5つなら鳴らす、自分の番ならめくる。どちらでもなければ null
export function suggest(game, seat) {
    const player = game.players[seat];
    if (game.isOver || !player || player.out) return null;
    if (game.fives().length > 0) return { type: 'ring', version: game.tableVersion };
    if (game.turn === seat && player.deck.length > 0) return { type: 'flip' };
    return null;
}
