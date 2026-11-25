/**
 * CPU
 * 手番では、手札の各カードの使い方を候補として挙げ、盤面の写しで試して、局面の評価がいちばん上がるものを選ぶ
 * 建築家は、行ける道の端にある「建てたい都市」へ植民者を寄せてから、払える範囲で値打ちの高い都市に建てる
 *
 * 見えない情報は使わない：評価は自分の持ち物・盤面・公開されている捨て札だけで行う（市場の山札の並びや、ほかの人の手札は見ない）
 * ゲームの乱数は使わない（揺れは局面から作った別の乱数で付ける）。CPU の判断は記録されないので、再現がずれないように
 */

import { GOODS, PRICE, CARD_TYPES, STORE_SIZE, HOUSES } from './cards.js';
import { CITIES, CITY, PROVINCES, ROADS, ROAD, ROME } from './map.js';
import { scorePlayer } from './scoring.js';
import { createRandom } from './random.js';

// noise：候補の評価に足す揺れの大きさ。lookahead：建築家の寄せ方で、まだ払えない都市も目指すか
export const PROFILES = {
    easy: { noise: 9, trades: true, diplomat: false, lookahead: true },
    normal: { noise: 0.6, trades: true, diplomat: true, lookahead: true }
};

export function isCpuTurn(game) {
    return !game.isOver() && game.players[game.current]?.isCPU;
}

// 3回続けて進まないときに試す、いちばん単純な手
export function fallbackCommands(game, seat) {
    if (game.phase === 'architect') return [{ type: 'finish' }];
    const p = game.players[seat];
    return p.hand.flatMap(card => [
        { type: 'play', card },
        { type: 'play', card, cash: true },
        { type: 'play', card, trades: [] },
        { type: 'play', card, buys: [] }
    ]);
}

export function runCpuStep(game, seat = game.current, profile = PROFILES[game.players[seat].cpuLevel] ?? PROFILES.normal) {
    if (game.phase === 'architect') {
        return game.applyCommand(seat, architectStep(game, seat, profile));
    }
    const choice = chooseCommand(game, seat, profile);
    if (choice && game.applyCommand(seat, choice)) return true;
    return fallbackCommands(game, seat).some(command => game.applyCommand(seat, command));
}

// ---- 局面の評価 ----

// 進み具合（0：始め〜1：終わり）。市場の残りと、家の数のうち進んだ方
function progress(game) {
    const total = game.cards.filter(c => c.phase).length;
    const left = game.deck.length + game.display.filter(id => id !== null).length;
    const market = 1 - left / Math.max(1, total);
    const houses = Math.max(...game.players.map(p => HOUSES - game.housesLeft(p.id))) / HOUSES;
    return Math.min(1, Math.max(market, houses));
}

// その人から見た局面の値打ち
// t：進み具合。手を比べるときは、打つ前の局面の値に固定する（自分が建てただけで重みが変わらないように）
export function evaluate(game, seat, t = progress(game)) {
    const p = game.players[seat];
    const score = scorePlayer(game, seat).total;
    // 品は、これから建てる・植民者を置くのに要る分を高く、余る分を低く見る
    const want = wantedGoods(game, seat);
    const goodsValue = GOODS.reduce((sum, g) => sum + (Math.min(p.goods[g], want[g]) * 1.3 + Math.max(0, p.goods[g] - want[g]) * 0.45) * PRICE[g], 0);
    const myCities = CITIES.filter(c => game.houses[c.id].includes(seat));
    // 家は、生産の元と、これからの得点の元
    const houseValue = myCities.reduce((sum, c) => sum + 16 + PRICE[game.cityGoods[c.id]] * 1.5, 0);
    const colonists = game.colonists.filter(c => c.owner === seat && game.onBoard(c)).length;
    // 植民者の行き先：数歩先までの、建てたい都市への近さ
    const info = cityGains(game, seat);
    const reach = game.colonists.filter(c => c.owner === seat && game.onBoard(c)).reduce((sum, c) => sum + potential(info, c), 0);
    const cards = p.hand.length + p.discard.length;
    // お金はためすぎても使い道がないので、25 を超えた分は低く見る
    const money = Math.min(p.money, 25) + Math.max(0, p.money - 25) * 0.5;
    const economy = money + goodsValue + houseValue + colonists * 9 + reach * 0.35 + cards * 7 + p.hand.length * 1.2;
    return score * (0.35 + 1.4 * t) + economy * (1.25 - t);
}

