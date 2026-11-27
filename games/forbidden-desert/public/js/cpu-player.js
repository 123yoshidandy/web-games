/**
 * CPU（仲間）とヒント
 * 手番の人の「やること」（掘り出す・部品を拾う・水をくむ／渡す・砂を取り除く・発射台へ集まる）を、
 * 得られるものと必要な行動の数で比べ、いちばん効率のよいものへ1手進める。1手ごとに選び直す
 * 見る情報は、画面と同じ公開の情報だけ（裏のタイルの中身・山の並びは見ない。地中鏡でのぞいたタイルは使う）
 * ゲームの乱数は使わない（同じ局面なら同じ手）。状態は変えない
 */

import {
    CELLS, BLOCKED, SAND_TOTAL, PARTS, ROLE_BY_KEY, GEAR_CARDS, STORM_CARDS, adjacent
} from './data.js';

const SUN_RATE = 4 / STORM_CARDS.length;

// CPU が打つ手があるか（CPU の手番か、手番でない CPU の仲間が水を分ける・日よけを広げるなど）
export function isCpuTurn(game) {
    if (game.isOver()) return false;
    return game.players[game.current].isCPU || offTurnCommand(game) !== null;
}

// 手番でない CPU の仲間の、行動を使わない手 { seat, command }
function offTurnCommand(game) {
    for (const p of game.players) {
        if (!p.isCPU || p.id === game.current) continue;
        const command = freeCommand(game, p.id, { offTurn: true });
        if (command) return { seat: p.id, command };
    }
    return null;
}

// CPU の席の手番なら1手打つ（手番でない CPU の仲間が水を分けるのを先にする）。seat を渡せば、その席（手番の人）の代わりに打つ
export function runCpuStep(game, seat = null) {
    if (game.isOver()) return false;
    if (seat === null) {
        const off = offTurnCommand(game);
        if (off && game.applyCommand(off.seat, off.command)) return true;
    }
    const s = seat ?? game.current;
    if (s !== game.current) return false;
    if (seat === null && !game.players[s].isCPU) return false;
    const command = chooseCommand(game, s);
    if (command && game.applyCommand(s, command)) return true;
    // 思わぬ形で通らなかったら、いちばん単純な手で先へ進める
    return game.applyCommand(s, game.phase === 'storm' ? { type: 'storm' } : { type: 'pass' });
}

// ヒント：手番の人のおすすめの手（状態は変えない）。手番でなければ null
export function suggest(game, seat) {
    if (game.isOver() || seat !== game.current) return null;
    return chooseCommand(game, seat);
}

// ---- 公開の情報 ----

// 見えているタイルの種類（掘り出したか、のぞいたもの）。見えなければ null
const knownKind = (game, tile) => (tile.revealed || game.peeked.includes(tile.id) ? tile.kind : null);
const digRate = (game, seat) => (game.players[seat].role === 'archeologist' ? 2 : 1);
const maxWater = (p) => ROLE_BY_KEY[p.role].water;

// 次に自分で水を手に入れられるまでに、日差しを受けそうな回数
function expectedSuns(game) {
    return game.players.length * game.stormDraws() * SUN_RATE;
}

// 足りない水（0 なら安心）
function deficit(game, p) {
    const need = Math.ceil(expectedSuns(game) * 1.2);
    return Math.max(0, need - p.water);
}

function sandPressure(game) {
    const r = game.sandOnBoard() / SAND_TOTAL;
    return 5 * r * r;
}

// 全員が掘り出した発射台に集まれば勝ち
const padTile = (game) => game.tiles.find(t => t.kind === 'launch');
const padKnown = (game) => {
    const pad = padTile(game);
    return knownKind(game, pad) ? pad : null;
};

// ---- 道のり ----

