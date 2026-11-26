/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（公開の情報だけ）を見て、今できる操作を列挙し、見積もりの一番高いものを選ぶ。山の並びはのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：
 * - 置く：すぐ入る点（地域を埋めた点・色のボーナス・家畜・見張り塔）＋タイルの値打ち＋地域の埋まり具合 − 労働者の費用
 * - 取る・買う：今置けるマスがあるタイルを高く見る（置ける場所がまだないタイルは半分、色が埋まっていれば0）
 * - 売る：商品の点と銀貨。労働者は手が尽きたときと、労働者が少ないとき
 * - タイルの値打ち：城（追加の行動）、鉱山（残りのフェーズの銀貨）、知識（番号ごと）、建物（効果ごと）、家畜（頭数と同じ牧草地の家畜）、船（取れる商品と手番の順）
 * やさしい：同じ見積もりに大きな迷いを足し、労働者を2つ以上使う手は選ばない。買い物はほとんどしない
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { CELLS, REGIONS, TILES, REGION_POINTS, PHASE_BONUS, SELL_POINTS, COLOR_BONUS, STORAGE } from './data.js';
import { workersNeeded, placeProblem, kindFull, animalPoints, knowledgeOf, goodsAfterShip } from './rules.js';

export const CPU_LEVELS = ['easy', 'normal'];

const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

const WORKER_COST = 0.9;
const KNOWLEDGE_VALUE = { 1: 1.5, 2: 2, 3: 3, 4: 2.5, 5: 2, 6: 2.5, 7: 3, 8: 3, 9: 2.5, 10: 2.5, 11: 2.5, 12: 3, 13: 2.5, 14: 3, 15: 6, 24: 6, 25: 6, 26: 4 };
const BUILDING_VALUE = { warehouse: 3, carpenter: 3, church: 3.5, market: 3.5, boardingHouse: 3, bank: 3, cityHall: 4, watchtower: 4 };

// ---- 見積もり ----

const goodsCount = (p) => Object.values(p.goods).reduce((s, v) => s + v, 0);

// タイルを置いたときの効果の値打ち（すぐ入る点は別に数える）
function tileWorth(view, me, tileId) {
    const t = TILES[tileId];
    const phasesLeft = 5 - view.phase;
    switch (t.kind) {
        case 'castle': return 5;
        case 'mine': return 1 + phasesLeft * 1.3;
        case 'knowledge': return (KNOWLEDGE_VALUE[t.knowledge] ?? 4) * (t.knowledge >= 15 ? 1 : Math.max(0.4, phasesLeft / 5));
        case 'building': {
            if (t.building === 'warehouse') return 1 + goodsBest(view, me);
            return BUILDING_VALUE[t.building];
        }
        case 'animal': return t.count * 1.2;
        case 'ship': return 2.5 + Math.min(4, Math.max(0, ...view.depotGoods.map(g => g.length))) * 1.2;
        default: return 1;
    }
}

// 一番多い商品を売ったときの点
function goodsBest(view, me) {
    const most = Math.max(0, ...Object.values(me.goods));
    return most * SELL_POINTS[view.players.length] + (most ? 1.5 : 0);
}

// 保管場所のタイルとして持つ値打ち（置けるマスがあるか）
function holdValue(view, me, tileId) {
    const t = TILES[tileId];
    if (kindFull(me, t.kind)) return 0;
    const now = CELLS.some(c => !placeProblem(me, tileId, c.id));
    const reach = now ? 1 : 0.5;
    return tileWorth(view, me, tileId) * reach + (now ? 1 : 0);
}

// 置いたときにすぐ入る点
function placePoints(view, me, tileId, cellId) {
    const t = TILES[tileId];
    const estate = [...me.estate];
    estate[cellId] = tileId;
    const after = { ...me, estate };
    let points = 0;
    const region = REGIONS[CELLS[cellId].region];
    const filled = region.cells.filter(c => estate[c] !== null).length;
    if (filled === region.cells.length) points += REGION_POINTS[region.cells.length] + PHASE_BONUS[view.phase];
    else points += (filled / region.cells.length) * REGION_POINTS[region.cells.length] * 0.25;
    if (kindFull(after, t.kind) && view.bonusClaims[t.kind].length < 2) points += COLOR_BONUS[view.players.length][view.bonusClaims[t.kind].length];
    if (t.kind === 'animal') points += animalPoints(me, tileId, cellId);
    if (t.building === 'watchtower') points += 4;
    return points;
}

// 保管場所がいっぱいのときに捨てる位置（値打ちの一番低いタイル）
function discardIndex(view, me) {
    if (me.storage.length < STORAGE) return undefined;
    let worst = 0;
    me.storage.forEach((t, i) => { if (holdValue(view, me, t) < holdValue(view, me, me.storage[worst])) worst = i; });
    return worst;
}

// ---- 操作の列挙 ----

