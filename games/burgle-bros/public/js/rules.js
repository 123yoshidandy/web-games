/**
 * 盤面の判定（動ける先・のぞける先・見張りの道など）
 * Game とビューのどちらにも使える。めくっていない部屋の中身（type・num）は見ない
 * state の形：{ floors: [{ tiles: [{ revealed, type, ... }], walls: ['a-b'], guard: { active, cell, dest, speed }, safe }], players, hacks, current, actionsLeft, turn }
 */

import { CELLS, MAX_DICE, MAX_HACK, ROOMS, neighbors, wallKey, idOf, floorOf, cellOf, safeLine } from './data.js';

export const tileAt = (state, f, cell) => state.floors[f]?.tiles[cell];
export const known = (state, f, cell, type) => {
    const t = tileAt(state, f, cell);
    return !!t?.revealed && (type === undefined || t.type === type);
};
export const hasWall = (state, f, a, b) => state.floors[f].walls.includes(wallKey(a, b));
export const activePlayers = (state) => state.players.filter(p => !p.escaped);
export const playersAt = (state, f, cell) => state.players.filter(p => !p.escaped && p.floor === f && p.cell === cell);
export const topFloor = (state) => state.floors.length - 1;
export const allCracked = (state) => state.floors.every(fl => fl.safe.cracked);

// 見張りが通れるとなり（壁のない方。隠し扉やダクトは使わない）
export const guardNeighbors = (state, f, cell) => neighbors(cell).filter(n => !hasWall(state, f, cell, n));

// 泥棒が通れるとなり（隠し扉は壁を抜ける。通気ダクトは同じ階のもう1つへ）
export function playerNeighbors(state, f, cell) {
    const list = neighbors(cell).filter(n => !hasWall(state, f, cell, n) || known(state, f, cell, 'secret') || known(state, f, n, 'secret'));
    if (known(state, f, cell, 'duct')) {
        const other = state.floors[f].tiles.findIndex((t, i) => i !== cell && t.revealed && t.type === 'duct');
        if (other >= 0 && !list.includes(other)) list.push(other);
    }
    return list;
}

// 部屋に誰か（泥棒か見張り）がいるか（かんぬき扉は、誰かいればふつうに入れる）
export function occupied(state, f, cell) {
    const g = state.floors[f].guard;
    return playersAt(state, f, cell).length > 0 || (g.active && g.cell === cell);
}

// 入るのに要るアクション（めくっていない部屋は1。開いていない暗証番号の扉は1で、ダイスに失敗すると入れない）
export function moveCost(state, f, cell) {
    const t = tileAt(state, f, cell);
    if (t.revealed && t.type === 'deadbolt' && !occupied(state, f, cell)) return 3;
    return 1;
}

// 動ける先（部屋の id）。アクションが足りない先は除く
export function moveTargets(state, seat) {
    const p = state.players[seat];
    if (!p || p.escaped) return [];
    return playerNeighbors(state, p.floor, p.cell)
        .filter(n => moveCost(state, p.floor, n) <= state.actionsLeft)
        .map(n => idOf(p.floor, n));
}

// のぞける先（めくっていない部屋の id）。ホークは壁ごしにも。吹き抜けからは真上・真下
export function peekTargets(state, seat) {
    const p = state.players[seat];
    if (!p || p.escaped) return [];
    const hawk = p.char === 'hawk';
    const cells = hawk ? neighbors(p.cell) : playerNeighbors(state, p.floor, p.cell);
    const list = cells.filter(n => !tileAt(state, p.floor, n).revealed).map(n => idOf(p.floor, n));
    if (known(state, p.floor, p.cell, 'atrium')) {
        [p.floor - 1, p.floor + 1].forEach(f => {
            if (state.floors[f] && !tileAt(state, f, p.cell).revealed) list.push(idOf(f, p.cell));
        });
    }
    return list;
}

export const peekCost = (state, seat) => (state.players[seat].char === 'hawk' && state.turn?.hawkFree ? 0 : 1);