// 自分のいるマスから各マスへの行動の数（砂でふさがったマスは、入れるまで砂を取り除く分を足す）
function distances(game, seat) {
    const rate = digRate(game, seat);
    const start = game.playerPos(seat);
    const dist = new Array(CELLS).fill(Infinity);
    const prev = new Array(CELLS).fill(-1);
    const climber = game.players[seat].role === 'climber';
    const diag = game.diagonal(seat);
    const clearCost = (pos) => {
        const t = game.tileAt(pos);
        return climber || t.sand < BLOCKED ? 0 : Math.ceil((t.sand - 1) / rate);
    };
    const own = game.tileAt(start);
    dist[start] = game.canLeave(seat) ? 0 : Math.ceil((own.sand - 1) / rate);
    const done = new Array(CELLS).fill(false);
    const tunnels = game.tiles.filter(t => t.kind === 'tunnel' && t.revealed && t.sand < BLOCKED).map(t => game.posOf(t.id));
    for (;;) {
        let u = -1;
        for (let p = 0; p < CELLS; p++) if (!done[p] && dist[p] < Infinity && (u < 0 || dist[p] < dist[u])) u = p;
        if (u < 0) break;
        done[u] = true;
        const next = adjacent(u, diag).filter(p => game.tileAt(p)).map(p => [p, 1 + clearCost(p)]);
        if (tunnels.includes(u)) tunnels.forEach(p => p !== u && next.push([p, 1]));
        next.forEach(([p, w]) => {
            if (dist[u] + w < dist[p]) {
                dist[p] = dist[u] + w;
                prev[p] = u;
            }
        });
    }
    return { dist, prev, start };
}

// target へ向かう最初の1手
function stepToward(game, seat, route, target, { clearTarget = false } = {}) {
    const me = game.players[seat];
    const climber = me.role === 'climber';
    if (!game.canLeave(seat)) return { type: 'dig', at: route.start };
    let step = target;
    while (route.prev[step] !== route.start && route.prev[step] >= 0) step = route.prev[step];
    if (route.prev[step] !== route.start) return null;
    const tile = game.tileAt(step);
    const isTunnelJump = !adjacent(route.start, game.diagonal(seat)).includes(step);
    if (isTunnelJump) return { type: 'tunnel', to: step };
    // 行き先のマスは、入る前に砂を取り除いておく（掘り出す・拾うには砂が0であること）
    if (step === target && clearTarget && tile.sand > 0) return { type: 'dig', at: step };
    if (!climber && tile.sand >= BLOCKED) return { type: 'dig', at: step };
    return { type: 'move', to: step };
}

// ---- やること ----

