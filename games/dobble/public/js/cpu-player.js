/**
 * CPU：真ん中のカードが変わってから、強さに応じた時間がたったら共通のマークをタップして取る
 *
 * 見つけるまでの時間は、真ん中のカードが変わるたびに決め直す。乱数はゲームの乱数を使わず、
 * 「シード・席・真ん中の版」から作った別の乱数で決める（同じ記録からは同じ時刻になり、再現がずれない）
 * 時間は 0.55〜1.45 倍に散らばる（2つの一様乱数の和なので、真ん中ほど出やすい）。ときどき見落として、2倍近くかかる
 * CPU はまちがえない。取った操作は人と同じ applyCommand を通るので、そのまま記録・再現できる
 */

import { createRandom } from './random.js';

// 強さごとの、見つけるまでの時間（ミリ秒）。base は平均、min は下限、miss は見落とす割合
export const CPU_LEVELS = {
    easy: { base: 4300, min: 1800, miss: 0.2 },
    normal: { base: 2900, min: 1200, miss: 0.12 },
    hard: { base: 1900, min: 800, miss: 0.06 }
};

// 2つの数を混ぜて 32 ビットにする
function mix(a, b) {
    let h = Math.imul((a ^ 0x9E3779B9) >>> 0, 0x85EBCA6B) ^ b;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
}

// 真ん中の版ごと・席ごとの乱数（ゲームの乱数とは別）
function cpuRandom(game, seat) {
    return createRandom(mix(mix(game.seed, seat + 1), game.version + 7919));
}

// 見つけるまでの時間（ミリ秒）
export function findDelay(game, seat, level = game.level) {
    const speed = CPU_LEVELS[level] ?? CPU_LEVELS.normal;
    const random = cpuRandom(game, seat);
    let factor = 0.55 + random() * 0.5 + random() * 0.4;
    if (random() < speed.miss) factor += 0.8;
    return Math.max(speed.min, Math.round(speed.base * factor));
}

// CPU の席が、今の真ん中のカードを取る時刻（取れなければ Infinity）。level を省くとゲームの強さ
export function cpuDueTime(game, seat, level = game.level) {
    const player = game.players[seat];
    if (!player?.isCPU || game.isOver || game.answerFor(seat) === null) return Infinity;
    return Math.max(game.changedAt + findDelay(game, seat, level), player.lockUntil, game.lastT);
}

// 次に取る CPU（一番早い席。同じ時刻なら席の若い方）。なければ null。levels：席ごとの強さ（CPU どうしの対戦で比べるとき）
export function nextCpu(game, levels = null) {
    let best = null;
    game.players.forEach((player, seat) => {
        if (!player.isCPU) return;
        const due = cpuDueTime(game, seat, levels?.[seat] ?? game.level);
        if (due === Infinity) return;
        if (!best || due < best.due) best = { seat, due };
    });
    return best;
}

// t の時刻までに来た CPU の手をすべて打つ。打った数を返す
export function runCpuUntil(game, t, limit = 200, levels = null) {
    let moved = 0;
    while (moved < limit && !game.isOver) {
        const next = nextCpu(game, levels);
        if (!next || next.due > t) break;
        const command = suggest(game, next.seat);
        if (!command || !game.applyCommand(next.seat, { ...command, t: next.due })) break;
        moved += 1;
    }
    return moved;
}

// おすすめ（ヒントとオンラインの試験で使う）：その席が今取れるマークをタップする操作。取れなければ null
export function suggest(game, seat) {
    const symbol = game.answerFor(seat);
    if (symbol === null) return null;
    return { type: 'claim', symbol, center: game.center };
}
