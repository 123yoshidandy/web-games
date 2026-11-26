/**
 * CPU の手の決め方。ビューだけを見て決める（ほかの人の手札や山の並びは見ない）
 * - やさしい：建てられるマスから、ほぼでたらめに選ぶ（場所の隣は少し好む）。建てる場所タイルは気まぐれに使う
 * - ふつう：1手ごとに、置いたあとの自分の得点（王のカード3枚と城）と、持っている場所タイルの値打ちを比べて、いちばん良い手を選ぶ
 *           必須の3軒を建ててから、得になる場所タイルを使う
 * 判断にゲームの乱数は使わない（記録の再現がずれるため）。揺らぎが要るときは、ビューから作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { LOCATIONS } from './boards.js';
import { NEIGHBORS } from './hex.js';
import { buildTargets, tileTargets, moveSources, usableTiles, scorePlayer, sectorCounts } from './rules.js';

export const CPU_LEVELS = ['easy', 'normal'];

export const isCpuTurn = (game) => game.phase === 'play' && game.players[game.active].isCPU;

// ビューから決まる乱数（同じビューなら同じ手になる）
function viewRandom(view) {
    let h = (view.commandCount * 2654435761) ^ (view.turn * 40503);
    view.owner.forEach((o, i) => { if (o >= 0) h = Math.imul(h ^ (i * 31 + o), 16777619); });
    return createRandom(h >>> 0);
}

// ---- やさしい ----

function chooseEasy(view) {
    const seat = view.you;
    const rand = viewRandom(view);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    if (!view.mandatoryDone) {
        const targets = buildTargets(view, seat);
        const nearLoc = targets.filter(cell => NEIGHBORS[cell].some(n => view.terrain[n] === 'L'));
        return { type: 'build', cell: pick(nearLoc.length && rand() < 0.5 ? nearLoc : targets) };
    }
    const build = usableTiles(view, seat).filter(t => LOCATIONS[t].kind === 'build');
    if (build.length && rand() < 0.7) {
        const tile = pick(build);
        return { type: 'tile', tile, cell: pick(tileTargets(view, seat, tile)) };
    }
    return { type: 'end' };
}

// ---- ふつう ----

// 場所タイル1枚の値打ち。残りの手番が多いほど高い（建てるタイルは毎手番1軒ふえる）
function tileWorth(view, type) {
    const minSupply = Math.min(...view.players.map(p => p.supply));
    const turnsLeft = Math.max(0, minSupply / 4 - 0.5);
    const per = LOCATIONS[type].kind === 'build' ? 1.6 : 0.8;
    return Math.min(9, per * turnsLeft) + 0.5;
}

// 盤面を評価する。work の owner を一時的に書き換えて呼ぶ
function evaluate(work, seat, tiles) {
    const score = scorePlayer(work, seat, sectorCounts(work)).total;
    return score + tiles.reduce((sum, t) => sum + tileWorth(work, t.type), 0);
}

// cell に自分の家が来たときに取れるタイル（持っていない・失っていない場所で、残りがあるもの）
function gainedTiles(work, seat, cell, held) {
    const out = [];
    const lost = work.players[seat].lost ?? [];
    for (const n of NEIGHBORS[cell]) {
        if (work.terrain[n] !== 'L' || held.some(t => t.loc === n) || lost.includes(n)) continue;
        const loc = work.locations.find(l => l.cell === n);
        if (loc.tiles > 0) out.push({ type: loc.type, loc: n });
    }
    return out;
}

// 家を from（-1 なら手元）から to へ置いたときの評価。owner は元に戻す
function evalPlacement(work, seat, from, to) {
    const held = work.players[seat].tiles;
    if (from >= 0) work.owner[from] = -1;
    work.owner[to] = seat;
    let tiles = [...held, ...gainedTiles(work, seat, to, held)];
    if (from >= 0) tiles = tiles.filter(t => NEIGHBORS[t.loc].some(n => work.owner[n] === seat));
    const value = evaluate(work, seat, tiles) + tieBreak(work, seat, to);
    work.owner[to] = -1;
    if (from >= 0) work.owner[from] = seat;
    return value;
}

// 同じ得点なら、まだタイルが残る場所に近く、手札の地形に縛られにくいマスを選ぶ
function tieBreak(work, seat, cell) {
    let bonus = 0;
    for (const n of NEIGHBORS[cell]) {
        if (work.owner[n] !== -1) continue;
        for (const m of NEIGHBORS[n]) {
            if (work.terrain[m] !== 'L' || work.players[seat].tiles.some(t => t.loc === m)) continue;
            if (work.locations.find(l => l.cell === m).tiles > 0) bonus += 0.15;
        }
    }
    return bonus - cell * 1e-6;
}

function bestOf(list) {
    let best = null;
    for (const item of list) if (!best || item.value > best.value) best = item;
    return best;
}

function bestTileUse(work, seat, type) {
    if (LOCATIONS[type].kind === 'build') {
        return bestOf(tileTargets(work, seat, type).map(cell => ({ command: { type: 'tile', tile: type, cell }, value: evalPlacement(work, seat, -1, cell) })));
    }
    // 動かす家は、取り除いても損の少ないものから6軒まで試す
    const sources = moveSources(work, seat, type);
    const loss = sources.map(from => {
        work.owner[from] = -1;
        const tiles = work.players[seat].tiles.filter(t => NEIGHBORS[t.loc].some(n => work.owner[n] === seat));
        const value = evaluate(work, seat, tiles);
        work.owner[from] = seat;
        return { from, value };
    }).sort((a, b) => b.value - a.value || a.from - b.from).slice(0, 6);
    return bestOf(loss.flatMap(({ from }) => tileTargets(work, seat, type, from)
        .map(cell => ({ command: { type: 'tile', tile: type, from, cell }, value: evalPlacement(work, seat, from, cell) }))));
}

function chooseNormal(view) {
    const seat = view.you;
    const work = { ...view, owner: [...view.owner] };
    if (!view.mandatoryDone) {
        const best = bestOf(buildTargets(work, seat).map(cell => ({ cell, value: evalPlacement(work, seat, -1, cell) })));
        return { type: 'build', cell: best.cell };
    }
    const now = evaluate(work, seat, view.players[seat].tiles);
    const uses = usableTiles(work, seat).map(type => bestTileUse(work, seat, type)).filter(Boolean);
    const best = bestOf(uses);
    // 動かすタイルは得になるときだけ。建てるタイルは家が1軒ふえるので、損をしなければ使う
    if (best && best.value > now + (best.command.from !== undefined ? 0.3 : -0.5)) return best.command;
    return { type: 'end' };
}

/**
 * ビューから次の1手を決める
 */
export function chooseCommand(view, level = 'normal') {
    if (view.phase !== 'play' || view.active !== view.you) return null;
    return level === 'easy' ? chooseEasy(view) : chooseNormal(view);
}

// いちばん単純な手（決めた手が通らなかったときの逃げ道）
function fallbacks(game, seat) {
    const list = [];
    if (!game.mandatoryDone) {
        const cell = buildTargets(game, seat)[0];
        if (cell !== undefined) list.push({ type: 'build', cell });
    }
    list.push({ type: 'end' });
    return list;
}

/**
 * CPU の番なら1手打つ。打てたら true
 */
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.active;
    const player = game.players[seat];
    let command = null;
    try {
        command = chooseCommand(createGameView(game, seat, { events: false }), player.cpuLevel ?? 'normal');
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return fallbacks(game, seat).some(c => game.applyCommand(seat, c));
}


// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(game.phase === 'play' && game.active === seat)) return null;
    return chooseCommand(createGameView(game, seat, { events: false }), 'normal');
}
