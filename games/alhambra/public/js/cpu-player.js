/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは公開の情報（市場・各自のアルハンブラ・ダーク）と自分の手札だけ。相手の手札・山札・袋はのぞかない
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：建物の価値を「残りの得点の回数で見た、その種類の順位が上がって増える点」と「置いて伸びる城壁」で見積もり、
 *         払い過ぎの少ない買い物を選ぶ。ちょうどの額なら、もう一度行動できるので高く見る。
 *         買う価値が低ければ、欲しい建物を買えるようになるお金を取る
 * - 強すぎないように、人間らしい見落としを混ぜる（市場の建物の一部を見ていない・評価が揺れる・買えるのに見送る・
 *   置き場所をよく考えない・多数の争いを甘く見る）
 */

import { TILES, SCORING, CURRENCIES, TAKE_LIMIT, rankPoints } from './game.js';
import { placeSpots, longestWall, countTypes, keyOf } from './layout.js';
import { createRandom } from './random.js';

// 強さの設定。easy・normal が画面で選べる CPU。strong は見落としのない比較用（強さを測るときだけ使う）
export const PROFILES = {
    easy: { overlook: 0.4, noise: 3, future: 0.4, skipBuy: 0.25, looseSpot: 0.5, majority: 0.6 },
    normal: { overlook: 0.25, noise: 2, future: 0.6, skipBuy: 0.15, looseSpot: 0.3, majority: 0.8 },
    strong: { overlook: 0, noise: 0, future: 0.8, skipBuy: 0, looseSpot: 0, majority: 1 }
};
export const CPU_LEVELS = ['easy', 'normal'];

export const isCpuTurn = (game) => !game.isOver() && game.players[game.actors()[0]]?.isCPU === true;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

const profileOf = (game, seat) => PROFILES[game.players[seat].cpuLevel ?? 'normal'] ?? PROFILES.normal;

// これからの得点の回の重み（次の回は1、その先は future）
const roundWeights = (game, future) => [0, 1, 2].filter(r => r >= game.roundsScored).map((r, i) => ({ round: r, weight: i === 0 ? 1 : future }));

// その種類を1枚増やしたときに増える点の見込み
function typeGain(game, seat, type, weights) {
    const entries = game.players.map(p => ({ id: p.id, count: countTypes(p.layout)[type] }));
    if (game.dirk) entries.push({ id: 'dirk', count: game.dirkCounts()[type] });
    let gain = 0;
    weights.forEach(({ round, weight }) => {
        const table = SCORING[round][type];
        const before = rankPoints(entries, table).get(seat) ?? 0;
        const after = rankPoints(entries.map(e => (e.id === seat ? { ...e, count: e.count + 1 } : e)), table).get(seat) ?? 0;
        gain += (after - before) * weight;
    });
    return gain;
}

// 置き場所の良さ：城壁の伸び＋この先も置ける場所の多さ
function bestSpot(game, seat, tile, weights) {
    const layout = game.players[seat].layout;
    const spots = placeSpots(layout, tile);
    if (spots.length === 0) return null;
    const wallBefore = longestWall(layout);
    const scale = weights.reduce((s, w) => s + w.weight, 0);
    let best = null;
    for (const [x, y] of spots) {
        const after = { ...layout, [keyOf(x, y)]: tile };
        const wall = (longestWall(after) - wallBefore) * scale;
        // 噴水に近いほど、ほかの建物を置ける場所が残りやすい
        const spread = -0.05 * (Math.abs(x) + Math.abs(y));
        const value = wall + spread;
        if (!best || value > best.value) best = { x, y, value, wall };
    }
    return best;
}

// 建物の価値（置けなければ、予備に置く分だけ低く見る）
function tileValue(game, seat, tile, weights, majority = 1) {
    const spot = bestSpot(game, seat, tile, weights);
    const gain = typeGain(game, seat, TILES[tile].type, weights) * majority;
    if (!spot) return gain * 0.2;
    return gain + spot.wall + 0.6;
}

