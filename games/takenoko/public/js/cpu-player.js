/**
 * CPU（DOM に依存しない）。1つずつ命令を決める（その場の盤面から毎回考える）
 *
 *   1. 達成できる目標があれば達成する
 *   2. 天気の効果を決める（雨は目標に効く区画、嵐は要る色の竹、雲は庭師の目標に要る改良）
 *   3. 区画を引いたら、区画の目標と灌漑のしやすさで置く札と場所を選ぶ
 *   4. 行動の候補（庭師・パンダ・灌漑・区画・目標を引く）を見積もり、いちばん良いものを取る
 *   5. 取れる行動がなければ手番を終える
 * 強すぎないように、行き先の見落としと見積もりのぶれを入れる。
 * CPU の判断には、ゲームの乱数を使わない（状態から作った別の乱数を使う）
 */

import { CARDS, CARD_TYPES, COLORS, IMPROVEMENTS, MAX_BAMBOO, PLOTS, HAND_LIMIT } from './data.js';
import { key, neighbors } from './game.js';
import { progressOf } from './progress.js';
import { createRandom } from './random.js';

export const CPU_STYLES = {
    easy: { overlook: 0.35, noise: 2.5 },
    normal: { overlook: 0.12, noise: 0.8 },
    strong: { overlook: 0, noise: 0 } // 強さを測るときの比べる相手。画面では使わない
};

