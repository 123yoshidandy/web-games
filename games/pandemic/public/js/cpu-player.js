/**
 * CPU の仲間
 * - アクション：自分の残りのアクションを、ビーム探索（幅 W.beam）で並べて試し、評価が一番高い並びの先頭を打つ
 *   評価は、治療薬・根絶、病原体の危険度（これからの感染でめくられそうな都市ほど重い）、カードの価値（色ごとに集める人を決め、
 *   その人の進み具合と、ほかの人が渡しに会う距離で決める）、治療薬を作れる人と研究所の距離、研究所の数、駒と危ない都市の距離、などを足したもの
 * - 手札の上限では、評価が一番下がらないカードを捨てる。捨てると損が大きければ、代わりにイベントを使う
 * - 見てよい情報だけを使う：感染カードの捨て札、強化で山の上に戻った都市のまとまり、山の枚数、伝染の山の分け方。山の並びはのぞかない
 * - ゲームの乱数は使わない（記録の再現がずれないように）。同じ状態なら、いつも同じ手を打つ
 */

import { CITIES, NEIGHBORS, DRIVE_DIST, isCityCard, isEventCard, eventOf, cardColor, HAND_LIMIT, MAX_STATIONS } from './cities.js';

const CUBE_WEIGHT = [0, 1, 4, 15];
const plans = new WeakMap();   // ゲームごとに、決めた並びの残り（同じ手番の中で読み直さないため）

export function cpuSeats(game) {
    return game.players.filter(p => p.isCPU).map(p => p.id);
}

// CPU が何かをする番か（進めるのに要る操作か、使いたいイベント）
export function isCpuTurn(game) {
    if (game.isOver()) return false;
    if (game.actors().some(s => game.players[s].isCPU)) return true;
    return wantedEvent(game, cpuSeats(game)) !== null;
}

// CPU に1手打たせる。seat を渡すと、その席として打つ（人の手番を CPU に任せるとき）
export function runCpuStep(game, seat = null) {
    if (game.isOver()) return false;
    const seats = seat === null ? cpuSeats(game) : [seat];
    const decision = decide(game, seats);
    if (decision && game.applyCommand(decision.seat, decision.command)) return true;
    plans.delete(game);
    // 決めた手が通らなければ、いちばん単純な手で進める
    for (const fb of fallbacks(game, seats)) {
        if (game.applyCommand(fb.seat, fb.command)) return true;
    }
    return false;
}

export function decide(game, seats) {
    const ev = wantedEvent(game, seats);
    if (ev) return ev;
    const actors = game.actors().filter(s => seats.includes(s));
    if (!actors.length) return null;
    const seat = actors[0];
    switch (game.phase) {
        case 'actions': return { seat, command: planAction(game, seat) };
        case 'draw': return { seat, command: { type: 'draw' } };
        case 'infect': return { seat, command: { type: 'infect' } };
        case 'epidemic': return { seat, command: { type: 'intensify' } };
        case 'between': return { seat, command: { type: 'continue' } };
        case 'discard': return discardOrPlay(game, seat);
        case 'forecast': return { seat, command: { type: 'forecast', order: forecastOrder(game) } };
    }
    return null;
}

function fallbacks(game, seats) {
    const list = [];
    game.actors().filter(s => seats.includes(s)).forEach(seat => {
        list.push({ seat, command: { type: 'pass' } }, { seat, command: { type: 'draw' } }, { seat, command: { type: 'infect' } },
            { seat, command: { type: 'intensify' } }, { seat, command: { type: 'continue' } });
        game.players[seat].hand.forEach(card => list.push({ seat, command: { type: 'discard', card } }));
        const k = Math.min(6, game.infectionDeck.length);
        list.push({ seat, command: { type: 'forecast', order: Array.from({ length: k }, (_, i) => i) } });
    });
    return list;
}

// ---- 公開の情報からの見積もり ----