// 払い方：値段以上で、払い過ぎが最も少なく、枚数の少ないカードの組
export function bestPayment(cards, cost) {
    let best = null;
    const n = Math.min(cards.length, 14);
    for (let mask = 1; mask < (1 << n); mask++) {
        let sum = 0, count = 0;
        for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += cards[i].value; count++; }
        if (sum < cost) continue;
        if (!best || sum < best.sum || (sum === best.sum && count < best.count)) best = { mask, sum, count };
    }
    if (!best) return null;
    return { ids: cards.filter((_, i) => best.mask & (1 << i)).map(c => c.id), over: best.sum - cost };
}

// 手番の CPU の操作を1つ決める
export function chooseCpuCommand(game, seat = game.actors()[0], profile = profileOf(game, seat)) {
    const random = cpuRandom(game, seat);
    const weights = roundWeights(game, profile.future);
    if (game.phase === 'place' || game.phase === 'final') {
        const tile = game.phase === 'final' ? game.finalQueue[0].tile : game.bought[0];
        const spots = placeSpots(game.players[seat].layout, tile);
        if (spots.length > 0 && random() < profile.looseSpot) {
            const [x, y] = spots[Math.floor(random() * spots.length)];
            return { type: 'place', tile, to: 'alhambra', x, y };
        }
        const spot = bestSpot(game, seat, tile, weights);
        return spot ? { type: 'place', tile, to: 'alhambra', x: spot.x, y: spot.y } : { type: 'place', tile, to: 'reserve' };
    }
    const player = game.players[seat];
    const hand = player.hand.map(id => game.card(id));
    const options = [];
    const noise = () => (random() * 2 - 1) * profile.noise;

    // 買う
    const values = new Map();
    game.market.forEach((tile, slot) => {
        if (tile === null || random() < profile.overlook) return;
        const value = tileValue(game, seat, tile, weights, profile.majority);
        values.set(slot, value);
        const pay = bestPayment(hand.filter(c => c.currency === CURRENCIES[slot]), TILES[tile].cost);
        if (!pay || random() < profile.skipBuy) return;
        const score = value - pay.over * 0.6 + (pay.over === 0 ? 2 : 0) - TILES[tile].cost * 0.1 + noise();
        options.push({ score, command: { type: 'buy', slot, cards: pay.ids } });
    });

    // お金を取る（1枚か、合計5までの組）
    const money = game.moneyMarket.map((card, slot) => (card === null || card === undefined ? null : { ...game.card(card), slot })).filter(Boolean);
    const combos = [];
    money.forEach(c => combos.push([c]));
    for (let mask = 1; mask < (1 << money.length); mask++) {
        const picked = money.filter((_, i) => mask & (1 << i));
        if (picked.length > 1 && picked.reduce((s, c) => s + c.value, 0) <= TAKE_LIMIT) combos.push(picked);
    }
    combos.forEach(picked => {
        let score = picked.reduce((s, c) => s + c.value, 0) * 0.45 + noise() * 0.5;
        // 欲しい建物を買えるようになる・ちょうどで払えるようになる分
        values.forEach((value, slot) => {
            const tile = game.market[slot];
            const mine = hand.filter(c => c.currency === CURRENCIES[slot]);
            const added = picked.filter(c => c.currency === CURRENCIES[slot]);
            if (added.length === 0) return;
            const before = bestPayment(mine, TILES[tile].cost);
            const after = bestPayment([...mine, ...added], TILES[tile].cost);
            if (!after) return;
            if (!before) score += Math.max(0, value) * 0.35;
            if (after.over === 0 && (!before || before.over > 0)) score += 0.8;
        });
        options.push({ score, command: { type: 'take', slots: picked.map(c => c.slot) } });
    });

    // 作り直す：予備の建物を置けるなら足す
    player.reserve.forEach(tile => {
        const spot = bestSpot(game, seat, tile, weights);
        if (!spot) return;
        const score = typeGain(game, seat, TILES[tile].type, weights) + spot.wall + noise() * 0.5;
        options.push({ score, command: { type: 'redesign', op: 'add', tile, x: spot.x, y: spot.y } });
    });

    if (game.actionsTaken > 0 || options.length === 0) options.push({ score: 0.3, command: { type: 'end' } });
    options.sort((a, b) => b.score - a.score);
    return options[0].command;
}

// CPU に1手打たせる。決めた手が断られたら、できる手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.actors()[0], profile) {
    if (game.isOver() || !game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile ?? profileOf(game, seat));
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return game.sampleCommands().some(c => game.applyCommand(seat, c));
}

