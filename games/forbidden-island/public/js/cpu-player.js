/**
 * CPU の仲間
 * - アクション：自分の残りのアクションを、ビーム探索（幅 BEAM）で並べて試し、評価が一番高い並びの先頭を打つ
 *   評価は、手に入れた宝、浸水した場所の危険（大事な場所ほど重く、次にめくられそうなほど重い）、宝のカードの集まり具合
 *   （1人に集めるほど高い）、4枚そろった人と神殿の距離、特別なカード、宝が4つそろったあとの発着場までの距離、
 *   このあと2枚引いて手札が溢れる見込み、などを足したもの
 *   評価の高い終わり方のいくつか（lookK）は、次の人の手番まで読んで比べる（引くカードは分からないので飛ばす）
 * - めくられる見込み：浸水のカードの捨て札（水位上昇で山へ戻る・山が尽きて切り直す）、水位上昇で山の上に戻した束、山の残り
 * - 特別なカード：脱出できれば脱出する。発着場・最後の神殿・まだの宝の神殿の両方が浸水していれば、引く・浸水の段階で土のうを使う。
 *   沈んだら逃げ先がない駒は、土のうで足元を乾かすか、ヘリで逃がす。
 *   宝が4つそろい、ヘリが2枚以上あれば、仲間をヘリで発着場へ運ぶ
 * - 手札の上限では、評価が一番下がらないカードを捨てる
 * - 見てよい情報だけを使う：浸水のカードの捨て札、山の枚数、宝のカードの捨て札。山の並びはのぞかない
 * - ゲームの乱数は使わない（記録の再現がずれないように）。同じ状態なら、いつも同じ手を打つ
 */

import { TILES, TILE_COUNT, FOOLS, TEMPLES, TREASURE_KEYS, isTreasureCard, HAND_LIMIT } from './data.js';
import { DRY, FLOODED, SUNK } from './game.js';

const BEAM = 40;
const plans = new WeakMap();   // ゲームごとに、決めた並びの残り（同じ手番の中で読み直さないため）
// 評価の重み（scripts/cpu-match.mjs で勝率を見て決めた）
export const W = {
    fools: 600, lastTemple: 500, temple: 60, pairFlooded: 150, plain: 3, access: 8,  // 場所の大事さ（pairFlooded：もう1つの神殿も浸水しているとき）
    floodBase: 0.2, floodNext: 2.5, riseDraws: 4,       // 浸水した場所の危険：大事さ ×（floodBase + floodNext × 次にめくられる見込み）。水位上昇は riseDraws 枚先まで見る
    reach: 0.06,                                         // 大事な浸水した場所から、いちばん近い駒の距離（1歩ごとに、大事さ × reach）
    card: 80,                                            // まだ手に入れていない宝のカード1枚（チームで4枚まで）
    together: [0, 0, 80, 200, 350],                      // 1人が持つ同じ宝のカードの枚数ごとの上乗せ
    meet: 3,                                             // 集める人の近くにいる、ほかの人のカード（1枚・近さ1歩ごとの上乗せ）
    lookK: 6, lookMix: 0.5, nextBeam: 8,                 // 次の人の手番まで読む、評価の高い終わり方の数・混ぜる割合・次の人のビームの幅
    sandPair: 1,                                         // 引く・浸水の段階で土のうを使う場所（0：発着場と最後の神殿、1：まだの宝の神殿が2つとも浸水、2：まだの宝の神殿）
    ready: 300, templeDist: 14,                          // 4枚そろった人の上乗せ（神殿から1歩遠いごとに templeDist を引く。8歩まで）
    heli: [0, 250, 400, 450],                            // ヘリの枚数ごと
    sand: 25,
    heliRush: 2,                                         // 4枚そろった人を神殿へヘリで運ぶのに要る、チームのヘリの枚数
    crowd: 60,                                            // 手番の人がこのあと2枚引くと、手札の上限を超える1枚ごと
    stranded: [400, 60]                                  // 浸水した場所にいて、沈んだら逃げ先が 0・1 か所の駒
};