// これからの感染で、各都市がめくられる見込み
// W.horizon 回先までの感染それぞれでめくられる見込みを、近いほど重く（W.horizonWeights）足し合わせる
// 捨て札の都市は、その間に伝染が来て山の上に戻る見込みで数える
export function infectionOdds(game) {
    const rate = game.infectionRate();
    const knownSet = new Set(game.known.flat());
    const discard = new Set(game.infectionDiscard);
    const removed = new Set(game.infectionRemoved);
    const unknown = CITIES.map(c => c.id).filter(c => !knownSet.has(c) && !discard.has(c) && !removed.has(c));
    const unknownCount = game.infectionDeck.length - knownSet.size;
    const odds = (draws) => {
        const p = new Array(CITIES.length).fill(0);
        let r = draws;
        for (const seg of game.known) {
            if (r <= 0) break;
            const q = Math.min(1, r / seg.length);
            seg.forEach(c => { p[c] = q; });
            r -= seg.length;
        }
        if (r > 0 && unknownCount > 0) unknown.forEach(c => { p[c] = Math.min(1, r / unknownCount); });
        return p;
    };
    const weights = W.horizonWeights;
    const total = weights.reduce((x, y) => x + y, 0);
    const result = new Array(CITIES.length).fill(0);
    const dsize = game.infectionDiscard.length + 1;
    weights.forEach((w, i) => {
        const k = i + 1;
        const p = odds(rate * k);
        // k 回目の感染までに伝染が来ると、捨て札の都市が山の上に戻り、残りの感染でめくられる
        const epi = epidemicChance(game, 2 * k);
        const back = Math.min(1, (rate * Math.max(1, k - 0.5) + 1) / dsize);
        CITIES.forEach(c => {
            const q = discard.has(c.id) && !knownSet.has(c.id) ? epi * back : p[c.id];
            result[c.id] += w * q / total;
        });
    });
    return result;
}

// 次に n 枚引くまでに、伝染が出る見込み（山の分け方から分かる）
export function epidemicChance(game, n = 2) {
    const left = game.playerDeck.length;
    if (left === 0 || game.epidemicsDrawn >= game.epidemicsTotal) return 0;
    const total = game.pileSizes.reduce((a, b) => a + b, 0);
    let drawnSoFar = total - left;
    let chance = 0;
    let draws = Math.min(n, left);
    let i = 0;
    let start = 0;
    while (i < game.pileSizes.length && start + game.pileSizes[i] <= drawnSoFar) start += game.pileSizes[i++];
    while (draws > 0 && i < game.pileSizes.length) {
        const pos = drawnSoFar - start;
        const rest = game.pileSizes[i] - pos;
        const take = Math.min(draws, rest);
        if (game.epidemicsDrawn <= i) chance = 1 - (1 - chance) * (1 - take / rest);
        draws -= take;
        drawnSoFar += take;
        start += game.pileSizes[i++];
    }
    return chance;
}

// ---- 評価 ----

// 終盤（山札が少ない）ほど治療薬を急ぎ、危険度を軽く見る。負けが近いとき（アウトブレイクが多い・駒が少ない色）は重く見る
function context(game) {
    const left = game.playerDeck.length;
    let scale = W.lateFrom ? Math.min(1, Math.max(W.lateMin, left / W.lateFrom)) : 1;
    if (game.outbreaks >= 6) scale = Math.max(scale, 1.4);
    const colorScale = game.supply.map(n => (n <= 6 ? W.lowSupply : 1));
    return { odds: infectionOdds(game), scale, colorScale };
}

function stationDistances(g) {
    return CITIES.map(c => Math.min(...g.stations.map(s => DRIVE_DIST[c.id][s])));
}

// 評価の重み（scripts/cpu-match.mjs の勝率を見て決めた）
export const W = {
    cure: 12000, eradicate: 1500,
    // 病原体：これからの感染の見込み（近い回ほど重く）、3個の都市の隣も3個なら重く、駒が遠いと重く
    cubeBase: 4, cubeOdds: 120, nearBase: 2, nearOdds: 10, chain: 1.6, horizonWeights: [0.3, 0.25, 0.25, 0.2],
    // 終盤（山札が lateFrom 枚より少ない）は病原体を軽く見て、治療薬を急ぐ。駒が6個以下の色は重く見る
    lateFrom: 40, lateMin: 0.2, lowSupply: 2,
    // カード：集める人の進み具合、渡しに会う距離、治療薬を作れる人と研究所の距離
    best: 4000, readyExp: 2, ready: 2500, readyDist: 400, xfer: 600, xferBase: 150, meetRange: 4, extra: 30,
    eventCard: 700, eventExtra: 150, eventDump: 100, overLimit: 300, overSoon: 60,
    stations: [0, 0, 700, 1300, 1700, 1900, 2000], stationGap: 2,
    beam: 8
};