function cpuRandom(game, seat) {
    const seed = (game.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0;
    return createRandom(seed);
}

const xy = ([q, r]) => ({ q, r });
const handCards = (game, seat) => game.players[seat].hand.map(id => CARDS[id]);

// パンダの目標で、まだ要る色の本数
function pandaNeeds(game, seat) {
    const need = { green: 0, yellow: 0, pink: 0 };
    for (const card of handCards(game, seat)) {
        if (card.type !== 'panda') continue;
        for (const c of COLORS) need[c] += card.need[c];
    }
    const eaten = game.players[seat].eaten;
    return Object.fromEntries(COLORS.map(c => [c, Math.max(0, need[c] - eaten[c])]));
}

// 庭師の目標に合う区画か（色と改良の条件）
const fitsGardener = (card, t) => t.color === card.color && (
    card.improvement === 'any' || (card.improvement === 'none' ? !t.improvement : t.improvement === card.improvement));

// 竹の高さが変わったときの、庭師の目標への近づき方
function bambooValue(game, seat, changes, gardenerAt) {
    let value = 0;
    const needs = pandaNeeds(game, seat);
    for (const { tile, before, after } of changes) {
        for (const card of handCards(game, seat)) {
            if (card.type !== 'gardener' || !fitsGardener(card, tile)) continue;
            const good = h => (h <= card.height ? h : card.height - (h - card.height) * 2);
            value += (good(after) - good(before)) * (card.points / 4);
            if (after === card.height && card.count === 1 && gardenerAt === key(tile.q, tile.r)) value += card.points * 1.5;
        }
        // パンダの目標に要る色の竹が増える
        if (needs[tile.color] > 0) value += (after - before) * 0.4;
    }
    return value;
}

// 庭師を (q, r) に動かしたときの見積もり
function gardenerValue(game, seat, [q, r]) {
    const here = game.tileAt(q, r);
    if (!here || here.color === 'pond') return -0.5;
    const changes = [];
    for (const t of [here, ...neighbors(q, r).map(n => game.tileAt(...n)).filter(t => t && t.color === here.color)]) {
        if (!game.isIrrigated(t.q, t.r) || t.bamboo >= MAX_BAMBOO) continue;
        const after = Math.min(MAX_BAMBOO, t.bamboo + (t.improvement === 'fertilizer' ? 2 : 1));
        changes.push({ tile: t, before: t.bamboo, after });
    }
    let value = bambooValue(game, seat, changes, key(q, r)) + changes.length * 0.15;
    // 高さ3を何本もそろえる目標：庭師が乗っていて、もうそろっていれば
    for (const card of handCards(game, seat)) {
        if (card.type !== 'gardener' || card.count === 1) continue;
        const after = t => changes.find(c => c.tile === t)?.after ?? t.bamboo;
        const exact = game.plots().filter(t => fitsGardener(card, t) && after(t) === card.height);
        if (exact.length >= card.count && exact.some(t => t.q === q && t.r === r)) value += card.points * 1.5;
    }
    return value;
}

// パンダを (q, r) に動かしたときの見積もり
function pandaValue(game, seat, [q, r]) {
    const t = game.tileAt(q, r);
    if (!t || t.color === 'pond' || t.bamboo === 0 || t.improvement === 'enclosure') return -0.5;
    const needs = pandaNeeds(game, seat);
    let value = needs[t.color] > 0 ? 3 : 0.6;
    // その色を食べると達成できるパンダの目標
    const eaten = { ...game.players[seat].eaten, [t.color]: game.players[seat].eaten[t.color] + 1 };
    for (const card of handCards(game, seat)) {
        if (card.type === 'panda' && COLORS.every(c => eaten[c] >= card.need[c])) value += card.points;
    }
    // 自分の庭師の目標に使う竹を減らすのは損
    for (const card of handCards(game, seat)) {
        if (card.type === 'gardener' && fitsGardener(card, t) && t.bamboo <= card.height) value -= card.points / 3;
    }
    return value;
}

// 水路の見積もり：新しく灌漑される区画
function irrigationValue(game, seat, [a, b]) {
    let value = 0.3;
    for (const p of [a, b]) {
        const t = game.tileAt(...p);
        if (t && !game.isIrrigated(...p)) {
            value += 1.6;
            for (const card of handCards(game, seat)) {
                if (card.type === 'plot' && card.colors.includes(t.color)) value += 0.8;
                if (card.type === 'gardener' && fitsGardener(card, t)) value += 0.8;
            }
        }
    }
    return value;
}

// 区画を置く場所の見積もり
function plotPlacementValue(game, seat, plotId, [q, r]) {
    const plot = PLOTS[plotId];
    let value = 0;
    const nearPond = neighbors(q, r).some(([a, b]) => a === 0 && b === 0);
    if (nearPond || plot.improvement === 'watershed') value += 1.2; // すぐ灌漑されて竹が生える
    for (const card of handCards(game, seat)) {
        if (card.type === 'plot' && card.colors.includes(plot.color)) {
            const same = neighbors(q, r).filter(n => game.tileAt(...n)?.color === plot.color).length;
            value += 0.6 + same * 0.7;
        }
        if (card.type === 'gardener' && fitsGardener(card, { ...plot, improvement: plot.improvement })) value += 0.8;
        if (card.type === 'panda' && card.need[plot.color] > 0) value += 0.3;
    }
    // 同じ色が隣り合うと、庭師で一緒に育つ
    value += neighbors(q, r).filter(n => game.tileAt(...n)?.color === plot.color).length * 0.25;
    return value;
}

function best(list, score, style, random) {
    let candidates = list.filter(() => random() >= style.overlook);
    if (candidates.length === 0 && list.length) candidates = [list[Math.floor(random() * list.length)]];
    let top = null;
    let topValue = -Infinity;
    for (const item of candidates) {
        const value = score(item) + (random() * 2 - 1) * style.noise;
        if (value > topValue) {
            topValue = value;
            top = item;
        }
    }
    return top === null ? null : { item: top, value: topValue };
}

// CPU の命令を決める
export function chooseCommand(game, seat = game.current, style = CPU_STYLES.normal) {
    const random = cpuRandom(game, seat);
    const turn = game.turnState;
    const player = game.players[seat];

    // 1. 達成できる目標
    const done = player.hand.find(id => game.canComplete(seat, id));
    if (done) return { type: 'complete', card: done };

    // 2. 天気
    if (turn.pending === 'choice') {
        const wantRain = handCards(game, seat).some(c => c.type === 'gardener') && game.rainSpots().length > 0;
        return { type: 'weather', weather: wantRain ? 'rain' : 'sun' };
    }
    if (turn.pending === 'rain') {
        const pick = best(game.rainSpots(), p => {
            const t = game.tileAt(...p);
            const after = Math.min(MAX_BAMBOO, t.bamboo + (t.improvement === 'fertilizer' ? 2 : 1));
            return bambooValue(game, seat, [{ tile: t, before: t.bamboo, after }], key(...game.gardener));
        }, style, random);
        return pick ? { type: 'rain', ...xy(pick.item) } : { type: 'skip' };
    }
    if (turn.pending === 'storm') {
        const pick = best(game.plots().map(t => [t.q, t.r]), p => pandaValue(game, seat, p), style, random);
        return pick && pick.value > 0 ? { type: 'storm', ...xy(pick.item) } : { type: 'skip' };
    }
    if (turn.pending === 'clouds') return cloudsCommand(game, seat);

    // 3. 引いた区画を置く
    if (turn.drawn) {
        const options = [];
        turn.drawn.forEach((plotId, choice) => {
            for (const spot of game.plotSpots()) options.push({ choice, plotId, spot });
        });
        const pick = best(options, o => plotPlacementValue(game, seat, o.plotId, o.spot), style, random) ?? { item: options[0] };
        return { type: 'placePlot', choice: pick.item.choice, ...xy(pick.item.spot) };
    }

    // 4. 行動
    const choices = [];
    const actions = game.availableActions();
    if (actions.includes('gardener')) {
        const pick = best(game.reachable(game.gardener), p => gardenerValue(game, seat, p), style, random);
        if (pick) choices.push({ value: pick.value, command: { type: 'gardener', ...xy(pick.item) } });
    }
    if (actions.includes('panda')) {
        const pick = best(game.reachable(game.panda), p => pandaValue(game, seat, p), style, random);
        if (pick) choices.push({ value: pick.value, command: { type: 'panda', ...xy(pick.item) } });
    }
    if (actions.includes('irrigation')) {
        const pick = best(game.irrigationSpots(), e => irrigationValue(game, seat, e), style, random);
        if (pick) choices.push({ value: pick.value, command: { type: 'irrigate', a: pick.item[0], b: pick.item[1] } });
    }
    if (actions.includes('plot')) {
        const few = game.plots().length < 10;
        const plotCards = handCards(game, seat).filter(c => c.type === 'plot').length;
        choices.push({ value: (few ? 2.6 : 1.4) + plotCards * 0.5 + (random() * 2 - 1) * style.noise, command: { type: 'drawPlots' } });
    }
    if (actions.includes('objective')) {
        const h = player.hand.length;
        const value = h <= 1 ? 7 : (HAND_LIMIT - h) * 1.1;
        // 達成しやすそうな種類：パンダは竹があれば早い、区画は庭が広いほど早い
        const kind = CARD_TYPES.filter(t => game.decks[t].length > 0)
            .sort((a, b) => kindValue(game, b) - kindValue(game, a))[0];
        choices.push({ value: value + (random() * 2 - 1) * style.noise, command: { type: 'drawObjective', kind } });
    }
    if (choices.length === 0) return { type: 'endTurn' };
    choices.sort((a, b) => b.value - a.value);
    return choices[0].command;
}

function kindValue(game, kind) {
    const bamboo = game.plots().reduce((s, t) => s + t.bamboo, 0);
    if (kind === 'panda') return 1 + bamboo * 0.1;
    if (kind === 'plot') return 0.5 + game.plots().length * 0.08;
    return 0.8 + bamboo * 0.05;
}

// 雲：庭師の目標に要る改良を、その色の区画に置く。なければ灌漑されていない区画に池の改良
function cloudsCommand(game, seat) {
    const spots = game.improvableSpots().map(p => game.tileAt(...p));
    const available = IMPROVEMENTS.filter(i => game.tokens[i] > 0);
    if (available.length === 0) return { type: 'skip' };
    for (const card of handCards(game, seat)) {
        if (card.type !== 'gardener' || !IMPROVEMENTS.includes(card.improvement) || !available.includes(card.improvement)) continue;
        const target = spots.filter(t => t.color === card.color).sort((a, b) => b.bamboo - a.bamboo)[0];
        if (target) return { type: 'improve', improvement: card.improvement, q: target.q, r: target.r };
    }
    const dry = spots.find(t => !game.isIrrigated(t.q, t.r));
    if (dry && available.includes('watershed')) return { type: 'improve', improvement: 'watershed', q: dry.q, r: dry.r };
    if (available.includes('fertilizer') && spots.length) {
        const t = spots.find(s => game.isIrrigated(s.q, s.r)) ?? spots[0];
        return { type: 'improve', improvement: 'fertilizer', q: t.q, r: t.r };
    }
    return { type: 'skip' };
}

export const isCpuTurn = game => game.phase !== 'end' && game.players[game.current].isCPU;

// CPU の番なら1つ進める。進めたら true
export function runCpuStep(game, style = CPU_STYLES.normal) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    if (game.applyCommand(seat, chooseCommand(game, seat, style))) return true;
    // 想定していない形で断られたら、いちばん単純な答えで必ず進める
    const turn = game.turnState;
    if (turn.pending) return game.applyCommand(seat, turn.pending === 'choice' ? { type: 'weather', weather: 'sun' } : { type: 'skip' });
    if (turn.drawn) return game.applyCommand(seat, { type: 'placePlot', choice: 0, ...xy(game.plotSpots()[0]) });
    if (game.canEndTurn()) return game.applyCommand(seat, { type: 'endTurn' });
    const action = game.availableActions()[0];
    if (action === 'gardener') return game.applyCommand(seat, { type: 'gardener', ...xy(game.reachable(game.gardener)[0]) });
    if (action === 'panda') return game.applyCommand(seat, { type: 'panda', ...xy(game.reachable(game.panda)[0]) });
    if (action === 'plot') return game.applyCommand(seat, { type: 'drawPlots' });
    if (action === 'irrigation') {
        const [a, b] = game.irrigationSpots()[0];
        return game.applyCommand(seat, { type: 'irrigate', a, b });
    }
    return game.applyCommand(seat, { type: 'drawObjective', kind: CARD_TYPES.find(t => game.decks[t].length) });
}

export { progressOf };
