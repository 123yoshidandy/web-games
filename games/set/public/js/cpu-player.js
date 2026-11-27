/**
 * CPU：場が変わってから、強さに応じた時間がたったらセットを1つ取る
 *
 * 見つけるまでの時間は、場が変わるたびに決め直す。乱数はゲームの乱数を使わず、
 * 「シード・席・場の版」から作った別の乱数で決める（同じ記録からは同じ時刻になり、再現がずれない）
 * 場のセットが少ないほど時間がかかる（人と同じく、見つけにくい）
 * CPU はまちがえない。取った操作は人と同じ applyCommand を通るので、そのまま記録・再現できる
 */

import { findSets } from './game.js';
import { createRandom } from './random.js';

// 強さごとの、見つけるまでの時間（場にセットが1つのときのミリ秒）
export const CPU_LEVELS = {
    easy: { base: 26000, min: 6000 },
    normal: { base: 15000, min: 3500 },
    hard: { base: 8500, min: 2000 }
};

// 2つの数を混ぜて 32 ビットにする
function mix(a, b) {
    let h = Math.imul((a ^ 0x9E3779B9) >>> 0, 0x85EBCA6B) ^ b;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
}

// 場の版ごと・席ごとの乱数（ゲームの乱数とは別）
function cpuRandom(game, seat) {
    return createRandom(mix(mix(game.seed, seat + 1), game.boardVersion + 7919));
}

// CPU の席が、今の場でセットを取る時刻（取れなければ Infinity）。level を省くとゲームの強さ
export function cpuDueTime(game, seat, level = game.level) {
    const player = game.players[seat];
    if (!player?.isCPU || game.isOver) return Infinity;
    const count = findSets(game.board).length;
    if (count === 0) return Infinity;
    const speed = CPU_LEVELS[level] ?? CPU_LEVELS.normal;
    const random = cpuRandom(game, seat);
    const spread = 0.6 + random() * 0.8;
    const delay = Math.max(speed.min, Math.round(speed.base * spread / Math.sqrt(count)));
    return Math.max(game.changedAt + delay, player.lockUntil, game.lastT);
}

// CPU が取るセット（同じ乱数で、場のセットから1つ選ぶ）
export function cpuChoice(game, seat) {
    const sets = findSets(game.board);
    if (sets.length === 0) return null;
    const random = cpuRandom(game, seat);
    random();
    return sets[Math.floor(random() * sets.length)];
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
export function runCpuUntil(game, t, limit = 100, levels = null) {
    let moved = 0;
    while (moved < limit && !game.isOver) {
        const next = nextCpu(game, levels);
        if (!next || next.due > t) break;
        const cards = cpuChoice(game, next.seat);
        if (!cards || !game.applyCommand(next.seat, { type: 'claim', cards, t: next.due })) break;
        moved += 1;
    }
    return moved;
}

// おすすめ（ヒントとオンラインの試験で使う）：その席が今取れるセット。取れなければ null
export function suggest(game, seat) {
    if (game.isOver || !game.players[seat]) return null;
    const sets = findSets(game.board);
    if (sets.length === 0) return null;
    return { type: 'claim', cards: sets[0] };
}