// 治療薬に向けたカードの価値（色ごとに集める人を決める）
// - 集める人：その色を一番多く持つ人（科学者は1枚多いと見る。同じなら研究所に近い人）。進み具合の2乗で点を付ける
// - ほかの人の同じ色のカード：足りない枚数までは、集める人に渡しに会う距離が近いほど高い。それより多い分は安い（飛行機に使ってよい）
// - 治療薬のある色のカードは、ほぼ価値なし
function cardEconomy(g, dS, dist) {
    let s = 0;
    for (let color = 0; color < 4; color++) {
        if (g.cures[color]) {
            s += W.best + W.ready;
            continue;
        }
        const counts = g.players.map(p => p.hand.filter(c => c < CITIES.length && CITIES[c].color === color).length);
        let holder = g.players[0];
        let key = -1;
        g.players.forEach((p, i) => {
            const k = counts[i] + (p.role === 'scientist' ? 1 : 0);
            if (k > key || (k === key && dS[p.city] < dS[holder.city])) {
                key = k;
                holder = p;
            }
        });
        const need = holder.role === 'scientist' ? 4 : 5;
        const mine = counts[holder.id];
        const frac = Math.min(mine, need) / need;
        s += W.best * frac ** W.readyExp;
        if (mine >= need) s += W.ready - W.readyDist * Math.min(dS[holder.city], 5);
        const offers = [];
        g.players.forEach(o => {
            if (o === holder) return;
            o.hand.forEach(c => {
                if (c >= CITIES.length || CITIES[c].color !== color) return;
                const meet = o.role === 'researcher' ? dist(o.city, holder.city) : dist(o.city, c) + dist(holder.city, c);
                offers.push(W.xferBase + W.xfer * W.meetRange / (W.meetRange + meet));
            });
        });
        offers.sort((a, b) => b - a);
        offers.forEach((v, i) => { s += i < need - mine ? v : W.extra; });
    }
    return s;
}

export function evaluate(g, ctx) {
    if (g.result?.won) return 1e7;
    let s = 0;
    const st = g.stations;
    const dS = stationDistances(g);
    const dist = (a, b) => Math.min(DRIVE_DIST[a][b], st.length >= 2 ? dS[a] + 1 + dS[b] : Infinity);
    g.cures.forEach(c => { s += c ? W.cure : 0; s += c === 2 ? W.eradicate : 0; });

    // 病原体の危険度
    for (let city = 0; city < CITIES.length; city++) {
        const row = g.cubes[city];
        for (let color = 0; color < 4; color++) {
            const k = row[color];
            if (!k || g.cures[color] === 2) continue;
            let w = CUBE_WEIGHT[k] * ctx.scale * ctx.colorScale[color];
            if (k === 3 && NEIGHBORS[city].some(n => g.cubes[n][color] === 3)) w *= W.chain;
            const p = g.prevented(city, color) ? 0.05 : ctx.odds[city];
            s -= w * (W.cubeBase + W.cubeOdds * p);
            if (k >= 2) {
                let md = 9;
                g.players.forEach(pl => { md = Math.min(md, dist(pl.city, city)); });
                s -= w * (W.nearBase + W.nearOdds * p) * Math.min(md, 4);
            }
        }
    }

    s += cardEconomy(g, dS, dist);

    // 研究所
    s += W.stations[Math.min(st.length, MAX_STATIONS)];

    // イベントと、手札の上限
    g.players.forEach(pl => {
        let events = 0;
        pl.hand.forEach(c => {
            // イベントは1枚目だけ高く見る（ため込むと手札が埋まる）
            if (isEventCard(c)) s += events++ ? W.eventExtra : W.eventCard;
        });
        if (pl.stored !== null) s += W.eventCard;
        if (pl.hand.length > HAND_LIMIT) s -= W.overLimit * (pl.hand.length - HAND_LIMIT);
        // 手番の人は、このあと2枚引く。上限を超える分は捨てることになる
        if (pl.id === g.current && pl.hand.length + 2 > HAND_LIMIT) s -= W.overSoon * (pl.hand.length + 2 - HAND_LIMIT);
    });
    return s;
}