export function candidates(view) {
    const me = view.players[view.you];
    const top = view.pending.at(-1);
    const list = [];
    const k = knowledgeOf(me);
    const discard = discardIndex(view, me);
    const discardLoss = discard === undefined ? 0 : holdValue(view, me, me.storage[discard]);
    const takeOptions = (die, cost, filter = () => true) => {
        view.depots.forEach((slots, depot) => slots.forEach((s, slot) => {
            if (s.tile === null || !filter(s.tile)) return;
            const c = typeof cost === 'function' ? cost(depot) : cost;
            if (c > me.workers) return;
            list.push({ command: { type: 'take', die, depot, slot, ...(discard !== undefined ? { discard } : {}) }, value: holdValue(view, me, s.tile) * 0.75 - c * WORKER_COST - discardLoss * 0.75, cost: c });
        }));
    };
    const placeOptions = (die, costFor) => {
        me.storage.forEach(tile => CELLS.forEach(cell => {
            if (placeProblem(me, tile, cell.id)) return;
            const c = costFor(tile, cell);
            if (c > me.workers) return;
            const value = placePoints(view, me, tile, cell.id) + tileWorth(view, me, tile) + 2 - c * WORKER_COST;
            list.push({ command: { type: 'place', die, tile, cell: cell.id }, value, cost: c });
        }));
    };
    const sellOptions = (die, costFor) => {
        Object.keys(me.goods).map(Number).filter(g => me.goods[g] > 0).forEach(g => {
            const c = costFor(g);
            if (c > me.workers) return;
            const value = me.goods[g] * SELL_POINTS[view.players.length] + (k.has(3) ? 3 : 1.5) + (k.has(25) ? me.goods[g] : 0) - c * WORKER_COST - (view.phase < 4 && me.goods[g] === 1 ? 1 : 0);
            list.push({ command: { type: 'sell', die, goods: g }, value, cost: c });
        });
    };
    const workerValue = 1.2 + (me.workers < 2 ? 1.5 : 0) + (k.has(14) ? 1 : 0) + (k.has(13) ? 1 : 0);

    if (top) {
        if (top.kind === 'ship') {
            view.depotGoods.forEach((g, d) => {
                if (g.length) list.push({ command: { type: 'ship', depots: [d] }, value: shipValue(view, me, [d]) });
                const e = (d + 1) % 6;
                if (k.has(5) && (g.length || view.depotGoods[e].length)) list.push({ command: { type: 'ship', depots: [d, e] }, value: shipValue(view, me, [d, e]) });
            });
        }
        if (top.kind === 'castle') {
            takeOptions('bonus', 0);
            placeOptions('bonus', () => 0);
            sellOptions('bonus', () => 0);
            list.push({ command: { type: 'workers', die: 'bonus' }, value: workerValue });
        }
        if (top.kind === 'cityHall') placeOptions('bonus', () => 0);
        if (top.kind === 'warehouse') sellOptions('bonus', () => 0);
        if (top.kind === 'pick') takeOptions('bonus', 0, t => top.kinds.includes(TILES[t].kind));
        list.push({ command: { type: 'skip' }, value: -2 });
        return list;
    }
    [0, 1].filter(i => !me.used[i]).forEach(i => {
        const v = me.dice[i];
        takeOptions(i, depot => workersNeeded(me, v, depot + 1, 'take'));
        placeOptions(i, (tile, cell) => workersNeeded(me, v, cell.die, 'place', TILES[tile].kind));
        sellOptions(i, g => workersNeeded(me, v, g, 'sell'));
        list.push({ command: { type: 'workers', die: i }, value: workerValue, cost: 0 });
    });
    if (!view.turn.bought && me.silver >= 2) {
        const price = 2.6;
        view.black.forEach((t, slot) => {
            if (t !== null) list.push({ command: { type: 'buy', depot: -1, slot, ...(discard !== undefined ? { discard } : {}) }, value: holdValue(view, me, t) * 0.75 - price - discardLoss * 0.75, buy: true });
        });
        if (k.has(6)) {
            view.depots.forEach((slots, depot) => slots.forEach((s, slot) => {
                if (s.tile !== null) list.push({ command: { type: 'buy', depot, slot, ...(discard !== undefined ? { discard } : {}) }, value: holdValue(view, me, s.tile) * 0.75 - price - discardLoss * 0.75, buy: true });
            }));
        }
    }
    if (me.used.every(Boolean)) list.push({ command: { type: 'end' }, value: 0 });
    return list;
}

function shipValue(view, me, depots) {
    const incoming = depots.flatMap(d => view.depotGoods[d]);
    const { taken } = goodsAfterShip(me.goods, incoming);
    return taken.length * 1.5 + 0.5;
}

// ---- 手を選ぶ ----

// ヒント：人が操作する番に、CPU（ふつう）が選ぶ操作。CPU と同じく、その人のビューだけで決める。手は打たない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return chooseCommand(game, seat, 'normal');
}

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    const rand = cpuRandom(game, seat);
    const easy = level === 'easy';
    let list = candidates(view);
    if (easy) {
        list = list.filter(c => !(c.cost >= 2) && !(c.buy && rand() < 0.8));
        list.forEach(c => { c.value += rand() * 4; });
    } else {
        list.forEach(c => { c.value += rand() * 0.05; });
    }
    if (!list.length) return null;
    // 買い物は、見積もりがプラスのときだけ。終えるのは、ほかにすることがないとき
    const best = list.filter(c => !(c.buy && c.value <= 0) && c.command.type !== 'end').sort((a, b) => b.value - a.value)[0];
    const end = list.find(c => c.command.type === 'end');
    if (end && (!best || best.value <= 0 || best.command.type === 'workers' || best.command.type === 'skip')) return end.command;
    return (best ?? end ?? list[0]).command;
}

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 答えを待っている CPU に1手打たせる。思わぬ選択を求められたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    let command = null;
    try {
        command = chooseCommand(game, seat, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const fallbacks = [{ type: 'skip' }, { type: 'workers', die: 0 }, { type: 'workers', die: 1 }, { type: 'workers', die: 'bonus' }, { type: 'end' }];
    for (const fallback of fallbacks) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}