export function cpuSeats(game) {
    return game.players.filter(p => p.isCPU).map(p => p.id);
}

// CPU が何かをする番か（進めるのに要る操作か、使いたい特別なカード）
export function isCpuTurn(game) {
    if (game.isOver()) return false;
    if (game.actors().some(s => game.players[s].isCPU)) return true;
    return wantedSpecial(game, cpuSeats(game)) !== null;
}

// CPU に1手打たせる。seat を渡すと、その席として打つ
export function runCpuStep(game, seat = null) {
    if (game.isOver()) return false;
    const seats = seat === null ? cpuSeats(game) : [seat];
    const decision = decide(game, seats);
    if (decision && game.applyCommand(decision.seat, decision.command)) return true;
    // 決めた手が通らなければ、いちばん単純な手で進める
    for (const fb of fallbacks(game, seats)) {
        if (game.applyCommand(fb.seat, fb.command)) return true;
    }
    return false;
}

// ヒント：その席のおすすめの手（状態は変えない）。手番でなければ null
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return decide(game, [seat])?.command ?? null;
}

export function decide(game, seats) {
    const special = wantedSpecial(game, seats);
    if (special) return special;
    const actors = game.actors().filter(s => seats.includes(s));
    if (!actors.length) return null;
    const seat = actors[0];
    switch (game.phase) {
        case 'actions': return planAction(game, seat, seats);
        case 'draw': return { seat, command: { type: 'draw' } };
        case 'flood': return { seat, command: { type: 'flood' } };
        case 'discard': return { seat, command: chooseDiscard(game, seat) };
        case 'swim': return { seat, command: chooseSwim(game, seat) };
    }
    return null;
}

function fallbacks(game, seats) {
    const list = [];
    game.actors().filter(s => seats.includes(s)).forEach(seat => {
        list.push({ seat, command: { type: 'pass' } }, { seat, command: { type: 'draw' } }, { seat, command: { type: 'flood' } });
        game.players[seat].hand.forEach(card => list.push({ seat, command: { type: 'discard', card } }));
        game.swimTargets(seat).forEach(to => list.push({ seat, command: { type: 'swim', to } }));
    });
    return list;
}

// ---- 特別なカード ----

const holderOf = (game, seats, card) => seats.find(s => game.players[s].hand.includes(card));
const countCards = (game, card) => game.players.reduce((n, p) => n + p.hand.filter(c => c === card).length, 0);