// ---- アクションの探索 ----

function interestingCities(g, seat) {
    const set = new Set(g.stations);
    g.players.forEach(p => set.add(p.city));
    g.players[seat].hand.filter(isCityCard).forEach(c => set.add(c));
    CITIES.forEach(c => {
        if (g.cubes[c.id].some((k, color) => k >= 2 && g.cures[color] !== 2)) set.add(c.id);
    });
    return [...set];
}

function candidates(g, seat) {
    const me = g.players[seat];
    const list = [];
    const pawns = me.role === 'dispatcher' ? g.players.map(p => p.id) : [seat];
    const targets = interestingCities(g, seat);
    pawns.forEach(pawn => {
        const from = g.players[pawn].city;
        NEIGHBORS[from].forEach(to => list.push({ type: 'drive', pawn, to }));
        if (g.stations.includes(from)) g.stations.forEach(to => to !== from && list.push({ type: 'shuttle', pawn, to }));
        if (me.role === 'dispatcher') g.players.forEach(p => p.city !== from && list.push({ type: 'dispatch', pawn, to: p.city }));
        if (pawn !== seat) return;
        me.hand.filter(isCityCard).forEach(card => card !== from && list.push({ type: 'direct', pawn, card }));
        if (me.hand.includes(from)) targets.forEach(to => to !== from && list.push({ type: 'charter', pawn, to }));
    });
    if (me.role === 'ops' && !g.opsMoveUsed && g.stations.includes(me.city)) {
        const card = cheapestCityCard(g, seat);
        if (card !== null) targets.forEach(to => to !== me.city && list.push({ type: 'opsmove', to, card }));
    }
    // 研究所は、ほかの研究所から離れた都市にだけ建てる（6つあるときは移さない）
    if (!g.stations.includes(me.city) && g.stations.length < MAX_STATIONS
        && Math.min(...g.stations.map(s => DRIVE_DIST[me.city][s])) >= W.stationGap) {
        list.push({ type: 'build' });
    }
    [0, 1, 2, 3].forEach(color => { if (g.cubes[me.city][color]) list.push({ type: 'treat', color }); });
    g.players.forEach(o => {
        if (o.id === seat || o.city !== me.city) return;
        me.hand.forEach(card => list.push({ type: 'give', to: o.id, card }));
        o.hand.forEach(card => list.push({ type: 'take', from: o.id, card }));
    });
    if (g.stations.includes(me.city)) {
        [0, 1, 2, 3].forEach(color => {
            const cards = me.hand.filter(c => isCityCard(c) && cardColor(c) === color);
            const need = me.role === 'scientist' ? 4 : 5;
            if (!g.cures[color] && cards.length >= need) list.push({ type: 'cure', cards: cards.slice(0, need) });
        });
    }
    if (me.role === 'planner' && me.stored === null) {
        g.playerDiscard.filter(isEventCard).forEach(card => list.push({ type: 'retrieve', card }));
    }
    return list;
}

const stateKey = (g) => g.players.map(p => `${p.city}:${p.hand.length}:${p.stored}`).join(',')
    + `|${g.stations.join(',')}|${g.cures.join('')}|${g.cubes.map(r => r.join('')).join('')}`;