function tasks(game, seat, route) {
    const me = game.players[seat];
    const rate = digRate(game, seat);
    const list = [];
    const pressure = sandPressure(game);
    const found = game.partsFound();
    const pad = padKnown(game);
    const myDeficit = deficit(game, me);
    const carrier = game.players.find(p => p.role === 'waterCarrier');
    const wells = game.tiles.filter(t => t.kind === 'water' && t.revealed);
    // 残りの砂を取り除く行動の数（入るときにふさがっていたマスは、1つ残っている）
    const finishDigs = (pos) => {
        const t = game.tileAt(pos);
        const left = pos !== route.start && me.role !== 'climber' && t.sand >= BLOCKED ? 1 : (pos === route.start && !game.canLeave(seat) ? 1 : t.sand);
        return Math.ceil(left / rate);
    };
    const unknownDesert = game.tiles.filter(t => !knownKind(game, t) && t.back === 'desert').length;
    const unknownWater = game.tiles.filter(t => !knownKind(game, t) && t.back === 'water');
    const mirageKnown = game.tiles.some(t => t.kind === 'mirage' && knownKind(game, t));
    // 部品の手がかりが片方だけ出ている部品の数（もう片方を掘ると場所がわかる）
    const halfClues = PARTS.filter(p => {
        const cs = game.tiles.filter(t => t.kind === 'clue' && t.part === p.key);
        return cs.filter(t => t.revealed).length === 1;
    }).length;

    // 掘り出す
    for (let pos = 0; pos < CELLS; pos++) {
        const t = game.tileAt(pos);
        if (!t || t.revealed || route.dist[pos] === Infinity) continue;
        const kind = knownKind(game, t);
        let value = 10;
        if (kind === 'clue') {
            const partner = game.tiles.find(x => x.kind === 'clue' && x.part === t.part && x.id !== t.id);
            value = partner.revealed ? 34 : 16;
        } else if (kind === 'launch') value = found === PARTS.length ? 60 : 12;
        else if (kind === 'water') value = 12 + 14 * Math.min(2, myDeficit) + (carrier ? 6 : 0);
        else if (kind === 'mirage') value = 4;
        else if (kind) value = 9;
        else if (t.back === 'water') {
            const real = mirageKnown ? 1 : (unknownWater.length ? Math.min(1, (unknownWater.length - 1) / unknownWater.length + 0.0) : 0.66);
            value = 10 + real * (14 * Math.min(2, myDeficit) + (carrier ? 6 : 0));
        } else {
            // 中身のわからない砂漠のタイル：手がかりの片割れや発射台が出るかもしれない
            value = 10 + (halfClues * 4) / Math.max(1, unknownDesert) * 6;
            if (found === PARTS.length && !pad) value += 30 / Math.max(1, unknownDesert) + 10;
        }
        list.push({ kind: 'excavate', pos, value, cost: route.dist[pos] + finishDigs(pos) + 1, final: { type: 'excavate' }, clear: true });
    }

    // 部品を拾う
    game.parts.forEach(p => {
        if (p.state !== 'placed' || p.tile === null) return;
        const pos = game.posOf(p.tile);
        if (route.dist[pos] === Infinity) return;
        list.push({ kind: 'pickup', pos, value: 45, cost: route.dist[pos] + finishDigs(pos) + 1, final: { type: 'pickup' }, clear: true });
    });

    // 発射台へ集まる
    if (found === PARTS.length && pad && pad.revealed) {
        const pos = game.posOf(pad.id);
        if (route.dist[pos] < Infinity && me.tile !== pad.id) list.push({ kind: 'gather', pos, value: 120, cost: route.dist[pos] });
        if (me.tile === pad.id && pad.sand >= BLOCKED) list.push({ kind: 'dig', pos, value: 50, cost: 1, final: { type: 'dig', at: pos }, here: true });
    }

    // 水：水運びは井戸でくみ、渇いた仲間へ届ける。ほかの人は水運びのところへ行く
    const teamNeed = game.players.reduce((s, p) => s + deficit(game, p), 0);
    if (me.role === 'waterCarrier') {
        const missing = maxWater(me) - me.water;
        if (missing > 0) {
            wells.forEach(w => {
                const pos = game.posOf(w.id);
                if (route.dist[pos] === Infinity) return;
                const value = 14 * Math.min(2, missing) + 10 * Math.min(4, teamNeed);
                list.push({ kind: 'collect', pos, value, cost: route.dist[pos] + 1, final: { type: 'collect' } });
            });
        }
        game.players.forEach(q => {
            if (q.id === seat) return;
            const need = Math.min(deficit(game, q), me.water - 1);
            if (need <= 0) return;
            const qpos = game.playerPos(q.id);
            // 同じか、となりのマスまで行けば渡せる
            const spots = [qpos, ...adjacent(qpos, false)].filter(p => game.tileAt(p) && route.dist[p] < Infinity);
            if (!spots.length) return;
            const best = spots.reduce((a, b) => (route.dist[b] < route.dist[a] ? b : a));
            list.push({ kind: 'deliver', pos: best, value: 16 * need, cost: Math.max(0.5, route.dist[best]) });
        });
    } else if (myDeficit > 0) {
        if (carrier && carrier.water > 1) {
            const cpos = game.playerPos(carrier.id);
            if (route.dist[cpos] < Infinity && cpos !== route.start) list.push({ kind: 'seek', pos: cpos, value: 12 * myDeficit, cost: route.dist[cpos] });
        }
        // トンネルの中なら日差しを受けない
        game.tiles.filter(t => t.kind === 'tunnel' && t.revealed).forEach(t => {
            const pos = game.posOf(t.id);
            if (route.dist[pos] < Infinity && pos !== route.start) list.push({ kind: 'shelter', pos, value: 9 * myDeficit, cost: route.dist[pos] });
        });
    }
    // 水に余裕のある人は、渇いた仲間のところへ行く
    if (me.role !== 'waterCarrier' && me.water >= 3) {
        game.players.forEach(q => {
            if (q.id === seat || deficit(game, q) <= 0) return;
            const qpos = game.playerPos(q.id);
            if (qpos === route.start || route.dist[qpos] === Infinity) return;
            list.push({ kind: 'deliver', pos: qpos, value: 8 * Math.min(deficit(game, q), me.water - 2), cost: route.dist[qpos] });
        });
    }

    // 砂を取り除く（自分のマスと、となり）
    game.reach(seat).forEach(pos => {
        const t = game.tileAt(pos);
        if (t.sand <= 0) return;
        const n = Math.min(t.sand, rate);
        let per = 1.2 + pressure;
        if (!t.revealed) per += 1.5;
        if (game.parts.some(p => p.state === 'placed' && p.tile === t.id)) per += 4;
        if (t.sand >= BLOCKED && game.players.some(p => p.tile === t.id)) per += 3;
        if (t.kind === 'launch' && t.revealed && found === PARTS.length) per += 6;
        list.push({ kind: 'dig', pos, value: per * n, cost: 1, final: { type: 'dig', at: pos }, here: true });
    });

    // 気象学者：引く嵐のカードを減らす
    if (me.role === 'meteorologist' && game.calmed < game.stormDraws()) {
        const sunCost = game.players.reduce((s, p) => s + (p.water <= 1 ? 8 : p.water <= 2 ? 4 : 1.5), 0) * SUN_RATE;
        list.push({ kind: 'calm', pos: route.start, value: 1.5 * (2.7 + pressure) + sunCost, cost: 1, final: { type: 'calm' }, here: true });
    }

    // 航海士：仲間を発射台へ運ぶ
    if (me.role === 'navigator' && found === PARTS.length && pad && pad.revealed) {
        game.players.forEach(q => {
            if (q.id === seat || q.tile === pad.id) return;
            const path = shortPath(game, q.id, game.posOf(pad.id), 3);
            if (path) list.push({ kind: 'navigate', pos: route.start, value: 100, cost: 1, final: { type: 'navigate', who: q.id, path }, here: true });
        });
    }
    return list;
}