export function wantedSpecial(game, seats) {
    if (game.isOver() || !game.specialWindow()) return null;
    const heli = holderOf(game, seats, 'heli');
    if (heli !== undefined && game.canLiftoff()) return { seat: heli, command: { type: 'liftoff' } };
    // 宝が4つそろったら、ヘリが2枚以上あるとき、発着場の外にいる駒をまとめて運ぶ
    if (heli !== undefined && game.captured.every(Boolean) && game.alive(FOOLS) && countCards(game, 'heli') >= 2) {
        const groups = new Map();
        game.players.filter(p => p.tile !== FOOLS).forEach(p => groups.set(p.tile, [...(groups.get(p.tile) ?? []), p.id]));
        const biggest = [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0])[0];
        if (biggest) return { seat: heli, command: { type: 'heli', pawns: biggest, to: FOOLS } };
    }
    // 4枚そろった人が神殿から遠ければ、ヘリが heliRush 枚以上あるとき運ぶ
    if (heli !== undefined && countCards(game, 'heli') >= W.heliRush && game.phase === 'actions') {
        for (const p of game.players) {
            const k = TREASURE_KEYS.findIndex((key, i) => !game.captured[i] && p.hand.filter(c => c === key).length >= 4);
            if (k < 0) continue;
            const temples = TEMPLES[k].filter(t => game.alive(t));
            if (!temples.length || temples.includes(p.tile)) continue;
            const dist = distances(game, p.id);
            const near = Math.min(...temples.map(t => dist[t]));
            if (near >= 3) {
                const to = temples.sort((a, b) => game.tiles[a] - game.tiles[b] || a - b)[0];
                return { seat: heli, command: { type: 'heli', pawns: [p.id], to } };
            }
        }
    }
    const sand = holderOf(game, seats, 'sand');
    if (['draw', 'flood'].includes(game.phase)) {
        // 沈んだら逃げ先がない駒は、土のうで足元を乾かすか、ヘリで逃がす
        const stranded = game.players.find(p => game.tiles[p.tile] === FLOODED && !game.swimTargets(p.id).length);
        if (stranded && sand !== undefined) return { seat: sand, command: { type: 'sand', tile: stranded.tile } };
        if (stranded && heli !== undefined) {
            const safe = TILES.map(t => t.id).filter(t => game.tiles[t] === DRY && t !== stranded.tile)
                .sort((a, b) => (b === FOOLS) - (a === FOOLS) || game.neighborTiles(b).filter(o => game.alive(o)).length - game.neighborTiles(a).filter(o => game.alive(o)).length || a - b)[0];
            if (safe !== undefined) return { seat: heli, command: { type: 'heli', pawns: game.pawnsOn(stranded.tile), to: safe } };
        }
    }
    // 土のう：大事な場所が浸水していれば、引く・浸水の段階で使う
    if (sand !== undefined && ['draw', 'flood'].includes(game.phase)) {
        const critical = TILES.map(t => t.id).filter(t => game.tiles[t] === FLOODED && importance(game, t) >= [W.lastTemple, W.pairFlooded, W.temple][W.sandPair]);
        if (critical.length) return { seat: sand, command: { type: 'sand', tile: critical.sort((a, b) => importance(game, b) - importance(game, a) || a - b)[0] } };
    }
    return null;
}

// ---- 評価 ----

// 場所の大事さ
export function importance(g, t) {
    if (t === FOOLS) return W.fools;
    const k = TILES[t].treasure;
    if (k !== null) {
        if (g.captured[k]) return W.plain;
        const other = TEMPLES[k].find(o => o !== t);
        return g.tiles[other] === SUNK ? W.lastTemple : g.tiles[other] === FLOODED ? W.pairFlooded : W.temple;
    }
    // 発着場や、まだの宝の神殿のとなりは、そこへ行く道になる
    const near = g.neighborTiles(t).some(o => g.alive(o) && (o === FOOLS || (TILES[o].treasure !== null && !g.captured[TILES[o].treasure])));
    return near ? W.access : W.plain;
}

// これから draws 枚引くうちに、水位上昇が出る見込み（山が切れたら、捨て札を切り直した山から引く）
export function riseChance(g, draws) {
    let noRise = 1;
    let deck = g.treasureDeck.length;
    let rises = g.treasureDeck.filter(c => c === 'rise').length;
    let refilled = false;
    for (let i = 0; i < draws; i++) {
        if (deck <= 0) {
            if (refilled) break;
            refilled = true;
            deck = g.treasureDiscard.length;
            rises = g.treasureDiscard.filter(c => c === 'rise').length;
            if (deck <= 0) break;
        }
        noRise *= 1 - rises / deck;
        deck--;
    }
    return 1 - noRise;
}

// 駒の役割で、各場所まで何アクションかかるか（パイロットは飛べるので1まで）
export function distances(g, seat) {
    const p = g.players[seat];
    const dist = Array(TILE_COUNT).fill(Infinity);
    dist[p.tile] = 0;
    const queue = [p.tile];
    while (queue.length) {
        const at = queue.shift();
        const next = p.role === 'diver' ? g.diveTargets(at) : g.neighborTiles(at, p.role === 'explorer').filter(t => g.alive(t));
        for (const t of next) {
            if (dist[t] !== Infinity) continue;
            dist[t] = dist[at] + 1;
            queue.push(t);
        }
    }
    if (p.role === 'pilot') {
        for (let t = 0; t < TILE_COUNT; t++) if (t !== p.tile && g.alive(t)) dist[t] = Math.min(dist[t], 1);
    }
    return dist;
}