export function canUp(state, seat) {
    const p = state.players[seat];
    return !p.escaped && p.floor < topFloor(state) && known(state, p.floor, p.cell, 'stairs');
}
export function canDown(state, seat) {
    const p = state.players[seat];
    return !p.escaped && p.floor > 0 && known(state, p.floor - 1, p.cell, 'stairs');
}
export function canRoof(state, seat) {
    const p = state.players[seat];
    return !p.escaped && p.floor === topFloor(state) && known(state, p.floor, p.cell, 'stairs') && allCracked(state);
}
export function canAddDie(state, seat) {
    const p = state.players[seat];
    const fl = state.floors[p.floor];
    return !p.escaped && known(state, p.floor, p.cell, 'safe') && !fl.safe.cracked && fl.safe.dice < MAX_DICE && state.actionsLeft >= 2;
}
export function canCrack(state, seat) {
    const p = state.players[seat];
    const fl = state.floors[p.floor];
    return !p.escaped && known(state, p.floor, p.cell, 'safe') && !fl.safe.cracked && fl.safe.dice > 0;
}
export function canHack(state, seat) {
    const p = state.players[seat];
    if (p.escaped || !tileAt(state, p.floor, p.cell).revealed) return false;
    const hack = ROOMS[tileAt(state, p.floor, p.cell).type]?.hack;
    return !!hack && state.hacks[hack] < MAX_HACK;
}
// 仕掛け屋が警報を鳴らせる先（壁のないとなり。見張りのいる部屋は除く）
export function juiceTargets(state, seat) {
    const p = state.players[seat];
    if (p.escaped || p.char !== 'juicer') return [];
    const g = state.floors[p.floor].guard;
    return guardNeighbors(state, p.floor, p.cell)
        .filter(n => !tileAt(state, p.floor, n).alarm && !(g.active && g.cell === n))
        .map(n => idOf(p.floor, n));
}
export function canSpot(state, seat) {
    const p = state.players[seat];
    const g = state.floors[p.floor]?.guard;
    return !p.escaped && p.char === 'spotter' && !!g?.active && (g.deckCount ?? g.deck?.length ?? 0) > 0;
}

// 見張りの道のりの表（target からの歩数）。壁の配列ごとに覚えておく（壁を壊すときは配列を置き換えるので、配列を鍵にできる）
const distanceCache = new WeakMap();
export function guardDistances(state, f, target) {
    const walls = state.floors[f].walls;
    let memo = distanceCache.get(walls);
    if (!memo) {
        memo = new Map();
        distanceCache.set(walls, memo);
    }
    if (!memo.has(target)) memo.set(target, computeDistances(state, f, target));
    return memo.get(target);
}

function computeDistances(state, f, target) {
    const dist = Array(CELLS).fill(Infinity);
    dist[target] = 0;
    const queue = [target];
    while (queue.length) {
        const c = queue.shift();
        guardNeighbors(state, f, c).forEach(n => {
            if (dist[n] === Infinity) {
                dist[n] = dist[c] + 1;
                queue.push(n);
            }
        });
    }
    return dist;
}

export const alarmCells = (state, f) => state.floors[f].tiles.map((t, i) => (t.alarm ? i : -1)).filter(i => i >= 0);

// 見張りが今向かう先：警報があればいちばん近い警報（同じ近さなら番号の小さい方）、なければ巡回の行き先
export function guardTarget(state, f, from = state.floors[f].guard.cell) {
    const alarms = alarmCells(state, f);
    if (!alarms.length) return state.floors[f].guard.dest;
    const dist = guardDistances(state, f, from);
    return alarms.reduce((best, c) => (dist[c] < dist[best] ? c : best), alarms[0]);
}

// 見張りの次の1歩（上・右・下・左の順に、近づく方）
export function guardStep(state, f, from, target) {
    if (from === target) return null;
    const dist = guardDistances(state, f, target);
    return guardNeighbors(state, f, from).find(n => dist[n] === dist[from] - 1) ?? null;
}


/**
 * 見張りの次の動きを、見えている情報だけで先読みする
 * times 回ぶん動かす（同じ階の手番の数）。巡回の行き先に着いたあとは次の行き先がわからないので、
 * 残りの歩数で届く範囲を maybe に入れる
 * 戻り値：{ sure: Set（必ず通る部屋）, maybe: Set（通るかもしれない部屋）, end: 最後の部屋（わからなければ null） }
 */