// ---- 手番：カードを選ぶ ----

function chooseCommand(game, seat, profile) {
    const random = createRandom(hashState(game, seat));
    const t = progress(game);
    const before = evaluate(game, seat, t);
    let best = null;
    let bestValue = -Infinity;
    candidates(game, seat, profile).forEach(command => {
        const copy = game.clone();
        if (!copy.applyCommand(seat, command)) return;
        // 建築家は、続きを最後まで打ってから比べる
        let guard = 0;
        while (copy.phase === 'architect' && copy.current === seat && guard++ < 60) {
            if (!copy.applyCommand(seat, architectStep(copy, seat, profile))) copy.applyCommand(seat, { type: 'finish' });
        }
        const value = evaluate(copy, seat, t) - before + adjust(game, seat, command) + (random() - 0.5) * profile.noise * 2;
        if (value > bestValue) {
            bestValue = value;
            best = command;
        }
    });
    return best;
}

// 評価だけでは見えない、手札の回し方の補正
function adjust(game, seat, command) {
    const p = game.players[seat];
    const type = CARD_TYPES[game.cards[command.card].type];
    if (type.kind === 'tribune') {
        // 手札が少ないほど、戻す値打ちがある
        return p.hand.length <= 2 ? 6 : p.hand.length <= 3 ? 1 : -6 - p.hand.length;
    }
    return 0;
}