// 各マスから、いちばん近いトンネルまでの行動の数
function shelterDistances(game, seat, tunnels) {
    const rate = digRate(game, seat);
    const climber = game.players[seat].role === 'climber';
    const diag = game.diagonal(seat);
    const clearCost = (pos) => {
        const t = game.tileAt(pos);
        return climber || t.sand < BLOCKED ? 0 : Math.ceil((t.sand - 1) / rate);
    };
    const dist = new Array(CELLS).fill(Infinity);
    tunnels.forEach(p => { dist[p] = 0; });
    const done = new Array(CELLS).fill(false);
    for (;;) {
        let u = -1;
        for (let p = 0; p < CELLS; p++) if (!done[p] && dist[p] < Infinity && (u < 0 || dist[p] < dist[u])) u = p;
        if (u < 0) break;
        done[u] = true;
        adjacent(u, diag).filter(p => game.tileAt(p)).forEach(p => {
            const w = dist[u] + 1 + clearCost(u);
            if (w < dist[p]) dist[p] = w;
        });
    }
    return dist;
}

// 仲間 seat を、移動の決まりで target まで limit マス以内で運ぶ道（なければ null）
function shortPath(game, seat, target, limit) {
    if (!game.canLeave(seat)) return null;
    const start = game.playerPos(seat);
    const prev = new Map([[start, -1]]);
    let frontier = [start];
    for (let d = 0; d < limit && frontier.length; d++) {
        const next = [];
        frontier.forEach(u => game.stepTargets(seat, u).forEach(p => {
            if (prev.has(p)) return;
            prev.set(p, u);
            next.push(p);
        }));
        frontier = next;
    }
    if (!prev.has(target) || target === start) return null;
    const path = [];
    for (let p = target; p !== start; p = prev.get(p)) path.unshift(p);
    return path;
}

// ---- 行動を使わない手 ----

// offTurn：手番でない人として（水を分ける・秘密の水・日よけだけ）
function freeCommand(game, seat, { offTurn = false } = {}) {
    const me = game.players[seat];
    const myPos = game.playerPos(seat);
    const gearOf = (kind) => me.gear.find(c => GEAR_CARDS[c] === kind);

    // 水を分ける：自分のほうが2つ以上多く、相手が渇いている（水運びは余裕があれば満たす）
    for (const q of game.players) {
        if (q.id === seat || q.water >= maxWater(q)) continue;
        const near = q.tile === me.tile || (me.role === 'waterCarrier' && adjacent(myPos, false).includes(game.playerPos(q.id)));
        if (!near) continue;
        const wants = deficit(game, q) > 0 || me.role === 'waterCarrier';
        if (wants && me.water >= q.water + 2) return { type: 'water', to: q.id };
    }

    // 秘密の水：同じタイルで渇いている人がいる
    const reserve = gearOf('reserve');
    if (reserve !== undefined) {
        const here = game.playersOn(me.tile).map(s => game.players[s]);
        const missing = here.reduce((s, p) => s + Math.min(2, maxWater(p) - p.water), 0);
        if (here.some(p => p.water <= 1) && missing >= 2) return { type: 'gear', card: reserve };
    }

    if (game.phase === 'storm' || offTurn) {
        // 日よけ：嵐を引く前に、同じタイルの渇きかけた人を守る
        const shield = gearOf('shield');
        if (shield !== undefined && !game.shielded(me.tile)) {
            const here = game.playersOn(me.tile).map(s => game.players[s]);
            if (game.phase === 'storm' && (here.some(p => p.water <= 2) || here.length >= 2)) return { type: 'gear', card: shield };
        }
        return null;
    }

    // 時間の加速は、すぐ使う
    const throttle = gearOf('throttle');
    if (throttle !== undefined && game.actionsLeft >= 1) return { type: 'gear', card: throttle };

    // 地中鏡：水の印のタイル（蜃気楼を見分ける）か、遠くのタイルをのぞく
    const scope = gearOf('terrascope');
    if (scope !== undefined) {
        const hidden = [];
        for (let pos = 0; pos < CELLS; pos++) {
            const t = game.tileAt(pos);
            if (t && !t.revealed && !game.peeked.includes(t.id)) hidden.push(pos);
        }
        const water = hidden.find(pos => game.tileAt(pos).back === 'water');
        const target = water ?? hidden[hidden.length - 1];
        if (target !== undefined) return { type: 'gear', card: scope, at: target };
    }
    return null;
}