// seat の残りのアクションをビーム探索する。返すのは、見つけた状態（手を打たない状態を含む）を評価の高い順に並べたもの
function searchTurn(root, seat, actions, ctx, width) {
    let beam = [{ g: root, seq: [], score: evaluate(root, ctx) }];
    const found = [beam[0]];
    const seen = new Set([stateKey(root)]);
    for (let depth = 0; depth < actions; depth++) {
        const children = [];
        for (const node of beam) {
            if (node.g.phase !== 'actions') continue;
            for (const command of candidates(node.g, seat)) {
                if (node.g.commandError(seat, command)) continue;
                const child = node.g.simClone();
                child.execute(seat, command);
                const key = stateKey(child);
                if (seen.has(key)) continue;
                seen.add(key);
                children.push({ g: child, seq: [...node.seq, command], score: evaluate(child, ctx) - depth });
            }
        }
        if (!children.length) break;
        children.sort((x, y) => y.score - x.score);
        beam = children.slice(0, width);
        found.push(...beam);
    }
    return found.sort((x, y) => y.score - x.score);
}

function planAction(game, seat) {
    const cached = plans.get(game);
    if (cached && cached.at === game.commands.length && cached.seat === seat && cached.seq.length) {
        const command = cached.seq.shift();
        cached.at = game.commands.length + 1;
        if (!game.commandError(seat, command)) return command;
    }
    const ctx = context(game);
    const best = searchTurn(game.simClone(), seat, game.actionsLeft, ctx, W.beam)[0];
    if (!best.seq.length) return { type: 'pass' };
    const [first, ...rest] = best.seq;
    plans.set(game, { at: game.commands.length + 1, seat, seq: rest });
    return first;
}

function cardKeepValue(g, seat, card) {
    if (isEventCard(card)) return 400;
    const color = cardColor(card);
    if (g.cures[color]) return 0;
    const me = g.players[seat];
    const mine = me.hand.filter(c => isCityCard(c) && cardColor(c) === color).length;
    const team = Math.max(...g.players.map(p => p.hand.filter(c => isCityCard(c) && cardColor(c) === color).length));
    return 100 + 60 * mine + 20 * team + (g.stations.includes(card) ? 0 : 5);
}

// 手札の上限：捨てると損が大きいなら、捨てる代わりにイベントを使う
function discardOrPlay(game, seat) {
    const { card, loss } = bestDiscard(game, seat);
    if (loss > W.eventDump) {
        const play = freeEvent(game, seat);
        if (play) return { seat, command: play };
    }
    return { seat, command: { type: 'discard', card } };
}

// 手札を空けるために使うイベント（使いどころを選ばないものから）
function freeEvent(game, seat) {
    const me = game.players[seat];
    const dS = stationDistances(game);
    for (const card of me.hand.filter(isEventCard)) {
        const key = eventOf(card).key;
        const base = { type: 'event', card };
        if (key === 'quiet' && !game.quiet) return base;
        if (key === 'resilient') {
            const city = worstDiscardCity(game) ?? game.infectionDiscard[0];
            if (city !== undefined) return { ...base, city };
        }
        if (key === 'grant' && game.stations.length < MAX_STATIONS) {
            // 研究所から一番遠い駒の都市に建てる
            const far = game.players.reduce((a, b) => (dS[b.city] > dS[a.city] ? b : a));
            if (!game.stations.includes(far.city)) return { ...base, city: far.city };
        }
        if (key === 'airlift') {
            const other = game.players.find(p => p.id !== seat && p.city !== me.city);
            if (other) return { ...base, pawn: seat, to: other.city };
        }
        if (key === 'forecast' && game.infectionDeck.length) return base;
    }
    return null;
}

function bestDiscard(game, seat) {
    const ctx = context(game);
    const before = evaluate(game.simClone(), ctx);
    let pick = game.players[seat].hand[0];
    let best = -Infinity;
    new Set(game.players[seat].hand).forEach(card => {
        const g = game.simClone();
        const hand = g.players[seat].hand;
        hand.splice(hand.indexOf(card), 1);
        const score = evaluate(g, ctx);
        if (score > best) {
            best = score;
            pick = card;
        }
    });
    return { card: pick, loss: before - best };
}

function cheapestCityCard(g, seat) {
    const cards = g.players[seat].hand.filter(isCityCard);
    if (!cards.length) return null;
    return cards.reduce((best, c) => (cardKeepValue(g, seat, c) < cardKeepValue(g, seat, best) ? c : best), cards[0]);
}