// 局面から作るシード（同じ局面なら同じ手）
function hashState(game, seat) {
    let h = 2166136261 ^ seat;
    const text = `${game.turn}|${game.current}|${game.players.map(p => `${p.money},${p.hand.length},${p.discard.length}`).join(';')}|${game.colonists.map(c => `${c.city}${c.road}`).join('')}`;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

function candidates(game, seat, profile) {
    const p = game.players[seat];
    const list = [];
    const seen = new Set();
    p.hand.forEach(card => {
        const typeId = game.cards[card].type;
        if (seen.has(typeId)) return;
        seen.add(typeId);
        const type = CARD_TYPES[typeId];
        if (type.kind === 'diplomat') {
            if (!profile.diplomat) return;
            game.players.forEach(other => {
                const top = other.discard.at(-1);
                if (other.id === seat || top === undefined) return;
                const copied = CARD_TYPES[game.cards[top].type];
                if (copied.kind === 'diplomat') return;
                actionCandidates(game, seat, game.cards[top].type, profile).forEach(c => list.push({ type: 'play', card, copy: other.id, ...c }));
            });
            return;
        }
        actionCandidates(game, seat, typeId, profile).forEach(c => list.push({ type: 'play', card, ...c }));
    });
    return list;
}

// カードの種類ごとの、効果の中身の候補
function actionCandidates(game, seat, typeId, profile) {
    const type = CARD_TYPES[typeId];
    const p = game.players[seat];
    switch (type.kind) {
        case 'tribune': {
            const list = [{}];
            if (p.goods.food >= 1 && p.goods.tool >= 1) {
                if (p.store.land > 0) list.push({ colonist: 'land' });
                if (p.store.sea > 0) list.push({ colonist: 'sea' });
            }
            return list;
        }
        case 'architect':
        case 'craftsman':
            return [{}];
        case 'prefect':
            return [...PROVINCES.filter(pr => game.bonus[pr.id].active).map(pr => ({ province: pr.id })), { cash: true }];
        case 'mercator':
            return tradeCandidates(game, seat, type, profile);
        case 'senator':
        case 'consul':
            return buyCandidates(game, seat, type.kind === 'senator');
        case 'colonist':
            return colonistCandidates(game, seat);
        default:
            return [{}];
    }
}

// 欲しい品：近くの建てたい都市の費用と、植民者の分
function wantedGoods(game, seat) {
    const want = Object.fromEntries(GOODS.map(g => [g, 0]));
    const targets = targetCities(game, seat).slice(0, 3);
    targets.forEach(city => {
        const { goods } = game.buildCost(city);
        Object.entries(goods).forEach(([g, n]) => { want[g] += n; });
    });
    const colonists = game.colonists.filter(c => c.owner === seat && game.onBoard(c)).length;
    if (colonists < 5) {
        want.food += 1;
        want.tool += 1;
    }
    want.brick = Math.max(want.brick, 2);
    return want;
}

function tradeCandidates(game, seat, type, profile) {
    const p = game.players[seat];
    const list = [{ trades: [] }];
    const want = wantedGoods(game, seat);
    const money = p.money + (type.money ?? 3);
    const free = STORE_SIZE - game.storeUsed(p);
    // 余っている品を売る
    const surplus = GOODS.map(g => ({ good: g, n: p.goods[g] - want[g] })).filter(x => x.n > 0).sort((a, b) => PRICE[b.good] * b.n - PRICE[a.good] * a.n);
    // 足りない品を買う
    const lacking = GOODS.map(g => ({ good: g, n: want[g] - p.goods[g] })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    // 売る数は、全部か、空きを作る分（1〜3）
    surplus.slice(0, 2).forEach(s => {
        const counts = [...new Set([s.n, Math.min(s.n, 1), Math.min(s.n, 2), Math.min(s.n, 3)])];
        counts.forEach(k => {
            list.push({ trades: [{ good: s.good, amount: -k }] });
            if (!profile.trades) return;
            lacking.forEach(l => {
                if (l.good === s.good) return;
                const cash = money + k * PRICE[s.good];
                const n = Math.min(l.n, Math.floor(cash / PRICE[l.good]), free + k);
                if (n > 0) list.push({ trades: [{ good: s.good, amount: -k }, { good: l.good, amount: n }] });
            });
        });
    });
    if (profile.trades) {
        // 買うだけ（2種類まで）
        const buys = [];
        let cash = money;
        let room = free;
        lacking.slice(0, 2).forEach(l => {
            const n = Math.min(l.n, Math.floor(cash / PRICE[l.good]), room);
            if (n > 0) {
                buys.push({ good: l.good, amount: n });
                cash -= n * PRICE[l.good];
                room -= n;
            }
        });
        if (buys.length) list.push({ trades: buys });
        if (buys.length > 1) list.push({ trades: [buys[0]] });
    }
    return list;
}

// 好きな品で払う分は、欲しくない品の安いものから選ぶ
function payWild(goodsLeft, count, want) {
    const paid = [];
    for (let i = 0; i < count; i++) {
        const pick = [...GOODS].filter(g => goodsLeft[g] > 0)
            .sort((a, b) => (goodsLeft[b] - want[b] > 0 ? 1 : 0) - (goodsLeft[a] - want[a] > 0 ? 1 : 0) || PRICE[a] - PRICE[b])[0];
        if (!pick) return null;
        goodsLeft[pick]--;
        paid.push(pick);
    }
    return paid;
}

function buyCandidates(game, seat, senator) {
    const p = game.players[seat];
    const want = wantedGoods(game, seat);
    const slots = game.display.map((id, slot) => (id === null ? null : slot)).filter(s => s !== null);
    const tryBuy = (chosen) => {
        const left = { ...p.goods };
        const buys = [];
        for (const slot of chosen) {
            const { goods, wild } = game.marketCost(slot, senator);
            for (const [g, n] of Object.entries(goods)) {
                left[g] -= n;
                if (left[g] < 0) return null;
            }
            const paid = payWild(left, wild, want);
            if (!paid) return null;
            buys.push({ slot, wild: paid });
        }
        return { buys };
    };
    const list = [{ buys: [] }];
    slots.forEach(a => {
        const one = tryBuy([a]);
        if (one) list.push(one);
        if (senator) {
            slots.forEach(b => {
                if (b <= a) return;
                const two = tryBuy([a, b]);
                if (two) list.push(two);
            });
        }
    });
    return list;
}

function colonistCandidates(game, seat) {
    const p = game.players[seat];
    const list = [{ cash: true }];
    const n = Math.min(p.goods.food, p.goods.tool, p.store.land + p.store.sea);
    if (n <= 0) return list;
    const cities = game.colonistCities(seat);
    // 置く都市：植民者の少ない場所（ローマより、自分の家の都市を先に）
    const spots = [...cities].sort((a, b) => (a === ROME) - (b === ROME));
    const kinds = [];
    let land = p.store.land;
    let sea = p.store.sea;
    for (let i = 0; i < n; i++) {
        if (land >= sea && land > 0) { kinds.push('land'); land--; } else if (sea > 0) { kinds.push('sea'); sea--; } else if (land > 0) { kinds.push('land'); land--; }
    }
    for (let k = 1; k <= kinds.length; k++) {
        const place = kinds.slice(0, k).map((kind, i) => ({ city: bestSpot(game, seat, spots, kind, i), kind }));
        list.push({ place });
    }
    return list;
}

// その種類の植民者を置くのによい都市（その種類の道が多く出ていて、近くに建てたい都市がある）
function bestSpot(game, seat, spots, kind) {
    let best = ROME;
    let bestScore = -Infinity;
    spots.forEach(city => {
        const roads = ROADS.filter(r => r.kind === kind && (r.a === city || r.b === city));
        const score = roads.reduce((s, r) => s + cityWorth(game, seat, r.a === city ? r.b : r.a), 0) / 10 + roads.length * 0.1;
        if (score > bestScore) {
            bestScore = score;
            best = city;
        }
    });
    return best;
}

// ---- 建築家 ----

// 都市に建てる値打ち（建てられない都市は 0）
function cityWorth(game, seat, city) {
    if (city === ROME || game.houses[city].includes(seat)) return 0;
    const good = game.cityGoods[city];
    const myCities = CITIES.filter(c => game.houses[c.id].includes(seat));
    const province = CITY[city].province;
    let worth = 10 + PRICE[good] * 1.4;
    if (!myCities.some(c => c.province === province)) worth += 5;            // 新しい州（サトゥルヌス）
    if (!myCities.some(c => game.cityGoods[c.id] === good)) worth += 4;      // 新しい品（メルクリウス）
    if (good !== 'brick') worth += 1;                                        // ユピテル
    // 州のボーナスがその品なら、生産の機会が増える
    if (game.bonus[province].good === good) worth += 1;
    return worth;
}

// 建てる費用まで含めた差し引きの値打ち
function buildGain(game, seat, city) {
    const { money } = game.buildCost(city);
    return cityWorth(game, seat, city) - money * 0.9;
}

// これから建てたい都市：植民者から数歩で届く都市のうち、値打ちの高い順（払えるかは問わない）
function targetCities(game, seat) {
    const info = cityGains(game, seat);
    const best = {};
    game.colonists.filter(c => c.owner === seat && game.onBoard(c)).forEach(c => {
        const starts = c.road !== null ? [[c.road, 0]] : ROADS.filter(r => r.kind === c.kind && (r.a === c.city || r.b === c.city)).map(r => [r.id, 1]);
        starts.forEach(([road, base]) => {
            ROAD_DIST[road].forEach((d, other) => {
                if (d + base > 4) return;
                [ROAD[other].a, ROAD[other].b].forEach(city => {
                    const g = info.gains[city];
                    if (!g) return;
                    const v = g.gain * Math.pow(0.8, d + base);
                    if (v > (best[city] ?? 0)) best[city] = v;
                });
            });
        });
    });
    return Object.keys(best).sort((a, b) => best[b] - best[a]);
}

// 都市ごとの、建てて得になる値打ちと払えるか（局面ごとに1回だけ作る）
function cityGains(game, seat) {
    const p = game.players[seat];
    const gains = {};
    CITIES.forEach(c => {
        if (game.houses[c.id].includes(seat)) return;
        const gain = buildGain(game, seat, c.id);
        if (gain > 0) gains[c.id] = { gain, affordable: game.canPay(p, game.buildCost(c.id)) };
    });
    return { gains, occupied: new Set(game.colonists.filter(c => c.road !== null).map(c => c.road)) };
}

// 道の値打ち：両端の都市のうち、建てて得になる値打ち
function roadValue(info, road, affordableOnly) {
    const { a, b } = ROAD[road];
    let sum = 0;
    [a, b].forEach(city => {
        const g = info.gains[city];
        if (!g) return;
        sum += affordableOnly && !g.affordable ? g.gain * 0.35 : g.gain;
    });
    return sum;
}

// 建築家の1手：寄せる → 建てる → 終える
export function architectStep(game, seat, profile = PROFILES.normal) {
    const p = game.players[seat];
    const arch = game.architect;
    if (!arch.built && arch.steps > 0) {
        const move = bestMove(game, seat, profile);
        if (move) return move;
    }
    // 払える都市のうち、得になるものを高い順に建てる
    const options = game.buildableCities(seat)
        .filter(city => game.canPay(p, game.buildCost(city)) && game.housesLeft(seat) > 0)
        .map(city => ({ city, gain: buildGain(game, seat, city) }))
        .filter(x => x.gain > 0)
        .sort((a, b) => b.gain - a.gain);
    if (options.length) return { type: 'build', city: options[0].city };
    return { type: 'finish' };
}

// 道どうしの歩数（その種類の道だけを通る）
const ROAD_DIST = (() => {
    const dist = {};
    ROADS.forEach(start => {
        const seen = new Map([[start.id, 0]]);
        const queue = [start.id];
        while (queue.length) {
            const r = queue.shift();
            const { a, b } = ROAD[r];
            ROADS.forEach(next => {
                if (next.kind !== start.kind || seen.has(next.id)) return;
                if (next.a === a || next.a === b || next.b === a || next.b === b) {
                    seen.set(next.id, seen.get(r) + 1);
                    queue.push(next.id);
                }
            });
        }
        dist[start.id] = seen;
    });
    return dist;
})();

// 植民者の近さの値打ち：いる道（都市にいるなら、そこから出る道に1歩）から、数歩先までの道の値打ちを、遠いほど割り引いた最大
function potential(info, colonist) {
    const starts = colonist.road !== null ? [[colonist.road, 0]] : ROADS.filter(r => r.kind === colonist.kind && (r.a === colonist.city || r.b === colonist.city)).map(r => [r.id, 1]);
    let best = 0;
    starts.forEach(([road, base]) => {
        ROAD_DIST[road].forEach((d, other) => {
            const total = d + base;
            if (total > 5) return;
            if (other !== colonist.road && info.occupied.has(other)) return;
            const v = roadValue(info, other, false) * Math.pow(0.7, total);
            if (v > best) best = v;
        });
    });
    return best;
}

function bestMove(game, seat, profile) {
    const mine = game.colonists.filter(c => c.owner === seat && game.onBoard(c));
    let best = null;
    let bestGain = 0.5;
    const info = cityGains(game, seat);
    mine.forEach(c => {
        const here = c.road !== null ? roadValue(info, c.road, !profile.lookahead) : 0;
        const herePotential = potential(info, c);
        ROADS.forEach(r => {
            if (r.kind !== c.kind || r.id === c.road || game.roadOccupied(r.id)) return;
            const d = game.distance(c, r.id);
            if (d > game.architect.steps) return;
            // 今すぐ建てられる値打ちと、次に向けた近さ。遠いほど少し割り引く（歩数をほかの植民者に残す）
            const moved = { ...c, road: r.id, city: null };
            const gain = roadValue(info, r.id, !profile.lookahead) - here
                + (profile.lookahead ? (potential(info, moved) - herePotential) * 0.5 : 0) - d * 0.6;
            if (gain > bestGain) {
                bestGain = gain;
                best = { type: 'move', colonist: c.id, road: r.id };
            }
        });
    });
    return best;
}