export function predictGuard(state, f, times = 1) {
    const g = state.floors[f].guard;
    const sure = new Set();
    const maybe = new Set();
    if (!g.active) return { sure, maybe, end: null };
    let cell = g.cell;
    let dest = g.dest;
    const alarms = new Set(alarmCells(state, f));
    const sim = { ...state, floors: state.floors.map((fl, i) => (i === f ? { ...fl, tiles: fl.tiles.map((t, c) => ({ ...t, alarm: alarms.has(c) })) } : fl)) };
    let unknownSteps = 0;
    for (let k = 0; k < times; k++) {
        let steps = g.speed;
        let reached = false;
        while (steps > 0) {
            if (alarms.has(cell)) {
                alarms.delete(cell);
                sim.floors[f].tiles[cell].alarm = false;
            }
            if (!alarms.size && cell === dest) {
                reached = true;
                break;
            }
            const target = alarms.size ? guardTarget(sim, f, cell) : dest;
            const next = guardStep(sim, f, cell, target);
            if (next === null) break;
            cell = next;
            sure.add(cell);
            steps--;
        }
        if (alarms.has(cell)) {
            alarms.delete(cell);
            sim.floors[f].tiles[cell].alarm = false;
        }
        if (reached || (!alarms.size && cell === dest)) {
            // 行き先に着いたら次の行き先はわからない。残りの歩数と、残りの回数ぶんの歩数
            unknownSteps = steps + (times - k - 1) * g.speed;
            break;
        }
    }
    if (unknownSteps > 0) {
        const dist = guardDistances(state, f, cell);
        dist.forEach((d, c) => { if (d <= unknownSteps) maybe.add(c); });
    }
    return { sure, maybe, end: unknownSteps > 0 ? null : cell };
}

// 金庫の位置（わかっていれば）
export const safeCell = (state, f) => state.floors[f].tiles.findIndex(t => t.revealed && t.type === 'safe');
export const stairsCell = (state, f) => state.floors[f].tiles.findIndex(t => t.revealed && t.type === 'stairs');

// 金庫の列と行の部屋のうち、まだ解錠の印のないもの
export function safeNeeds(state, f) {
    const s = safeCell(state, f);
    if (s < 0) return null;
    return safeLine(s).filter(c => !tileAt(state, f, c).cracked);
}

export { idOf, floorOf, cellOf };

/**
 * 見張りが次の times 回の動きで、それぞれの部屋に入る確率（見えている情報だけで計算する）
 * 巡回の行き先に着いたら、まだ引かれていないカード（捨て札にないカード）から等しい確率で次の行き先が出るとして枝分かれする
 * 枝分かれは2回まで。それより先は、残りの歩数で届く範囲に薄く広げる
 */
export function guardRisk(state, f, times = 1) {
    const risk = Array(CELLS).fill(0);
    const g = state.floors[f].guard;
    if (!g.active) return risk;
    const discard = new Set(g.discard ?? []);
    const remaining0 = Array.from({ length: CELLS }, (_, i) => i).filter(i => !discard.has(i));
    const alarms0 = alarmCells(state, f);
    const visit = (cell, dest, alarms, deck, speed, movesLeft, stepsLeft, weight, seen, depth) => {
        for (;;) {
            if (stepsLeft === 0) {
                if (movesLeft <= 1) break;
                movesLeft--;
                stepsLeft = speed;
            }
            if (alarms.includes(cell)) alarms = alarms.filter(c => c !== cell);
            if (!alarms.length && cell === dest) {
                // 次の行き先で枝分かれ
                let pool = deck.filter(c => c !== cell);
                let nextSpeed = speed;
                if (!deck.length) {
                    pool = Array.from({ length: CELLS }, (_, i) => i).filter(c => c !== cell);
                    nextSpeed = Math.min(6, speed + 1);
                }
                const total = stepsLeft + (movesLeft - 1) * nextSpeed;
                if (depth >= 2 || !pool.length) {
                    const dist = guardDistances(state, f, cell);
                    const reach = Array.from({ length: CELLS }, (_, c) => c).filter(c => dist[c] <= total && c !== cell);
                    reach.forEach(c => { seen.set(c, Math.max(seen.get(c) ?? 0, 0.5)); });
                    break;
                }
                pool.forEach(next => {
                    visit(cell, next, alarms, (deck.length ? deck : pool).filter(c => c !== next), nextSpeed, movesLeft, stepsLeft, weight / pool.length, new Map(seen), depth + 1);
                });
                return;
            }
            const sim = alarms.length ? { ...state, floors: state.floors.map((fl, i) => (i === f ? { ...fl, tiles: fl.tiles.map((t, c) => ({ ...t, alarm: alarms.includes(c) })) } : fl)) } : null;
            const target = alarms.length ? guardTarget(sim, f, cell) : dest;
            const next = guardStep(state, f, cell, target);
            if (next === null) break;
            cell = next;
            seen.set(cell, 1);
            stepsLeft--;
        }
        seen.forEach((p, c) => { risk[c] += weight * p; });
    };
    visit(g.cell, g.dest, alarms0, remaining0, g.speed, times, g.speed, 1, new Map(), 0);
    return risk.map(r => Math.min(1, r));
}