function leastUsefulStation(g, except) {
    // ほかの研究所に一番近い（重なっている）ものを移す
    const others = g.stations.filter(s => s !== except);
    let pick = others[0];
    let score = Infinity;
    others.forEach(s => {
        const near = Math.min(...g.stations.filter(t => t !== s).map(t => DRIVE_DIST[s][t]));
        if (near < score) {
            score = near;
            pick = s;
        }
    });
    return pick;
}

// ---- イベント ----

function dangerNow(game, odds) {
    let d = 0;
    CITIES.forEach(c => game.cubes[c.id].forEach((k, color) => {
        if (k && game.cures[color] !== 2 && !game.prevented(c.id, color)) d += CUBE_WEIGHT[k] * odds[c.id];
    }));
    return d;
}

// CPU が今使いたいイベント（なければ null）
function wantedEvent(game, seats) {
    if (game.isOver() || game.phase === 'forecast') return null;
    const holders = [];
    seats.forEach(seat => game.eventsOf(seat).forEach(e => holders.push({ seat, ...e, key: eventOf(e.card).key })));
    if (!holders.length) return null;
    const find = (key) => holders.find(h => h.key === key);
    const cmd = (h, extra = {}) => ({ seat: h.seat, command: { type: 'event', card: h.card, stored: h.stored, ...extra } });

    if (game.phase === 'epidemic') {
        const h = find('resilient');
        if (!h) return null;
        const pick = worstDiscardCity(game);
        return pick !== null ? cmd(h, { city: pick }) : null;
    }
    if (game.phase === 'infect' || game.phase === 'between') {
        const odds = infectionOdds(game);
        const hot = CITIES.some(c => game.cubes[c.id].some((k, color) => k === 3 && game.cures[color] !== 2 && !game.prevented(c.id, color) && odds[c.id] >= 0.5));
        const q = find('quiet');
        if (q && !game.quiet && (hot || dangerNow(game, odds) > 25)) return cmd(q);
        const f = find('forecast');
        if (f && !game.quiet && hot) return cmd(f);
        return null;
    }
    if (game.phase === 'actions' && seats.includes(game.current) && game.actionsLeft === 4) {
        const me = game.players[game.current];
        const dS = stationDistances(game);
        const ready = [0, 1, 2, 3].some(color => !game.cures[color]
            && me.hand.filter(c => isCityCard(c) && cardColor(c) === color).length >= game.needForCure(me.id));
        const near = [0, 1, 2, 3].some(color => !game.cures[color]
            && me.hand.filter(c => isCityCard(c) && cardColor(c) === color).length >= game.needForCure(me.id) - 1);
        const g = holders.find(h => h.key === 'grant' && h.seat === me.id);
        if (g && near && dS[me.city] >= 3 && game.stations.length < MAX_STATIONS) return cmd(g, { city: me.city });
        const a = holders.find(h => h.key === 'airlift' && h.seat === me.id);
        if (a && ready && dS[me.city] >= 3) {
            const to = game.stations.reduce((b, s) => (DRIVE_DIST[me.city][s] < DRIVE_DIST[me.city][b] ? s : b), game.stations[0]);
            return cmd(a, { pawn: me.id, to });
        }
    }
    return null;
}

function worstDiscardCity(game) {
    let pick = null;
    let worst = 1;
    game.infectionDiscard.forEach(c => {
        const color = CITIES[c].color;
        const k = game.cures[color] === 2 ? 0 : game.cubes[c][color];
        if (k > worst) {
            worst = k;
            pick = c;
        }
    });
    return pick;
}

// 予測：危ない都市ほど下へ
function forecastOrder(game) {
    const k = Math.min(6, game.infectionDeck.length);
    const top = game.infectionDeck.slice(0, k);
    const danger = (c) => {
        const color = CITIES[c].color;
        if (game.cures[color] === 2 || game.prevented(c, color)) return -1;
        return game.cubes[c][color];
    };
    return top.map((c, i) => ({ i, d: danger(c) })).sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.i);
}
