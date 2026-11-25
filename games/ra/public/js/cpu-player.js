/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（公開の情報と自分の太陽駒）だけを見て決める。袋の並びはのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：
 * - 競りの価値：トラックのタイルを手元に足したときの点の増え方を、得点の表から差分で見積もる
 *   （神・金・ファラオの順位・洪水とナイル河・文明の種類数・モニュメントの種類と組。災害は、失うタイルの分を引く）
 *   残すタイル（ファラオ・ナイル河・モニュメント）は、残りの時代の分も少し足す。受け取る中央の太陽駒と出す太陽駒の差も足す
 * - 出す：前より大きい太陽駒のうち一番小さいものを出し、価値が「太陽駒の大きさに応じた値段」を超えるときだけ出す
 *   ラーのトラックが終わりに近いときと、太陽駒が多く残っているときは、値段を下げる
 * - 手番：トラックの価値が高く、競りに勝てそうならラー宣言する。神があり、値打ちの高いタイルがあれば神で取る。ほかは引く
 * - 災害：失って困らないタイル（同じ種類の余り、組にならないモニュメント）から捨てる
 * やさしい：価値の見積もりに大きな迷いを足し、太陽駒は当てずっぽうに選ぶ。トラックがある程度たまったらラー宣言する
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { TILES, CIVS, MONUMENTS, DISASTER_TARGETS, POINTS, EPOCHS, AUCTION_MAX } from './data.js';

export const CPU_LEVELS = ['easy', 'normal'];

// 見積もりの係数（scripts/cpu-match.mjs で勝率を比べて決めた）
export const TUNING = { base: 4, perSun: 0.2, late: 2.5, plenty: 0.5, center: 0.6, raWant: 10, godBar: 4.5, keep: 0.4, god: 1, deny: 0.4, potential: 1 };

const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// ---- 見積もり ----

const civPoints = (counts) => {
    const kinds = CIVS.filter(t => counts[t] > 0).length;
    return kinds === 0 ? POINTS.noCiv : (POINTS.civ[kinds] ?? 0);
};

const monumentPoints = (counts) => {
    const kinds = MONUMENTS.filter(t => counts[t] > 0);
    return POINTS.monumentKinds[kinds.length] + kinds.reduce((s, t) => s + (POINTS.monumentSame[counts[t]] ?? 0), 0);
};

// モニュメントの伸びしろ：1〜2枚の種類は、残りの時代で組になる見込みがある
const POTENTIAL = { 1: 0.8, 2: 2.2, 3: 1.5, 4: 1 };
const monumentPotential = (counts, epochsLeft) => MONUMENTS.reduce((s, t) => s + (POTENTIAL[counts[t]] ?? 0), 0) * (epochsLeft + 1) / 3 * TUNING.potential;

// 手元の点の見積もり（この時代の終わりに入る点と、残すタイルの将来の分）
function evaluate(view, seat, counts) {
    const c = (t) => counts[t] ?? 0;
    const epochsLeft = EPOCHS - view.epoch;
    const others = view.players.filter(p => p.id !== seat).map(p => p.tiles.pharaoh ?? 0);
    const mine = c('pharaoh');
    let pharaoh = 0;
    if (others.length) {
        if (mine > Math.max(...others)) pharaoh = POINTS.pharaohMost;
        else if (mine === Math.max(...others)) pharaoh = POINTS.pharaohMost * 0.6;
        if (mine < Math.min(...others)) pharaoh += POINTS.pharaohFewest;
        else if (mine === Math.min(...others)) pharaoh += POINTS.pharaohFewest * 0.5;
    }
    const river = c('flood') > 0 ? c('flood') + c('nile') : c('nile') * 0.35;
    return c('god') * (POINTS.god + TUNING.god) + c('gold') * POINTS.gold + pharaoh * (1 + epochsLeft * TUNING.keep)
        + river + c('nile') * epochsLeft * 0.5 + civPoints(counts) + monumentPoints(counts) * 0.9 + monumentPotential(counts, epochsLeft);
}

// 災害で失うタイル（失って困らないものから）
export function disasterLoss(view, seat, counts, kind) {
    const targets = DISASTER_TARGETS[kind];
    const held = targets.flatMap(t => Array(counts[t] ?? 0).fill(t));
    const need = Math.min(2, held.length);
    if (kind === 'funeral' || kind === 'drought') return held.slice(0, need);
    // 2枚の組み合わせを全部比べ、点が一番下がらないものを選ぶ
    let best = null;
    for (let i = 0; i < held.length; i++) {
        for (let j = need === 2 ? i + 1 : i; j < (need === 2 ? held.length : i + 1); j++) {
            const pick = need === 2 ? [held[i], held[j]] : [held[i]];
            const after = { ...counts };
            pick.forEach(t => { after[t] -= 1; });
            const value = evaluate(view, seat, after);
            if (!best || value > best.value) best = { value, pick };
        }
    }
    return best ? best.pick : [];
}