export function evaluate(g) {
    if (g.result) return g.result.won ? 1e7 : -1e7;
    let s = 0;
    const capturedCount = g.captured.filter(Boolean).length;
    s += capturedCount * 3000;
    const dists = g.players.map(p => distances(g, p.id));

    // 浸水の危険
    const rate = g.floodRate();
    const deckLen = Math.max(1, g.floodDeck.length);
    const pRise = riseChance(g, W.riseDraws);
    const inDiscard = new Set(g.floodDiscard);
    // 水位上昇で山の上に戻した束（どの場所が入っているかは公開されている。並びは見ない）
    const top = g.floodTop ?? 0;
    const onTop = new Set(g.floodDeck.slice(0, top));
    // 山の残りが浸水の枚数より少なければ、めくる途中で捨て札を切り直すので、捨て札の場所もめくられる
    const over = Math.max(0, rate - g.floodDeck.length);
    const pReshuffle = over > 0 ? Math.min(1, over / Math.max(1, g.floodDiscard.length)) : 0;
    const pDiscard = 1 - (1 - pRise) * (1 - pReshuffle);
    for (let t = 0; t < TILE_COUNT; t++) {
        if (g.tiles[t] !== FLOODED) continue;
        const imp = importance(g, t);
        const pNext = inDiscard.has(t) ? pDiscard :onTop.has(t) ? Math.min(1, rate / top) : Math.min(1, rate / deckLen);
        s -= imp * (W.floodBase + W.floodNext * pNext);
        // 次の手番に補強しに行ける駒がいるか
        if (imp >= W.temple) s -= imp * W.reach * Math.min(4, Math.min(...dists.map(d => d[t])));
    }

    // 宝のカード
    TREASURE_KEYS.forEach((key, k) => {
        if (g.captured[k]) return;
        const counts = g.players.map(p => p.hand.filter(c => c === key).length);
        const total = counts.reduce((a, b) => a + b, 0);
        const best = counts.indexOf(Math.max(...counts));
        s += W.card * Math.min(4, total) + W.together[Math.min(4, counts[best])];
        if (counts[best] >= 4) {
            const temples = TEMPLES[k].filter(t => g.alive(t));
            const d = Math.min(...temples.map(t => dists[best][t]));
            s += W.ready - W.templeDist * Math.min(8, d);
        } else if (total >= 2) {
            // 集める人のところへ、ほかの人が渡しに行く
            g.players.forEach((p, i) => {
                if (i === best || !counts[i]) return;
                if (p.role === 'messenger' || g.players[best].role === 'messenger') return;
                const d = dists[i][g.players[best].tile];
                s += counts[i] * W.meet * (6 - Math.min(6, d / 2));
            });
        }
    });

    // このあと手番の人が2枚引くので、手札が上限を超えそうなら、先に渡しておく
    if (g.phase === 'actions' || g.phase === 'draw') s -= W.crowd * Math.max(0, g.players[g.current].hand.length + 2 - HAND_LIMIT);

    // 特別なカード
    const helis = countCards(g, 'heli');
    s += W.heli[Math.min(helis, 3)] + W.sand * countCards(g, 'sand');

    // 宝が4つそろったら、発着場へ
    if (capturedCount === 4) {
        s += helis ? 200 : 0;
        g.players.forEach((p, i) => {
            const d = dists[i][FOOLS];
            s -= d === Infinity ? 100 : 30 * d;
        });
    }
    // 浸水した場所に立っていると、沈んだときに泳ぐことになる
    g.players.forEach(p => {
        if (g.tiles[p.tile] !== FLOODED) return;
        s -= 2;
        if (p.role === 'pilot') return;
        const exits = (p.role === 'diver' ? g.diveTargets(p.tile) : g.neighborTiles(p.tile, p.role === 'explorer').filter(t => g.alive(t))).length;
        if (exits < 2) s -= W.stranded[exits];
    });
    return s;
}

// ---- アクション ----

