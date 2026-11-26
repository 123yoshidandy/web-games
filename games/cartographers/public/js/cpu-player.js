/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは公開の情報だけ（地図・得点カード・季節）。山札の並びはのぞかない
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：描ける置き方を並べ、描いたあとの地図を「これから得点する回数で重みづけた得点カードの点＋コイン−異形の減点」と、
 *         地図を細切れにしない形かどうかで評価して、いちばん良いものを選ぶ
 * - 襲撃で隣の地図に描くときは、その人の評価がいちばん下がる場所に描く
 * - 強すぎないように、人間らしい見落としを混ぜる（置き方の一部を見ていない・評価が揺れる・先の季節を軽く見る）
 */

import { SEASONS, RUIN_SET, TERRAINS, exploreCard, ambushCard, legalPlacements, mustFallback } from './game.js';
import { scoreEdict, monsterPenalty, surroundedMountains, neighbors, isEdge } from './scoring.js';
import { createRandom } from './random.js';

// 強さの設定。easy・normal が画面で選べる CPU。strong は見落としのない比較用（強さを測るときだけ使う）
export const PROFILES = {
    easy: { overlook: 0.7, noise: 3.5, future: 0.15, randomMonster: true },
    normal: { overlook: 0.6, noise: 3, future: 0.3, randomMonster: false },
    strong: { overlook: 0, noise: 0, future: 0.7, randomMonster: false }
};
export const CPU_LEVELS = ['easy', 'normal'];
const MAX_CANDIDATES = 700;

export const isCpuTurn = (game) => game.phase !== 'end' && game.pending.some(seat => game.players[seat].isCPU);
export const cpuSeats = (game) => game.pending.filter(seat => game.players[seat].isCPU);

// 判断用の乱数。ゲームの状態（シード・手数・席）だけから決まるので、同じ場面では同じ手になる
function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

const profileOf = (game, seat) => PROFILES[game.players[seat].cpuLevel ?? 'normal'] ?? PROFILES.normal;

// 得点カードごとの重み：今の季節で得点するなら1、先の季節で得点する回数ごとに future
function edictWeights(season, future) {
    const weights = [0, 0, 0, 0];
    for (let s = season; s < SEASONS.length; s++) {
        SEASONS[s].edicts.forEach(i => { weights[i] += s === season ? 1 : future; });
    }
    return weights;
}

// 地図の評価。remaining：コインと異形の減点がこれから数えられる回数のめやす
export function evaluateBoard(board, { edicts, weights, remaining }) {
    let value = 0;
    edicts.forEach((id, i) => { if (weights[i] > 0) value += weights[i] * scoreEdict(id, board); });
    value -= remaining * monsterPenalty(board);
    value += remaining * surroundedMountains(board);
    return value;
}

// 置いた形のまわりの埋まり具合（地図を細切れにしないほど高い）と、廃墟をむだに使う分
function shapeBonus(board, cells, ruinsRequired) {
    let touching = 0;
    const set = new Set(cells);
    cells.forEach(cell => {
        if (isEdge(cell)) touching += 0.5;
        neighbors(cell).forEach(n => { if (!set.has(n) && board[n] !== null) touching++; });
    });
    // 1マスだけ取り残された空きマス
    let holes = 0;
    cells.forEach(cell => neighbors(cell).forEach(n => {
        if (board[n] === null && !set.has(n) && neighbors(n).every(m => board[m] !== null || set.has(m))) holes++;
    }));
    const ruins = ruinsRequired ? 0 : cells.filter(cell => RUIN_SET.has(cell)).length;
    return touching * 0.15 - holes * 0.4 - ruins * 0.3;
}

function context(game, seat, profile) {
    const remaining = SEASONS.length - game.season;
    return {
        edicts: game.edicts,
        weights: edictWeights(game.season, profile.future),
        remaining: 1 + (remaining - 1) * profile.future
    };
}