// タイルを取ったときの点の増え方
export function tilesValue(view, seat, tiles) {
    const counts = { ...view.players[seat].tiles };
    const before = evaluate(view, seat, counts);
    tiles.filter(t => TILES[t].group !== 'disaster').forEach(t => { counts[t] = (counts[t] ?? 0) + 1; });
    tiles.filter(t => TILES[t].group === 'disaster').forEach(kind => {
        disasterLoss(view, seat, counts, kind).forEach(t => { counts[t] -= 1; });
    });
    return evaluate(view, seat, counts) - before;
}

// 見送ったときに、ほかの人が得る点（太陽駒を持つ人のうち一番大きいもの）。人数が多いほど、自分の損は薄まる
function denialValue(view, seat, tiles) {
    const rivals = view.players.filter(p => p.id !== seat && p.suns.length);
    if (!rivals.length) return 0;
    const best = Math.max(...rivals.map(p => tilesValue(view, p.id, tiles)));
    return Math.max(0, best) * TUNING.deny / (view.players.length - 1);
}

// 太陽駒の値段：大きい太陽駒ほど高い。終わりが近いときと、太陽駒が多いときは安い
function sunPrice(view, me, sun) {
    const late = view.raTrack >= view.raLimit - 2 ? TUNING.late : 0;
    const plenty = me.suns.length >= 3 ? TUNING.plenty : 0;
    return TUNING.base + sun * TUNING.perSun - late - plenty;
}

// ---- 手を選ぶ ----

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    const rand = cpuRandom(game, seat);
    const easy = level === 'easy';
    switch (view.phase) {
        case 'play': return choosePlay(view, rand, easy);
        case 'auction': return chooseBid(view, rand, easy);
        case 'disaster': return { type: 'discard', tiles: disasterLoss(view, view.you, view.players[view.you].tiles, view.disaster.kind) };
        default: return null;
    }
}

function chooseBid(view, rand, easy) {
    const me = view.players[view.you];
    const high = view.auction.high?.sun ?? 0;
    const options = me.suns.filter(s => s > high).sort((a, b) => a - b);
    if (!options.length) return { type: 'pass' };
    if (view.mustBid) return { type: 'bid', sun: options[0] };
    const value = tilesValue(view, view.you, view.auctionTrack);
    if (easy) {
        const want = value + rand() * 4 - 2;
        return want > 2.5 ? { type: 'bid', sun: options[Math.floor(rand() * options.length)] } : { type: 'pass' };
    }
    const sun = options[0];
    const gain = value + denialValue(view, view.you, view.auctionTrack) + (view.center - sun) * TUNING.center;
    return gain > sunPrice(view, me, sun) + rand() * 0.2 ? { type: 'bid', sun } : { type: 'pass' };
}

function choosePlay(view, rand, easy) {
    const me = view.players[view.you];
    const track = view.auctionTrack;
    const full = track.length >= AUCTION_MAX;
    const gods = me.tiles.god ?? 0;
    // 神で取る：値打ちの高いタイルから
    if (gods > 0 && track.length) {
        const scored = track.map((t, i) => ({ i, t, v: t === 'god' ? -99 : tilesValue(view, view.you, [t]) })).sort((a, b) => b.v - a.v);
        const bar = easy ? 4 + rand() * 2 : TUNING.godBar;
        const picks = scored.filter(x => x.v >= bar).slice(0, gods).map(x => x.i);
        if (picks.length && (!easy || rand() < 0.6)) return { type: 'god', slots: picks };
    }
    const value = tilesValue(view, view.you, track) + denialValue(view, view.you, track);
    if (full) return { type: 'ra' };
    if (easy) return track.length >= 3 + Math.floor(rand() * 4) && value > 0 ? { type: 'ra' } : { type: 'draw' };
    // 競りに勝てそうか：自分の一番大きい太陽駒が、ほかの人の表の太陽駒より大きいか
    const myTop = Math.max(...me.suns);
    const theirTop = Math.max(0, ...view.players.filter(p => p.id !== view.you).flatMap(p => p.suns));
    const winnable = myTop > theirTop || view.players.every(p => p.id === view.you || !p.suns.length);
    const late = view.raTrack >= view.raLimit - 2;
    const want = TUNING.raWant - (late ? 2 : 0) - (me.suns.length >= 3 ? 1 : 0);
    if (value >= want && (winnable || value >= want + 4)) return { type: 'ra' };
    return { type: 'draw' };
}

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    let command = null;
    try {
        command = chooseCommand(game, seat, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const p = game.players[seat];
    const smallest = Math.min(...p.suns.filter(s => s.up).map(s => s.value));
    const fallbacks = [{ type: 'pass' }, { type: 'bid', sun: smallest }, { type: 'draw' }, { type: 'ra' }];
    if (game.phase === 'disaster') {
        const ch = game.disasterChoices(seat, game.disasters[0].kind);
        fallbacks.unshift({ type: 'discard', tiles: (ch.held ?? []).slice(0, ch.needed) });
    }
    for (const fallback of fallbacks) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}