// 手番の人のアクションと、特別なカード（持ち主が seats の中の人）。{ seat, command } の並び
function candidates(g, seat, seats) {
    const list = actionCandidates(g, seat).map(command => ({ seat, command }));
    // ヘリ：同じ場所の駒（全員か1人）を、まだの宝の神殿・発着場・仲間のいる場所へ
    const heli = seats.find(s => g.players[s].hand.includes('heli'));
    if (heli !== undefined) {
        const dests = new Set([FOOLS, ...g.players.map(p => p.tile)]);
        TEMPLES.forEach((list2, k) => { if (!g.captured[k]) list2.forEach(t => dests.add(t)); });
        const groups = new Map();
        g.players.forEach(p => groups.set(p.tile, [...(groups.get(p.tile) ?? []), p.id]));
        groups.forEach((pawns, from) => {
            const options = pawns.length > 1 ? [pawns, ...pawns.map(p => [p])] : [pawns];
            dests.forEach(to => {
                if (to === from || !g.alive(to)) return;
                options.forEach(list2 => list.push({ seat: heli, command: { type: 'heli', pawns: list2, to } }));
            });
        });
    }
    // 土のう：大事な場所の浸水
    const sand = seats.find(s => g.players[s].hand.includes('sand'));
    if (sand !== undefined) {
        TILES.forEach(t => {
            if (g.tiles[t.id] === FLOODED && importance(g, t.id) >= W.temple) list.push({ seat: sand, command: { type: 'sand', tile: t.id } });
        });
    }
    return list;
}

function actionCandidates(g, seat) {
    const me = g.players[seat];
    const list = [];
    g.moveTargets(seat).forEach(to => list.push({ type: 'move', to }));
    if (me.role === 'pilot' && !g.pilotUsed) {
        const near = new Set(g.moveTargets(seat));
        TILES.forEach(t => {
            if (g.alive(t.id) && t.id !== me.tile && !near.has(t.id)) list.push({ type: 'fly', to: t.id });
        });
    }
    const shore = g.shoreTargets(seat);
    shore.forEach(tile => list.push({ type: 'shore', tile }));
    if (me.role === 'engineer') {
        for (let i = 0; i < shore.length; i++) for (let j = i + 1; j < shore.length; j++) list.push({ type: 'shore', tile: shore[i], tile2: shore[j] });
    }
    const cards = [...new Set(me.hand.filter(isTreasureCard))];
    g.giveTargets(seat).forEach(to => cards.forEach(card => list.push({ type: 'give', to, card })));
    if (g.capturable(seat) !== null) list.push({ type: 'capture' });
    if (me.role === 'navigator') {
        g.players.forEach(p => {
            if (p.id !== seat) g.navigateTargets(p.id).forEach(to => list.push({ type: 'navigate', pawn: p.id, to }));
        });
    }
    return list;
}

const stateKey = (g) => `${g.turnNo}:${g.current}:${g.actionsLeft}|` + g.tiles.join('') + '|' + g.players.map(p => `${p.tile}:${[...p.hand].sort().join(',')}`).join('|') + '|' + g.captured.join(',') + g.pilotUsed;

// 捨てる段階になったら、評価が一番下がらないカードを捨てて進める（写しの上で）
function settleSim(g) {
    let guard = 0;
    while (g.phase === 'discard' && guard++ < 10) {
        const seat = g.overLimit()[0];
        const command = chooseDiscard(g, seat);
        if (!g.applyCommand(seat, command)) break;
    }
}