// 手番の CPU の操作を1つ決める
// ヒント：人が描く番に、CPU（ふつう）が選ぶ描き方。CPU と同じく、公開のカードと地図から決める。手は打たない
export function suggest(game, seat) {
    if (game.phase === 'end' || !game.pending.includes(seat)) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

export function chooseCpuCommand(game, seat, profile = profileOf(game, seat)) {
    const random = cpuRandom(game, seat);
    if (game.phase === 'ambush') return chooseMonster(game, seat, random, profile);
    return choosePlacement(game, seat, random, profile);
}

function choosePlacement(game, seat, random, profile) {
    const board = game.players[seat].board;
    const card = exploreCard(game.card.id);
    const ctx = context(game, seat, profile);
    const base = evaluateBoard(board, ctx);
    const candidates = [];
    if (mustFallback(board, card, game.ruins)) {
        const empty = board.flatMap((t, cell) => (t === null ? [cell] : []));
        empty.forEach(cell => TERRAINS.filter(t => t !== 'monster').forEach(terrain => {
            candidates.push({ command: { type: 'place', fallback: true, terrain, cells: [cell] }, cells: [cell], terrain, coin: 0 });
        }));
    } else {
        card.variants.forEach((variant, index) => {
            legalPlacements(board, variant.cells, { ruins: game.ruins }).forEach(cells => {
                candidates.push({ command: { type: 'place', variant: index, cells }, cells, terrain: variant.terrain, coin: variant.coin ? 1 : 0 });
            });
        });
    }
    return pickBest(candidates, random, profile, (c) => {
        const after = [...board];
        c.cells.forEach(cell => { after[cell] = c.terrain; });
        return evaluateBoard(after, ctx) - base + c.coin * ctx.remaining + shapeBonus(board, c.cells, game.ruins)
            - (c.terrain === 'monster' ? 3 : 0);
    });
}

// 隣の人の地図に異形を描く。その人の評価がいちばん下がる場所
function chooseMonster(game, seat, random, profile) {
    const owner = game.players[game.targets[seat]];
    const card = ambushCard(game.card.id);
    const placements = legalPlacements(owner.board, card.cells);
    if (profile.randomMonster) return { type: 'monster', cells: placements[Math.floor(random() * placements.length)] };
    // 相手の評価は、相手の強さによらず「ふつう」の見方で見積もる
    const ctx = context(game, owner.id, PROFILES.normal);
    const base = evaluateBoard(owner.board, ctx);
    const candidates = placements.map(cells => ({ command: { type: 'monster', cells }, cells }));
    return pickBest(candidates, random, profile, (c) => {
        const after = [...owner.board];
        c.cells.forEach(cell => { after[cell] = 'monster'; });
        return base - evaluateBoard(after, ctx);
    });
}

// 見落としの分を除き、揺れを加えた評価がいちばん高い候補
function pickBest(candidates, random, profile, evaluate) {
    if (candidates.length === 0) return null;
    let pool = candidates.filter(() => random() >= profile.overlook);
    if (pool.length === 0) pool = [candidates[Math.floor(random() * candidates.length)]];
    // 候補が多すぎるときは、等間隔に間引く（時間ではなく数で打ち切る）
    if (pool.length > MAX_CANDIDATES) {
        const step = pool.length / MAX_CANDIDATES;
        pool = Array.from({ length: MAX_CANDIDATES }, (_, i) => pool[Math.floor(i * step)]);
    }
    let best = null, bestValue = -Infinity;
    for (const c of pool) {
        const value = evaluate(c) + (random() * 2 - 1) * profile.noise;
        if (value > bestValue) {
            best = c;
            bestValue = value;
        }
    }
    return best.command;
}

// CPU に1手打たせる。決めた手が断られたら、できる手を順に試す（必ず前に進める）
export function runCpuStep(game, seat, profile) {
    if (!game.pending.includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile ?? profileOf(game, seat));
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return game.sampleCommands(seat).some(c => game.applyCommand(seat, c));
}

// 待っている CPU 全員に1手ずつ打たせる
export function runCpuTurns(game, profiles = {}) {
    let moved = false;
    for (const seat of cpuSeats(game)) {
        if (game.pending.includes(seat) && runCpuStep(game, seat, profiles[seat])) moved = true;
    }
    return moved;
}