// ---- 手を選ぶ ----

function chooseCommand(game, seat) {
    const free = freeCommand(game, seat);
    if (free) return free;
    if (game.phase === 'storm') return { type: 'storm' };
    if (game.launchReady()) return { type: 'launch' };
    const me = game.players[seat];
    const route = distances(game, seat);
    const list = tasks(game, seat, route).filter(t => t.final || t.pos !== route.start);
    if (!list.length) return { type: 'pass' };
    list.forEach(t => { t.score = t.value / (t.cost + 0.5); });
    list.sort((a, b) => b.score - a.score || a.pos - b.pos);
    let best = list[0];

    // 水に余裕がなければ、この手番のうちにトンネル（日陰）へ戻れることだけをする
    const tunnels = game.tiles.filter(t => t.kind === 'tunnel' && t.revealed).map(t => game.posOf(t.id));
    if (tunnels.length && me.water <= Math.ceil(expectedSuns(game)) && !(best.kind === 'gather')) {
        const back = shelterDistances(game, seat, tunnels);
        const ret = (t) => back[t.here ? route.start : t.pos];
        const feasible = list.filter(t => t.cost + ret(t) <= game.actionsLeft);
        if (feasible.length) best = feasible[0];
        else if (!tunnels.includes(route.start)) {
            const near = tunnels.reduce((a, b) => (route.dist[b] < route.dist[a] ? b : a));
            if (route.dist[near] <= game.actionsLeft) best = { kind: 'shelter', pos: near, value: 1, cost: route.dist[near], score: 1 };
        } else best = list.find(t => t.here) ?? { score: 0 };
    }
    if (best.score < 0.3) return { type: 'pass' };

    if (best.here || best.pos === route.start) {
        if (best.final) {
            // 掘り出す・拾う前に、残った砂を取り除く
            if (best.clear && game.tileAt(best.pos).sand > 0) return digCommand(game, seat, best.pos);
            if (best.final.type === 'dig') return digCommand(game, seat, best.final.at);
            return best.final;
        }
        return { type: 'pass' };
    }

    // 遠くへは、ジェットパックで飛ぶ
    const jet = me.gear.find(c => GEAR_CARDS[c] === 'jetpack');
    if (jet !== undefined && best.cost - (best.final ? 1 : 0) >= 4 && game.tileAt(best.pos).sand < BLOCKED) {
        return { type: 'gear', card: jet, at: best.pos };
    }
    const step = stepToward(game, seat, route, best.pos, { clearTarget: !!best.clear });
    if (!step) return { type: 'pass' };
    if (step.type === 'dig') return digCommand(game, seat, step.at);
    return step;
}

// 砂を取り除く。2つ以上積もっていて、吹き飛ばしを持っていれば使う
function digCommand(game, seat, pos) {
    const me = game.players[seat];
    const blaster = me.gear.find(c => GEAR_CARDS[c] === 'blaster');
    if (blaster !== undefined && game.tileAt(pos).sand >= 2 + (me.role === 'archeologist' ? 1 : 0)) return { type: 'gear', card: blaster, at: pos };
    return { type: 'dig', at: pos };
}