// 手番の人（seat）のアクションをビーム探索で並べる。読んだ局面をすべて返す（best は評価が一番高いもの）
function beamSearch(root, seat, seats, width, actionsLeft) {
    const start = { g: root, steps: [], score: evaluate(root) };
    let best = start;
    const all = [start];
    let beams = [start];
    // 特別なカードはアクションを使わないので、1手多く読む
    for (let depth = 0; depth <= actionsLeft && beams.length; depth++) {
        const next = [];
        const seen = new Set();
        for (const b of beams) {
            if (b.g.phase !== 'actions' || b.g.current !== seat) continue;
            for (const { seat: by, command } of candidates(b.g, seat, seats)) {
                const c = b.g.simClone();
                if (!c.applyCommand(by, command)) continue;
                settleSim(c);
                const key = stateKey(c);
                if (seen.has(key)) continue;
                seen.add(key);
                const node = { g: c, steps: [...b.steps, { key: stateKey(b.g), seat: by, command }], score: evaluate(c) };
                next.push(node);
                all.push(node);
                if (node.score > best.score + 1e-9) best = node;
            }
        }
        next.sort((a, b) => b.score - a.score);
        beams = next.slice(0, width);
    }
    return { best, all };
}

// 次の人の手番で、どこまでよくできるか（引くカードは分からないので、引く・浸水は飛ばす）
function nextTurnScore(g) {
    if (g.result) return evaluate(g);
    const n = g.simClone();
    n.current = (g.current + 1) % g.players.length;
    n.turnNo = g.turnNo + 1;
    n.phase = 'actions';
    n.actionsLeft = 3;
    n.pilotUsed = false;
    return beamSearch(n, n.current, [], W.nextBeam, 3).best.score;
}

export function planAction(game, seat, seats = [seat]) {
    // 前に決めた並びの途中で、局面が見込みどおりなら、続きを打つ
    const plan = plans.get(game);
    if (plan && plan.steps.length && plan.seat === seat && plan.steps[0].key === stateKey(game)) {
        const [step, ...rest] = plan.steps;
        plans.set(game, { seat, steps: rest });
        return { seat: step.seat, command: step.command };
    }
    const { best: first, all } = beamSearch(game.simClone(), seat, seats, BEAM, game.actionsLeft);
    let best = first;
    // 評価の高い終わり方のいくつかは、次の人の手番まで読んで比べる（渡したカードで次の人が宝を手に入れられる、など）
    if (W.lookK > 0) {
        const pool = all.filter(n => n.steps.length || n === all[0]).sort((a, b) => b.score - a.score).slice(0, W.lookK);
        let bestScore = -Infinity;
        for (const node of pool) {
            const score = (1 - W.lookMix) * node.score + W.lookMix * nextTurnScore(node.g);
            if (score > bestScore + 1e-9) {
                bestScore = score;
                best = node;
            }
        }
    }
    if (!best.steps.length) {
        plans.delete(game);
        return { seat, command: { type: 'pass' } };
    }
    plans.set(game, { seat, steps: best.steps.slice(1) });
    return { seat: best.steps[0].seat, command: best.steps[0].command };
}

export function chooseDiscard(game, seat) {
    const p = game.players[seat];
    let best = null;
    const options = [...new Set(p.hand)];
    for (const card of options) {
        const c = game.simClone();
        const q = c.players[seat];
        q.hand.splice(q.hand.indexOf(card), 1);
        const score = evaluate(c) - (card === 'sand' ? 5 : 0);
        if (!best || score > best.score) best = { score, command: { type: 'discard', card } };
    }
    // 土のうは、捨てるより浸水した場所に使う
    if (p.hand.includes('sand') && game.specialWindow()) {
        const flooded = TILES.map(t => t.id).filter(t => game.tiles[t] === FLOODED);
        for (const tile of flooded) {
            const c = game.simClone();
            if (!c.applyCommand(seat, { type: 'sand', tile })) continue;
            const score = evaluate(c);
            if (score > best.score) best = { score, command: { type: 'sand', tile } };
        }
    }
    return best.command;
}

export function chooseSwim(game, seat) {
    let best = null;
    for (const to of game.swimTargets(seat)) {
        const c = game.simClone();
        c.players[seat].tile = to;
        const score = evaluate(c) - (c.tiles[to] === DRY ? 0 : 3);
        if (!best || score > best.score) best = { score, command: { type: 'swim', to } };
    }
    return best?.command ?? null;
}

export { HAND_LIMIT };
