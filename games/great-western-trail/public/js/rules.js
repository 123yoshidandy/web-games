/**
 * グレート・ウエスタン・トレイル（初版）のルール
 * 状態は JSON にできる形で持ち、ここの関数が書き換える。断るときは RuleError を投げる（game.js が写しで試すので、元の状態は変わらない）
 *
 * 手番の流れ
 * - move：牧場主を進める（command move）。最初の手番は好きな中立の建物に置く
 * - act：止まった場所を使う（local：建物のアクション／aux：補助アクション1つ／end：終える）
 * - kc：カンザスシティ。先読み3つ → 収入と配達 を選び、終わったら自動で手番を終える
 * アクションの中で選ぶもの（雇う人・建てる場所・機関車の行き先など）は turn.queue に積み、choose で答える（skip は任意のものだけ）
 * 目標カードは、移動の前か、アクションの合間（queue が空のとき）に出せる
 */

import {
    BREEDS, MARKET_SIZE, BUY_OPTIONS, OBJECTIVES, START_OBJECTIVES, OBJECTIVE_IDS, MARKET_IDS, card, startDeckIds,
    NEUTRAL, BUILDINGS, RISK_ACTIONS, TRAIL, NEUTRAL_SPOTS, PLOT_SPOTS, HAZARD_SPOTS, TRADE_VALUES, TRADE_SPOTS,
    TOLL, WORKERS, WORKER_TYPES, supplyPiles, JOB_COSTS, JOB_REFILL_ROWS, WORKER_BONUS, MAX_WORKERS,
    STATIONS, LAST_SPACE, SIGNALS, MASTERS, CITIES, CITY_BY_ID, CITY_LINKS, DISCS, DISC_ORDER, CERT_STEPS, AUX_KINDS,
    START_MONEY, HAZARD_TYPES, BUILDING_NUMBERS
} from './data.js';

export class RuleError extends Error {}
const fail = (message) => { throw new RuleError(message); };

export const clone = (state) => structuredClone(state);

// 操作の種類ごとに、記録する項目
const CHOOSE_FIELDS = ['option', 'cards', 'breed', 'worker', 'tile', 'spot', 'to', 'pick', 'hazard', 'teepee', 'city', 'disc', 'certs', 'master', 'count', 'path', 'kind', 'double', 'index'];
export const COMMAND_FIELDS = {
    move: ['path'], objective: ['card'], local: ['index'], aux: ['kind'], choose: CHOOSE_FIELDS, skip: [], end: []
};

// ---- 乱数（状態の中に持つので、写しても同じ続きになる） ----
function rand(s) {
    s.rng = (s.rng + 0x6D2B79F5) >>> 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffleIn(s, array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rand(s) * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ---- 準備 ----
export function createState(setup, seed) {
    const n = setup.length;
    const s = { rng: seed >>> 0, n, round: 1 };
    s.spots = {};
    Object.keys(TRAIL).forEach(id => { if (['neutral', 'plot', 'hazard', 'teepee'].includes(TRAIL[id].kind)) s.spots[id] = null; });
    TRADE_SPOTS.forEach(id => { s.spots[id] = null; });
    NEUTRAL_SPOTS.forEach(id => { s.spots[id] = { t: 'neutral', id }; });
    const masters = shuffleIn(s, Object.keys(MASTERS));
    s.stations = STATIONS.map((_, i) => ({ discs: [], master: i < 5 ? masters[i] : null, worker: null }));
    const piles = supplyPiles().map(pile => shuffleIn(s, pile));
    s.supply = piles;
    // 山1から7枚を盤に置く（置けなければ山に戻す）
    let placed = 0;
    const back = [];
    while (placed < 7 && s.supply[0].length > 0) {
        const tile = s.supply[0].pop();
        if (placeTile(s, tile)) placed++;
        else back.push(tile);
    }
    s.supply[0].unshift(...back);
    // 求人市場：2人3枚・3人5枚・4人7枚
    s.job = { rows: Array.from({ length: JOB_COSTS.length }, () => Array(n).fill(null)), row: 0, fill: 0 };
    for (let i = 0; i < 2 * n - 1; i++) pushWorker(s, s.supply[1].pop().w, null);
    s.foresight = [0, 1, 2].map(i => [s.supply[i].pop() ?? null, s.supply[i].pop() ?? null]);
    s.marketStack = shuffleIn(s, [...MARKET_IDS]);
    s.market = s.marketStack.splice(0, MARKET_SIZE[n]);
    s.objStack = shuffleIn(s, [...OBJECTIVE_IDS]);
    s.objDisplay = s.objStack.splice(0, 4);
    const starts = shuffleIn(s, [...START_OBJECTIVES]);
    const first = Math.floor(rand(s) * n);
    s.players = setup.map((p, seat) => {
        const deck = shuffleIn(s, startDeckIds(seat));
        return {
            seat, name: p.name, isCPU: p.isCPU,
            money: START_MONEY[(seat - first + n) % n],
            deck, hand: [], discard: [], removed: [], objectives: [starts[seat]],
            workers: { cowboy: 1, craftsman: 1, engineer: 1 },
            cert: 0, masters: [], discs: Object.fromEntries(Object.keys(DISCS).map(k => [k, DISCS[k].count])),
            buildings: [...BUILDING_NUMBERS], loc: null, engine: 0,
            hazards: [], teepees: [], cities: Object.fromEntries(CITIES.map(c => [c.id, 0])),
            token: false, turns: 0, kcVisits: 0
        };
    });
    s.players.forEach(p => drawCards(s, p, 4));
    s.first = first;
    s.end = { by: null, left: null };
    s.phase = 'play';
    s.winners = [];
    s.turn = newTurn(first);
    return s;
}

const newTurn = (seat) => ({ seat, stage: 'move', used: [], mode: null, queue: [], autoEnd: false });

// ---- 道具 ----
export const handLimit = (p) => 4 + (DISCS.hand.count - p.discs.hand);
export function stepLimit(s, p) {
    const a = p.discs.step1 === 0 ? 1 : 0;
    const b = p.discs.step2 === 0 ? 1 : 0;
    if (s.n === 2) return 3 + a + b;
    if (s.n === 3) return 3 + 2 * a + b;
    return 4 + 2 * a + b;
}
export const certLimit = (p) => (p.discs.cert4 === 0 ? (p.discs.cert6 === 0 ? 6 : 4) : 3);
export const permCerts = (p) => p.masters.filter(m => MASTERS[m].now === 'cert').length;
export function addCert(p, k) {
    const i = CERT_STEPS.indexOf(p.cert);
    const limit = certLimit(p);
    let target = p.cert;
    for (let j = i + 1; j <= Math.min(CERT_STEPS.length - 1, i + k); j++) if (CERT_STEPS[j] <= limit) target = CERT_STEPS[j];
    const gained = target - p.cert;
    p.cert = target;
    return gained;
}
// 補助アクションの段（0：使えない・1：単発・2：倍まで）
export function auxLevel(p, kind) {
    const disc = AUX_KINDS[kind].disc;
    const removed = DISCS[disc].count - p.discs[disc];
    return kind === 'money' || kind === 'draw' ? Math.min(2, 1 + removed) : removed;
}
export const ownedCards = (p) => [...p.deck, ...p.hand, ...p.discard];
export const cattleIn = (ids) => ids.filter(id => card(id).kind === 'cattle');

// 手札の繁殖値（違う品種の繁殖値の合計）
export function breedingValue(ids) {
    const breeds = new Set(cattleIn(ids).map(id => card(id).breed));
    return [...breeds].reduce((sum, b) => sum + BREEDS[b].value, 0);
}

function drawCards(s, p, k) {
    const drawn = [];
    for (let i = 0; i < k; i++) {
        if (p.deck.length === 0) {
            if (p.discard.length === 0) break;
            p.deck = shuffleIn(s, p.discard);
            p.discard = [];
        }
        const id = p.deck.pop();
        p.hand.push(id);
        drawn.push(id);
    }
    return drawn;
}

function discardFromHand(p, ids) {
    const hand = [...p.hand];
    ids.forEach(id => {
        const i = hand.indexOf(id);
        if (i < 0) fail('手札にないカードです');
        hand.splice(i, 1);
    });
    p.hand = hand;
    p.discard.push(...ids);
}

function pay(p, amount) {
    if (p.money < amount) fail(`お金が足りません（$${amount} 必要）`);
    p.money -= amount;
}

const playerName = (s, seat) => s.players[seat].name;
const turnPlayer = (s) => s.players[s.turn.seat];

// ---- タイルを置く（災害・ティーピー・労働者） ----
function placeTile(s, tile) {
    if (tile.t === 'hazard') {
        const spot = HAZARD_SPOTS[tile.type].find(id => !s.spots[id]);
        if (!spot) return false;
        s.spots[spot] = { t: 'hazard', type: tile.type, hand: tile.hand, vp: tile.vp };
        return true;
    }
    if (tile.t === 'teepee') {
        const spot = TRADE_SPOTS.find(id => !s.spots[id]);
        if (!spot) return false;
        s.spots[spot] = { t: 'teepee', color: tile.color };
        return true;
    }
    return false;
}

// 求人市場のトークンの段に、左から労働者を置く。段が埋まるとトークンが次の段へ進む
function pushWorker(s, worker, seat, out) {
    const job = s.job;
    if (job.row >= JOB_COSTS.length) return false;
    job.rows[job.row][job.fill] = worker;
    job.fill++;
    if (job.fill >= s.n) {
        job.row++;
        job.fill = 0;
        if (JOB_REFILL_ROWS.includes(job.row)) {
            const before = s.market.length;
            while (s.market.length < MARKET_SIZE[s.n] && s.marketStack.length > 0) s.market.push(s.marketStack.pop());
            if (out && s.market.length > before) out.logs.push({ seat: null, text: `牛の市場を補充（${s.market.length - before}枚）` });
        }
        if (job.row >= JOB_COSTS.length && seat !== null && s.end.by === null) {
            s.end.by = seat;
            s.players[seat].token = true;
            out?.logs.push({ seat, text: `${playerName(s, seat)}が求人市場を埋めた。ほかの人は1回ずつで終わり` });
        }
    }
    return true;
}

export function hireableWorkers(s) {
    const list = [];
    for (let r = 0; r < Math.min(s.job.row, JOB_COSTS.length); r++) {
        s.job.rows[r].forEach((w, c) => { if (w) list.push({ row: r, col: c, w, cost: JOB_COSTS[r] }); });
    }
    return list;
}

// ---- 道と移動 ----
export function isLocation(s, id) {
    if (id === 'KC') return true;
    const kind = TRAIL[id]?.kind;
    if (!kind || kind === 'start') return false;
    return !!s.spots[id];
}

// 今の場所から、limit 歩までで行ける道のり（場所の id の並び）をすべて返す
export function movePaths(s, seat, limit, { noKC = false } = {}) {
    const p = s.players[seat];
    if (p.loc === null) return NEUTRAL_SPOTS.map(id => [id]);
    const seen = new Set();
    const result = [];
    const walk = (node, steps, path) => {
        for (const next of TRAIL[node].next) {
            if (isLocation(s, next)) {
                if (steps + 1 > limit || (next === 'KC' && noKC)) continue;
                const np = [...path, next];
                const key = np.join('>');
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(np);
                }
                if (next !== 'KC') walk(next, steps + 1, np);
            } else {
                walk(next, steps, path);
            }
        }
    };
    walk(p.loc, 0, []);
    return result;
}

// 場所の手の通行料（払う先：null は銀行）
export function tollOf(s, seat, id) {
    const tile = s.spots[id];
    if (!tile) return null;
    const fee = TOLL[s.n];
    let hands = '';
    let to = null;
    if (tile.t === 'building') {
        if (tile.owner === seat) return null;
        hands = BUILDINGS[tile.n].hands;
        to = tile.owner;
    } else if (tile.t === 'hazard') {
        hands = tile.hand;
    } else if (tile.t === 'teepee') {
        hands = tile.color === 'green' ? 'g' : 'b';
    }
    const amount = [...hands].reduce((sum, h) => sum + fee[h], 0);
    return amount > 0 ? { amount, to } : null;
}

export function pathToll(s, seat, path) {
    return path.reduce((sum, id) => sum + (tollOf(s, seat, id)?.amount ?? 0), 0);
}

function walkPath(s, seat, path, out, { noFees = false } = {}) {
    const p = s.players[seat];
    let paidBank = 0;
    const paidTo = {};
    if (!noFees) {
        path.forEach(id => {
            const toll = tollOf(s, seat, id);
            if (!toll) return;
            const amount = Math.min(p.money, toll.amount);
            p.money -= amount;
            if (toll.to === null) paidBank += amount;
            else {
                s.players[toll.to].money += amount;
                paidTo[toll.to] = (paidTo[toll.to] ?? 0) + amount;
            }
        });
    }
    p.loc = path.at(-1);
    const fees = [];
    if (paidBank > 0) fees.push(`銀行に$${paidBank}`);
    Object.entries(paidTo).forEach(([to, amount]) => fees.push(`${playerName(s, Number(to))}に$${amount}`));
    return fees.length > 0 ? `（通行料：${fees.join('・')}）` : '';
}

export function locName(s, id) {
    if (id === 'KC') return 'カンザスシティ';
    const tile = s.spots[id];
    if (!tile) return '道';
    if (tile.t === 'neutral') return `中立の建物${tile.id}`;
    if (tile.t === 'building') return `${playerName(s, tile.owner)}の建物${tile.n}`;
    if (tile.t === 'hazard') return HAZARD_TYPES[tile.type];
    return tile.color === 'green' ? '緑のティーピー' : '青のティーピー';
}

// 止まった場所で使えるアクション（中立の建物か自分の建物なら、その建物のアクション）
export function localActions(s, seat) {
    const p = s.players[seat];
    const tile = p.loc ? s.spots[p.loc] : null;
    if (!tile) return [];
    if (tile.t === 'neutral') return NEUTRAL[tile.id];
    if (tile.t === 'building' && tile.owner === seat) {
        const list = [...BUILDINGS[tile.n].actions];
        const risk = TRAIL[p.loc].risk;
        if (risk) list.push(RISK_ACTIONS[risk]);
        return list;
    }
    return [];
}

// ---- 鉄道 ----
const TURNOUTS = new Map(STATIONS.map((st, i) => [st.space, i]));
export const stationAt = (space) => (TURNOUTS.has(space) ? TURNOUTS.get(space) : null);
function nextSpaces(x) {
    if (x === LAST_SPACE) return [];
    if (!Number.isInteger(x)) return [x + 0.5];
    if (x === LAST_SPACE - 1) return [LAST_SPACE];
    return TURNOUTS.has(x + 0.5) ? [x + 1, x + 0.5] : [x + 1];
}
function prevSpaces(x) {
    if (x === 0) return [];
    if (!Number.isInteger(x)) return [x - 0.5];
    if (x === LAST_SPACE) return [LAST_SPACE - 1];
    return TURNOUTS.has(x - 0.5) ? [x - 1, x - 0.5] : [x - 1];
}
const occupied = (s, seat, x) => x !== 0 && s.players.some(p => p.seat !== seat && p.engine === x);

// 前へ max マスまでで止まれるマス（ほかの機関車のマスは、ないものとして飛ばす）
export function engineForward(s, seat, max) {
    const from = s.players[seat].engine;
    const best = new Map();
    const walk = (x, cost) => {
        for (const y of nextSpaces(x)) {
            const c = occupied(s, seat, y) ? cost : cost + 1;
            if (c > max) continue;
            if (!occupied(s, seat, y)) {
                if (best.has(y) && best.get(y) <= c) continue;
                best.set(y, c);
                if (y === LAST_SPACE) continue;
            }
            walk(y, c);
        }
    };
    walk(from, 0);
    return [...best.keys()].sort((a, b) => a - b);
}

// ちょうど k マス戻ったときに止まれるマス
export function engineBackward(s, seat, k) {
    const from = s.players[seat].engine;
    const result = new Set();
    const walk = (x, cost) => {
        for (const y of prevSpaces(x)) {
            const occ = occupied(s, seat, y);
            const c = occ ? cost : cost + 1;
            if (c > k) continue;
            if (!occ && c === k) result.add(y);
            else walk(y, c);
        }
    };
    walk(from, 0);
    return [...result].sort((a, b) => a - b);
}

// 後ろの、空いているマスすべて（39 から戻るとき・特別な配達）
export function engineBehind(s, seat) {
    const from = s.players[seat].engine;
    const list = [];
    for (let x = 0; x < from; x += 0.5) {
        if (!Number.isInteger(x) && !TURNOUTS.has(x)) continue;
        if (!occupied(s, seat, x)) list.push(x);
    }
    return list;
}

// 特別な配達で数える、戻ったマスの数（ふさがったマスと待避線は数えない）
export function backCount(s, seat, to) {
    const from = s.players[seat].engine;
    let count = 0;
    for (let x = Math.ceil(to); x <= Math.ceil(from) - 1; x++) if (!occupied(s, seat, x)) count++;
    return count;
}

export const signalsBelow = (v) => SIGNALS.filter(x => x < v).length;
export const transportCost = (engine, cityValue) => Math.max(0, signalsBelow(cityValue) - signalsBelow(Math.ceil(engine)));

// ---- 円盤 ----
export function discsLeft(p) {
    return DISC_ORDER.filter(k => p.discs[k] > 0);
}
// 置ける円盤の種類（dark：置く場所が暗い角なら、どの円盤でも）
export function allowedDiscs(p, dark) {
    const left = discsLeft(p);
    if (dark) return left;
    const white = left.filter(k => !DISCS[k].dark);
    return white.length > 0 ? white : left;
}
function takeDisc(s, p, key, dark, out) {
    if (key === 'station') {
        if (discsLeft(p).length > 0) fail('まだ円盤があります');
        const i = s.stations.findIndex(st => st.discs.includes(p.seat));
        if (i < 0) fail('置ける円盤がありません');
        s.stations[i].discs = s.stations[i].discs.filter(x => x !== p.seat);
        out.notes.push(`駅${i + 1}の円盤を使った`);
        return;
    }
    if (!allowedDiscs(p, dark).includes(key)) fail('その円盤はここに置けません');
    if (key === 'hand') pay(p, 5);
    p.discs[key]--;
    if (key === 'step1') p.money += 3;
}
export function canTakeAnyDisc(s, p, dark, extraMoney = 0) {
    const list = allowedDiscs(p, dark).filter(k => k !== 'hand' || p.money + extraMoney >= 5);
    if (list.length > 0) return true;
    return discsLeft(p).length === 0 && s.stations.some(st => st.discs.includes(p.seat));
}

// ---- 効果を始める ----
// 建物のアクションなどの効果。選ぶものがあれば queue に積む（先頭に積む）
function push(s, item) {
    s.turn.queue.unshift(item);
}

const discardNeedMet = (s, p, need) => {
    const cattle = cattleIn(p.hand);
    if (need === 'any') return cattle.length > 0;
    if (need === 'pair') {
        const counts = {};
        cattle.forEach(id => { counts[card(id).breed] = (counts[card(id).breed] ?? 0) + 1; });
        return Object.values(counts).some(c => c >= 2);
    }
    return cattle.some(id => card(id).breed === need);
};

// その効果を今始められるか（条件を満たさないアクションは、画面で押せないようにする）
export function canStart(s, seat, effect) {
    const p = s.players[seat];
    switch (effect.e) {
        case 'discard': return discardNeedMet(s, p, effect.need);
        case 'hire': return hireOptions(s, seat, effect.mod).length > 0;
        case 'build': return buildOptions(s, seat, effect.per).length > 0;
        case 'certOrObjective': return certLimit(p) > p.cert || s.objDisplay.length + s.objStack.length > 0;
        case 'engine': return engineForward(s, seat, engineMax(p, effect.max)).length > 0;
        case 'tradeOrEngine': return tradeOptions(s, seat).length > 0 || (p.money >= 2 && engineForward(s, seat, 2).length > 0);
        case 'aux': return auxOptions(s, seat, true).length > 0;
        case 'buy': return p.workers.cowboy > 0 && (s.market.length > 0 || s.marketStack.length > 0);
        case 'hazard': return hazardOptions(s, effect.cost, p.money).length > 0;
        case 'moveAgain': return movePaths(s, seat, effect.max).length > 0;
        case 'woods': return true;
        case 'teepeePairs': return pairsOf(p) > 0;
        case 'tradeOrAux': return tradeOptions(s, seat).length > 0 || auxOptions(s, seat, true).length > 0;
        case 'specialDelivery': return engineBehind(s, seat).length > 0 && canTakeAnyDisc(s, p, true);
        case 'certMax': return certLimit(p) > p.cert;
        default: return false;
    }
}

const engineMax = (p, max) => (max === 'engineers' ? p.workers.engineer : max);
const pairsOf = (p) => Math.min(p.teepees.filter(t => t === 'green').length, p.teepees.filter(t => t === 'blue').length);

function startEffect(s, seat, effect, out, src = null) {
    const p = s.players[seat];
    switch (effect.e) {
        case 'discard': {
            if (effect.need === 'any' || effect.need === 'pair') {
                push(s, { p: 'discard', need: effect.need, money: effect.money ?? 0, cert: effect.cert ?? 0, src, optional: true });
                return;
            }
            const id = p.hand.find(x => card(x).kind === 'cattle' && card(x).breed === effect.need);
            if (!id) fail(`${BREEDS[effect.need].name}が手札にありません`);
            discardFromHand(p, [id]);
            const parts = [];
            if (effect.cert) parts.push(`証明書+${addCert(p, effect.cert)}`);
            if (effect.money) {
                p.money += effect.money;
                parts.push(`$${effect.money}`);
            }
            out.notes.push(`${BREEDS[effect.need].name}を捨てて${parts.join('と')}`);
            markUsed(s, src);
            return;
        }
        case 'woods': {
            const count = PLOT_SPOTS.filter(id => TRAIL[id].woods && s.spots[id]?.t === 'building' && s.spots[id].owner === seat).length;
            p.money += 2 * count;
            out.notes.push(`森の建物${count}つで$${2 * count}`);
            markUsed(s, src);
            return;
        }
        case 'teepeePairs': {
            const pairs = pairsOf(p);
            const gained = addCert(p, 2 * pairs);
            p.money += 2 * pairs;
            out.notes.push(`ティーピーの組${pairs}つで証明書+${gained}と$${2 * pairs}`);
            markUsed(s, src);
            return;
        }
        case 'certMax': {
            const gained = addCert(p, CERT_STEPS.length);
            out.notes.push(`証明書+${gained}`);
            markUsed(s, src);
            return;
        }
        case 'engine':
            push(s, { p: 'engine', max: engineMax(p, effect.max), pay: 0, src, optional: true });
            return;
        case 'hire': push(s, { p: 'hire', mod: effect.mod, src, optional: true }); return;
        case 'build': push(s, { p: 'build', per: effect.per, src, optional: true }); return;
        case 'certOrObjective': push(s, { p: 'certOrObjective', src, optional: true }); return;
        case 'tradeOrEngine': push(s, { p: 'tradeOrEngine', src, optional: true }); return;
        case 'tradeOrAux': push(s, { p: 'tradeOrAux', src, optional: true }); return;
        case 'aux': push(s, { p: 'aux', double: true, src, optional: true }); return;
        case 'buy': push(s, { p: 'buy', cowboys: p.workers.cowboy, bought: 0, src, optional: true }); return;
        case 'hazard': push(s, { p: 'hazard', cost: effect.cost, src, optional: true }); return;
        case 'moveAgain': push(s, { p: 'moveAgain', max: effect.max, src, optional: true }); return;
        case 'specialDelivery': push(s, { p: 'specialDelivery', src, optional: true }); return;
        default: fail('知らないアクションです');
    }
}

function markUsed(s, src) {
    if (!src) return;
    if (src.local !== undefined && !s.turn.used.includes(src.local)) s.turn.used.push(src.local);
    if (src.local !== undefined) s.turn.mode = 'local';
}

// ---- 選ぶものの候補 ----
export function hireOptions(s, seat, mod) {
    const p = s.players[seat];
    return hireableWorkers(s).filter(h => p.workers[h.w] < MAX_WORKERS && p.money >= Math.max(0, h.cost + mod));
}

export function buildOptions(s, seat, per) {
    const p = s.players[seat];
    const list = [];
    for (const n of p.buildings) {
        const def = BUILDINGS[n];
        for (const spot of PLOT_SPOTS) {
            const tile = s.spots[spot];
            let need = def.craft;
            if (tile) {
                if (tile.t !== 'building' || tile.owner !== seat || tile.n >= n) continue;
                need = def.craft - BUILDINGS[tile.n].craft;
            }
            if (p.workers.craftsman < need || p.money < need * per) continue;
            list.push({ tile: n, spot, cost: need * per, replace: tile ? tile.n : null });
        }
    }
    return list;
}

export function tradeOptions(s, seat) {
    const p = s.players[seat];
    return TRADE_SPOTS.map((id, i) => ({ id, value: TRADE_VALUES[i], tile: s.spots[id] }))
        .filter(o => o.tile && p.money + o.value >= 0);
}

export function hazardOptions(s, cost, money) {
    if (money < cost) return [];
    return Object.values(HAZARD_SPOTS).flat().filter(id => s.spots[id]);
}

export function auxOptions(s, seat, allowDouble) {
    const p = s.players[seat];
    const list = [];
    for (const kind of Object.keys(AUX_KINDS)) {
        const level = auxLevel(p, kind);
        for (let k = 1; k <= (allowDouble ? level : Math.min(1, level)); k++) {
            if (auxPossible(s, seat, kind, k)) list.push({ kind, double: k === 2 });
        }
    }
    return list;
}

function auxPossible(s, seat, kind, k) {
    const p = s.players[seat];
    switch (kind) {
        case 'money': return true;
        case 'draw': return p.deck.length + p.discard.length + p.hand.length > 0;
        case 'cert': return p.money >= k && engineBackward(s, seat, k).length > 0;
        case 'engine': return p.money >= k && engineForward(s, seat, k).length > 0;
        case 'remove': return engineBackward(s, seat, k).length > 0;
        default: return false;
    }
}

function runAux(s, seat, kind, double, out) {
    const p = s.players[seat];
    const k = double ? 2 : 1;
    if (!auxPossible(s, seat, kind, k)) fail('その補助アクションは今は使えません');
    switch (kind) {
        case 'money':
            p.money += k;
            out.notes.push(`補助アクションで$${k}`);
            return;
        case 'draw': {
            const drawn = drawCards(s, p, k);
            out.notes.push(`補助アクションで${drawn.length}枚引いた`);
            const count = Math.min(k, p.hand.length);
            if (count > 0) push(s, { p: 'drawDiscard', count, optional: false });
            return;
        }
        case 'cert':
            push(s, { p: 'auxBack', kind: 'cert', k, optional: false });
            return;
        case 'engine':
            pay(p, k);
            push(s, { p: 'engine', max: k, pay: 0, optional: false, paid: k });
            return;
        case 'remove':
            push(s, { p: 'auxBack', kind: 'remove', k, optional: false });
            return;
        default: fail('知らない補助アクションです');
    }
}

// 機関車を止めたあと：駅（待避線）なら改良を選べる。39 なら、そのあと戻る
function afterEngineStop(s, seat, out) {
    const p = s.players[seat];
    const items = [];
    const st = stationAt(p.engine);
    if (st !== null && !s.stations[st].discs.includes(seat)) items.push({ p: 'upgrade', station: st, optional: true });
    if (p.engine === LAST_SPACE) items.push({ p: 'back39', optional: false });
    for (let i = items.length - 1; i >= 0; i--) push(s, items[i]);
}

function moveEngine(s, seat, to, out) {
    const p = s.players[seat];
    const from = p.engine;
    p.engine = to;
    out.notes.push(`機関車 ${spaceName(from)}→${spaceName(to)}`);
    afterEngineStop(s, seat, out);
}

export const spaceName = (x) => (Number.isInteger(x) ? (x === LAST_SPACE ? '終点' : `${x}`) : `駅${stationAt(x) + 1}`);

function takeObjective(s, p, pick, out) {
    let id;
    if (pick === 'stack') {
        if (s.objStack.length === 0) fail('目標カードの山がありません');
        id = s.objStack.pop();
    } else {
        const i = Number(pick);
        if (!Number.isInteger(i) || !s.objDisplay[i]) fail('その目標カードはありません');
        id = s.objDisplay[i];
        s.objDisplay.splice(i, 1);
        if (s.objStack.length > 0) s.objDisplay.splice(i, 0, s.objStack.pop());
    }
    p.discard.push(id);
    out.notes.push('目標カードを得た');
}

function deliverTo(s, seat, cityId, disc, out) {
    const p = s.players[seat];
    const city = CITY_BY_ID[cityId];
    if (!city) fail('その都市はありません');
    if (cityId !== 'kc' && cityId !== 'sf' && p.cities[cityId] > 0) fail('その都市には配達ずみです');
    takeDisc(s, p, disc, city.dark, out);
    p.cities[cityId]++;
    if (cityId === 'kc') p.money += 6;
    const objectives = CITY_LINKS.filter(l => l.objective && (l.a === cityId || l.b === cityId) && p.cities[l.a] > 0 && p.cities[l.b] > 0 && p.cities[cityId] === 1);
    objectives.forEach(() => {
        if (s.objDisplay.length + s.objStack.length > 0) push(s, { p: 'objectivePick', optional: false });
    });
}

export function placeBuilding(s, seat, tileN, spot, per, out) {
    const p = s.players[seat];
    const option = buildOptions(s, seat, per).find(o => o.tile === tileN && o.spot === spot);
    if (!option) fail('そこには建てられません');
    pay(p, option.cost);
    p.buildings = p.buildings.filter(n => n !== tileN);
    s.spots[spot] = { t: 'building', owner: seat, n: tileN };
    out.notes.push(option.replace ? `建物${option.replace}を建物${tileN}に建て替え（$${option.cost}）` : `建物${tileN}を建てた（$${option.cost}）`);
}

function hireWorker(s, seat, at, mod, out) {
    const p = s.players[seat];
    if (!Array.isArray(at)) fail('雇う人を選んでください');
    const option = hireOptions(s, seat, mod).find(h => h.row === at[0] && h.col === at[1]);
    if (!option) fail('その人は雇えません');
    const cost = Math.max(0, option.cost + mod);
    pay(p, cost);
    s.job.rows[option.row][option.col] = null;
    p.workers[option.w]++;
    out.notes.push(`${WORKERS[option.w]}を雇った（$${cost}）`);
    const bonus = WORKER_BONUS[option.w][p.workers[option.w]];
    if (bonus && bonusPossible(s, seat, bonus)) push(s, { p: 'workerBonus', bonus, optional: true });
}

export function bonusPossible(s, seat, bonus) {
    const p = s.players[seat];
    switch (bonus) {
        case 'freeHazard': return hazardOptions(s, 0, 0).length > 0;
        case 'trade': return tradeOptions(s, seat).length > 0;
        case 'cheapBuild': return buildOptions(s, seat, 1).length > 0;
        case 'hireMinus2': return hireOptions(s, seat, -2).length > 0;
        default: return cattleIn(p.hand).some(id => card(id).breed === 'jersey');
    }
}

function removeHazard(s, seat, spot, cost, out) {
    const p = s.players[seat];
    const tile = s.spots[spot];
    if (!tile || tile.t !== 'hazard') fail('その災害はありません');
    pay(p, cost);
    s.spots[spot] = null;
    p.hazards.push({ type: tile.type, vp: tile.vp });
    out.notes.push(`${HAZARD_TYPES[tile.type]}を取り除いた（${tile.vp}点${cost ? `・$${cost}` : ''}）`);
}

function trade(s, seat, spot, out) {
    const p = s.players[seat];
    const i = TRADE_SPOTS.indexOf(spot);
    const tile = i >= 0 ? s.spots[spot] : null;
    if (!tile) fail('そのティーピーはありません');
    const value = TRADE_VALUES[i];
    if (p.money + value < 0) fail('お金が足りません');
    p.money += value;
    s.spots[spot] = null;
    p.teepees.push(tile.color);
    out.notes.push(`${tile.color === 'green' ? '緑' : '青'}のティーピーと交易（${value >= 0 ? `+$${value}` : `-$${-value}`}）`);
}

// ---- 選択に答える ----
function resolve(s, seat, item, c, out) {
    const p = s.players[seat];
    switch (item.p) {
        case 'discard': {
            if (item.need === 'pair') {
                const ids = cattleIn(p.hand).filter(id => card(id).breed === c.breed);
                if (ids.length < 2) fail('同じ品種が2枚ありません');
                const pick = ids.sort((a, b) => card(a).vp - card(b).vp).slice(0, 2);
                discardFromHand(p, pick);
                p.money += item.money;
                out.notes.push(`${BREEDS[c.breed].name}を2枚捨てて$${item.money}`);
            } else {
                const ids = Array.isArray(c.cards) ? c.cards : [];
                if (ids.length !== 1 || card(ids[0])?.kind !== 'cattle') fail('牛のカードを1枚選んでください');
                discardFromHand(p, ids);
                const parts = [];
                if (item.cert) parts.push(`証明書+${addCert(p, item.cert)}`);
                if (item.money) {
                    p.money += item.money;
                    parts.push(`$${item.money}`);
                }
                out.notes.push(`${BREEDS[card(ids[0]).breed].name}を捨てて${parts.join('と')}`);
            }
            markUsed(s, item.src);
            return;
        }
        case 'hire':
            markUsed(s, item.src);
            hireWorker(s, seat, c.worker, item.mod, out);
            return;
        case 'build':
            markUsed(s, item.src);
            placeBuilding(s, seat, Number(c.tile), c.spot, item.per, out);
            return;
        case 'certOrObjective':
            markUsed(s, item.src);
            if (c.option === 'cert') {
                if (certLimit(p) <= p.cert) fail('証明書は上限です');
                addCert(p, 1);
                out.notes.push('証明書+1');
            } else if (c.option === 'objective') {
                takeObjective(s, p, c.pick, out);
            } else fail('証明書か目標カードを選んでください');
            return;
        case 'engine': {
            const to = Number(c.to);
            if (!engineForward(s, seat, item.max).includes(to)) fail('機関車はそこへ進めません');
            markUsed(s, item.src);
            if (item.pay) pay(p, item.pay);
            moveEngine(s, seat, to, out);
            return;
        }
        case 'upgrade': {
            const st = s.stations[item.station];
            const def = STATIONS[item.station];
            pay(p, def.cost);
            takeDisc(s, p, c.disc, def.dark, out);
            st.discs.push(seat);
            out.notes.push(`駅${item.station + 1}を改良（$${def.cost}・${def.vp}点）`);
            if (c.master && st.master) {
                const w = c.master;
                if (!WORKER_TYPES.includes(w) || p.workers[w] < 2) fail('駅長にできる労働者がいません');
                p.workers[w]--;
                const m = st.master;
                st.master = null;
                st.worker = w;
                p.masters.push(m);
                out.notes.push(`${WORKERS[w]}を駅長にした`);
                if (MASTERS[m].now === 'money2') p.money += 2;
                if (MASTERS[m].now === 'hazardOrTrade' && (hazardOptions(s, 0, 0).length > 0 || tradeOptions(s, seat).length > 0)) {
                    push(s, { p: 'masterAction', optional: true });
                }
            } else if (c.master) fail('この駅に駅長のタイルはありません');
            return;
        }
        case 'back39': {
            const to = Number(c.to);
            if (!engineBehind(s, seat).includes(to)) fail('そこへは戻せません');
            p.engine = to;
            p.money += 3;
            out.notes.push(`機関車を${spaceName(to)}へ戻して$3`);
            const st = stationAt(to);
            if (st !== null && !s.stations[st].discs.includes(seat)) push(s, { p: 'upgrade', station: st, optional: true });
            return;
        }
        case 'tradeOrEngine':
            if (c.option === 'trade') {
                markUsed(s, item.src);
                trade(s, seat, c.teepee, out);
            } else if (c.option === 'engine') {
                if (p.money < 2 || engineForward(s, seat, 2).length === 0) fail('$2 で機関車を進められません');
                markUsed(s, item.src);
                push(s, { p: 'engine', max: 2, pay: 2, optional: false });
            } else fail('交易か機関車を選んでください');
            return;
        case 'tradeOrAux':
            if (c.option === 'trade') {
                markUsed(s, item.src);
                trade(s, seat, c.teepee, out);
            } else if (c.option === 'aux') {
                if (!auxOptions(s, seat, true).some(o => o.kind === c.kind && o.double === !!c.double)) fail('その補助アクションは使えません');
                markUsed(s, item.src);
                runAux(s, seat, c.kind, !!c.double, out);
            } else fail('交易か補助アクションを選んでください');
            return;
        case 'aux':
            if (!auxOptions(s, seat, item.double).some(o => o.kind === c.kind && o.double === !!c.double)) fail('その補助アクションは使えません');
            markUsed(s, item.src);
            runAux(s, seat, c.kind, !!c.double, out);
            return;
        case 'auxBack': {
            const to = Number(c.to);
            if (!engineBackward(s, seat, item.k).includes(to)) fail('機関車はそこへ戻せません');
            if (item.kind === 'cert') {
                pay(p, item.k);
                p.engine = to;
                const gained = addCert(p, item.k);
                out.notes.push(`$${item.k}払い、機関車を${spaceName(to)}へ戻して証明書+${gained}`);
            } else {
                const ids = Array.isArray(c.cards) ? c.cards : [];
                if (ids.length > item.k) fail(`除けるのは${item.k}枚までです`);
                const hand = [...p.hand];
                ids.forEach(id => {
                    const i = hand.indexOf(id);
                    if (i < 0) fail('手札にないカードです');
                    hand.splice(i, 1);
                });
                p.hand = hand;
                p.removed.push(...ids);
                p.engine = to;
                out.notes.push(`機関車を${spaceName(to)}へ戻し、カード${ids.length}枚を除いた`);
            }
            const st = stationAt(to);
            if (st !== null && !s.stations[st].discs.includes(seat)) push(s, { p: 'upgrade', station: st, optional: true });
            return;
        }
        case 'drawDiscard': {
            const ids = Array.isArray(c.cards) ? c.cards : [];
            if (ids.length !== item.count || new Set(ids).size !== ids.length) fail(`${item.count}枚選んでください`);
            discardFromHand(p, ids);
            out.notes.push(`${ids.length}枚捨てた`);
            return;
        }
        case 'buy': {
            if (c.option === 'refill') {
                if (item.cowboys < 1) fail('カウボーイが残っていません');
                if (s.marketStack.length === 0) fail('牛の山がありません');
                item.cowboys--;
                const k = Math.min(2, s.marketStack.length);
                for (let i = 0; i < k; i++) s.market.push(s.marketStack.pop());
                out.notes.push(`市場に牛を${k}枚足した`);
            } else {
                const option = BUY_OPTIONS.find(o => o.id === c.option);
                if (!option) fail('買い方を選んでください');
                if (item.cowboys < option.cowboys) fail('カウボーイが足りません');
                const ids = Array.isArray(c.cards) ? c.cards : [];
                if (ids.length !== option.count || new Set(ids).size !== ids.length) fail(`${option.count}枚選んでください`);
                ids.forEach(id => {
                    if (!s.market.includes(id)) fail('市場にない牛です');
                    if (card(id).value !== option.value) fail(`繁殖値${option.value}の牛を選んでください`);
                });
                pay(p, option.cost);
                item.cowboys -= option.cowboys;
                s.market = s.market.filter(id => !ids.includes(id));
                p.discard.push(...ids);
                item.bought += ids.length;
                out.notes.push(`${ids.map(id => BREEDS[card(id).breed].name).join('と')}を$${option.cost}で買った`);
            }
            markUsed(s, item.src);
            // カウボーイが残っていれば、続けて選べる
            if (item.cowboys > 0) push(s, { ...item, optional: true });
            return;
        }
        case 'hazard':
            markUsed(s, item.src);
            removeHazard(s, seat, c.hazard, item.cost, out);
            return;
        case 'moveAgain': {
            const path = Array.isArray(c.path) ? c.path : [];
            const key = path.join('>');
            if (!movePaths(s, seat, item.max).some(pt => pt.join('>') === key)) fail('そこへは進めません');
            markUsed(s, item.src);
            const fee = walkPath(s, seat, path, out);
            out.notes.push(`${locName(s, p.loc)}へ進んだ${fee}`);
            arrive(s, seat, out);
            return;
        }
        case 'specialDelivery': {
            const to = Number(c.to);
            if (!engineBehind(s, seat).includes(to)) fail('機関車はそこへ戻せません');
            const count = backCount(s, seat, to);
            const city = CITY_BY_ID[c.city];
            if (!city || city.value > count) fail(`戻したマスは${count}なので、都市の値が${count}以下の都市にだけ配達できます`);
            markUsed(s, item.src);
            p.engine = to;
            deliverTo(s, seat, c.city, c.disc, out);
            out.notes.push(`機関車を${spaceName(to)}へ戻し、${city.name}へ特別な配達`);
            const st = stationAt(to);
            if (st !== null && !s.stations[st].discs.includes(seat)) push(s, { p: 'upgrade', station: st, optional: true });
            return;
        }
        case 'workerBonus':
            switch (item.bonus) {
                case 'freeHazard': removeHazard(s, seat, c.hazard, 0, out); return;
                case 'trade': trade(s, seat, c.teepee, out); return;
                case 'cheapBuild': placeBuilding(s, seat, Number(c.tile), c.spot, 1, out); return;
                case 'hireMinus2': hireWorker(s, seat, c.worker, -2, out); return;
                default: {
                    const id = p.hand.find(x => card(x).kind === 'cattle' && card(x).breed === 'jersey');
                    if (!id) fail('ジャージーが手札にありません');
                    discardFromHand(p, [id]);
                    const reward = { jerseyCert1: ['cert', 1], jerseyCert2: ['cert', 2], jerseyMoney2: ['money', 2], jerseyMoney4: ['money', 4] }[item.bonus];
                    if (reward[0] === 'cert') out.notes.push(`ジャージーを捨てて証明書+${addCert(p, reward[1])}`);
                    else {
                        p.money += reward[1];
                        out.notes.push(`ジャージーを捨てて$${reward[1]}`);
                    }
                    return;
                }
            }
        case 'masterAction':
            if (c.hazard) removeHazard(s, seat, c.hazard, 0, out);
            else if (c.teepee) trade(s, seat, c.teepee, out);
            else fail('災害かティーピーを選んでください');
            return;
        case 'objectivePick':
            takeObjective(s, p, c.pick, out);
            return;
        case 'objDraw': {
            const count = Number(c.count);
            if (!Number.isInteger(count) || count < 0 || count > 3) fail('0〜3枚を選んでください');
            const drawn = drawCards(s, p, count);
            out.notes.push(`${drawn.length}枚引いた`);
            if (drawn.length > 0) push(s, { p: 'drawDiscard', count: drawn.length, optional: false });
            return;
        }
        case 'objMove': {
            const path = Array.isArray(c.path) ? c.path : [];
            const key = path.join('>');
            if (!movePaths(s, seat, 3, { noKC: true }).some(pt => pt.join('>') === key)) fail('そこへは進めません');
            walkPath(s, seat, path, out, { noFees: true });
            out.notes.push(`${locName(s, p.loc)}へ通行料なしで進んだ`);
            if (s.turn.stage === 'act') s.turn.autoEnd = true;
            return;
        }
        case 'foresight': {
            const i = Number(c.index);
            const tile = s.foresight[item.col][i];
            if (!tile) fail('そのタイルはありません');
            if (tile.t === 'worker' && (s.end.by !== null || s.job.row >= JOB_COSTS.length)) fail('もう労働者は選べません');
            s.foresight[item.col][i] = null;
            if (tile.t === 'worker') {
                pushWorker(s, tile.w, seat, out);
                out.notes.push(`${WORKERS[tile.w]}を求人市場へ`);
            } else if (placeTile(s, tile)) {
                out.notes.push(tile.t === 'hazard' ? `${HAZARD_TYPES[tile.type]}を道へ` : `${tile.color === 'green' ? '緑' : '青'}のティーピーを交易の場所へ`);
            } else {
                out.notes.push('置く場所がないので箱へ');
            }
            return;
        }
        case 'deliver': {
            const certs = Number(c.certs ?? 0);
            if (!Number.isInteger(certs) || certs < 0 || !CERT_STEPS.includes(p.cert - certs)) fail('使う証明書の数が正しくありません');
            const value = breedingValue(p.hand) + certs + permCerts(p);
            const city = CITY_BY_ID[c.city];
            if (!city) fail('都市を選んでください');
            if (city.value > value) fail(`繁殖値${value}では届きません`);
            p.cert -= certs;
            p.money += value;
            const hand = p.hand;
            p.hand = [];
            p.discard.push(...hand);
            const cost = transportCost(p.engine, city.value);
            deliverTo(s, seat, city.id, c.disc, out);
            pay(p, cost);
            out.notes.push(`収入$${value}、${city.name}へ配達${cost ? `（運賃$${cost}）` : ''}`);
            return;
        }
        default:
            fail('知らない選択です');
    }
}

// 牧場主が場所に着いた（カンザスシティなら3つの先読みと配達を積む）
function arrive(s, seat, out) {
    const p = s.players[seat];
    s.turn.used = [];
    s.turn.mode = null;
    if (p.loc === 'KC') {
        s.turn.stage = 'kc';
        p.kcVisits++;
        const items = [];
        [0, 1, 2].forEach(col => {
            const workersOk = s.end.by === null && s.job.row < JOB_COSTS.length;
            if (s.foresight[col].some(t => t && (t.t !== 'worker' || workersOk))) items.push({ p: 'foresight', col, optional: false });
        });
        items.push({ p: 'deliver', optional: false });
        s.turn.queue = [...items, ...s.turn.queue];
    } else {
        s.turn.stage = 'act';
    }
}

// ---- 操作 ----
export function doCommand(s, seat, c, out) {
    if (s.phase !== 'play') fail('ゲームは終わっています');
    if (seat !== s.turn.seat) fail('あなたの番ではありません');
    const t = s.turn;
    const p = s.players[seat];
    switch (c.type) {
        case 'choose': {
            const item = t.queue[0];
            if (!item) fail('選ぶものはありません');
            t.queue.shift();
            resolve(s, seat, item, c, out);
            out.text = out.notes.join('・');
            break;
        }
        case 'skip': {
            const item = t.queue[0];
            if (!item) fail('選ぶものはありません');
            if (!item.optional) fail('これは飛ばせません');
            t.queue.shift();
            break;
        }
        case 'move': {
            if (t.stage !== 'move' || t.queue.length > 0) fail('今は進めません');
            const path = Array.isArray(c.path) ? c.path : [];
            const key = path.join('>');
            if (!movePaths(s, seat, stepLimit(s, p)).some(pt => pt.join('>') === key)) fail('そこへは進めません');
            const first = p.loc === null;
            const fee = first ? '' : walkPath(s, seat, path, out);
            if (first) p.loc = path[0];
            out.text = `${locName(s, p.loc)}へ${first ? '' : `${path.length}歩`}進んだ${fee}`;
            arrive(s, seat, out);
            break;
        }
        case 'local': {
            if (t.stage !== 'act' || t.queue.length > 0) fail('今はアクションを選べません');
            if (t.mode === 'aux') fail('補助アクションを使ったので、建物のアクションは使えません');
            const actions = localActions(s, seat);
            const i = Number(c.index);
            const effect = actions[i];
            if (!effect) fail('そのアクションはありません');
            if (t.used.includes(i)) fail('そのアクションは使いました');
            if (!canStart(s, seat, effect)) fail('そのアクションの条件を満たしていません');
            startEffect(s, seat, effect, out, { local: i });
            out.text = out.notes.join('・');
            break;
        }
        case 'aux': {
            if (t.stage !== 'act' || t.queue.length > 0) fail('今は補助アクションを選べません');
            if (t.mode) fail('ここではもう補助アクションは使えません');
            if (!auxOptions(s, seat, false).some(o => o.kind === c.kind)) fail('その補助アクションは使えません');
            t.mode = 'aux';
            runAux(s, seat, c.kind, false, out);
            out.text = out.notes.join('・');
            break;
        }
        case 'objective': {
            if (!['move', 'act'].includes(t.stage) || t.queue.length > 0) fail('今は目標カードを出せません');
            const id = c.card;
            if (!p.hand.includes(id) || card(id)?.kind !== 'objective') fail('その目標カードは手札にありません');
            p.hand = p.hand.filter(x => x !== id);
            p.objectives.push(id);
            const action = OBJECTIVES[id].action;
            out.text = '目標カードを出した';
            if (action === 'gain2') {
                p.money += 2;
                out.text += '（$2）';
            } else if (action === 'aux' && auxOptions(s, seat, true).length > 0) push(s, { p: 'aux', double: true, optional: true });
            else if (action === 'draw3') push(s, { p: 'objDraw', optional: true });
            else if ((action === 'engine2' || action === 'engine3') && engineForward(s, seat, action === 'engine2' ? 2 : 3).length > 0) {
                push(s, { p: 'engine', max: action === 'engine2' ? 2 : 3, pay: 0, optional: true });
            } else if (action === 'move3' && p.loc !== null && movePaths(s, seat, 3, { noKC: true }).length > 0) push(s, { p: 'objMove', optional: true });
            break;
        }
        case 'end': {
            if (t.stage !== 'act' || t.queue.length > 0) fail('今は手番を終えられません');
            finishTurn(s, out);
            return;
        }
        default:
            fail('知らない操作です');
    }
    settle(s, out);
}

// 選ぶものがなくなったら：カンザスシティか、通行料なしの移動のあとなら、手番を終える
function settle(s, out) {
    const t = s.turn;
    // 求人市場が埋まって、先読みに選べるタイルがなくなったら飛ばす
    while (t.queue[0]?.p === 'foresight' && choiceCandidates(s, t.seat, t.queue[0]).length === 0) t.queue.shift();
    if (s.phase !== 'play' || t.queue.length > 0) return;
    if (t.stage === 'kc' || t.autoEnd) finishTurn(s, out);
}

function finishTurn(s, out) {
    const seat = s.turn.seat;
    const p = s.players[seat];
    if (s.turn.stage === 'kc') {
        p.loc = 'start';
        [0, 1, 2].forEach(col => [0, 1].forEach(i => {
            if (!s.foresight[col][i]) s.foresight[col][i] = s.supply[col].pop() ?? null;
        }));
    }
    drawCards(s, p, Math.max(0, handLimit(p) - p.hand.length));
    p.turns++;
    if (s.end.by !== null) {
        s.end.left = seat === s.end.by && s.end.left === null ? s.n - 1 : s.end.left - 1;
        if (s.end.left <= 0) {
            endGame(s, out);
            return;
        }
    }
    const next = (seat + 1) % s.n;
    if (next === s.first) s.round++;
    s.turn = newTurn(next);
}

function endGame(s, out) {
    s.phase = 'over';
    s.turn = { ...newTurn(s.turn.seat), stage: 'over' };
    const scores = s.players.map(p => scoreOf(s, p.seat).total);
    const best = Math.max(...scores);
    s.winners = scores.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
    out.logs.push({ seat: null, text: `ゲーム終了。${s.winners.map(i => s.players[i].name).join('と')}の勝ち` });
}

export const currentSeat = (s) => (s.phase === 'play' ? s.turn.seat : null);

// ---- 得点 ----
export function taskCounts(s, p) {
    const cattle = cattleIn(ownedCards(p)).map(id => card(id).value);
    return {
        B: PLOT_SPOTS.filter(id => s.spots[id]?.t === 'building' && s.spots[id].owner === p.seat).length,
        G: p.teepees.filter(t => t === 'green').length,
        BL: p.teepees.filter(t => t === 'blue').length,
        H: p.hazards.length,
        S: s.stations.filter(st => st.discs.includes(p.seat)).length,
        3: cattle.filter(v => v === 3).length,
        4: cattle.filter(v => v === 4).length,
        5: cattle.filter(v => v === 5).length,
        SF: p.cities.sf
    };
}

// 目標カードの得点（場に出したカードは必ず数え、デッキのカードは得になるものだけ足す。条件は1枚にしか使えない）
export function objectiveScore(s, p) {
    const counts = taskCounts(s, p);
    const area = p.objectives.map(id => ({ id, must: true }));
    const deck = ownedCards(p).filter(id => card(id).kind === 'objective').map(id => ({ id, must: false }));
    const all = [...area, ...deck];
    let best = { score: -Infinity, done: [], used: 0 };
    for (let mask = 0; mask < 1 << all.length; mask++) {
        const need = {};
        let ok = true;
        for (let i = 0; i < all.length && ok; i++) {
            if (!(mask & (1 << i))) continue;
            OBJECTIVES[all[i].id].tasks.forEach(task => {
                need[task] = (need[task] ?? 0) + 1;
                if (need[task] > counts[task]) ok = false;
            });
        }
        if (!ok) continue;
        let score = 0;
        all.forEach((o, i) => {
            const def = OBJECTIVES[o.id];
            if (mask & (1 << i)) score += def.vp;
            else if (o.must) score -= def.minus;
        });
        if (score > best.score) best = { score, done: all.filter((_, i) => mask & (1 << i)).map(o => o.id), used: area.length + all.filter((o, i) => !o.must && mask & (1 << i)).length };
    }
    return best;
}

export function citiesScore(p) {
    let vp = -6 * p.cities.kc + 9 * p.cities.sf;
    if (p.cities.sacramento > 0) vp += 6;
    CITY_LINKS.forEach(l => { if (l.vp && p.cities[l.a] > 0 && p.cities[l.b] > 0) vp += l.vp; });
    return vp;
}

export function scoreOf(s, seat) {
    const p = s.players[seat];
    const objectives = objectiveScore(s, p);
    const counts = taskCounts(s, p);
    const workerCount = WORKER_TYPES.reduce((sum, w) => sum + p.workers[w], 0);
    const masterVp = p.masters.reduce((sum, m) => {
        switch (MASTERS[m].score) {
            case 'workers': return sum + workerCount;
            case 'objectives': return sum + 3 * Math.floor(objectives.used / 2);
            case 'hazards': return sum + 3 * Math.floor(p.hazards.length / 2);
            case 'pairs': return sum + 3 * pairsOf(p);
            case 'certs': return sum + 3 * Math.floor((p.cert + permCerts(p)) / 2);
            default: return sum;
        }
    }, 0);
    const parts = {
        money: Math.floor(p.money / 5),
        buildings: PLOT_SPOTS.reduce((sum, id) => sum + (s.spots[id]?.t === 'building' && s.spots[id].owner === seat ? BUILDINGS[s.spots[id].n].vp : 0), 0),
        cities: citiesScore(p),
        stations: s.stations.reduce((sum, st, i) => sum + (st.discs.includes(seat) ? STATIONS[i].vp : 0), 0),
        hazards: p.hazards.reduce((sum, h) => sum + h.vp, 0),
        cattle: cattleIn(ownedCards(p)).reduce((sum, id) => sum + card(id).vp, 0),
        objectives: objectives.score,
        masters: masterVp,
        workers: WORKER_TYPES.reduce((sum, w) => sum + 4 * Math.max(0, p.workers[w] - 4), 0),
        step: p.discs.step2 === 0 ? 3 : 0,
        token: p.token ? 2 : 0
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return { ...parts, total, counts };
}

export function ranking(s) {
    const list = s.players.map(p => ({ seat: p.seat, ...scoreOf(s, p.seat), moneyLeft: p.money }));
    list.sort((a, b) => b.total - a.total);
    list.forEach((r, i) => { r.rank = i > 0 && list[i - 1].total === r.total ? list[i - 1].rank : i + 1; });
    return list;
}

// ---- 選べる操作の一覧（CPU・確かめのスクリプト・画面が使う） ----
export function choiceCandidates(s, seat, item) {
    const p = s.players[seat];
    const list = [];
    switch (item.p) {
        case 'discard':
            if (item.need === 'pair') {
                const counts = {};
                cattleIn(p.hand).forEach(id => { counts[card(id).breed] = (counts[card(id).breed] ?? 0) + 1; });
                Object.keys(counts).filter(b => counts[b] >= 2).forEach(breed => list.push({ breed }));
            } else {
                uniqueByBreed(cattleIn(p.hand)).forEach(id => list.push({ cards: [id] }));
            }
            break;
        case 'hire': hireOptions(s, seat, item.mod).forEach(h => list.push({ worker: [h.row, h.col] })); break;
        case 'build': buildOptions(s, seat, item.per).forEach(o => list.push({ tile: o.tile, spot: o.spot })); break;
        case 'certOrObjective':
            if (certLimit(p) > p.cert) list.push({ option: 'cert' });
            s.objDisplay.forEach((_, i) => list.push({ option: 'objective', pick: i }));
            if (s.objStack.length > 0) list.push({ option: 'objective', pick: 'stack' });
            break;
        case 'engine': engineForward(s, seat, item.max).forEach(to => list.push({ to })); break;
        case 'upgrade': {
            const st = s.stations[item.station];
            if (p.money < STATIONS[item.station].cost) break;
            const discs = allowedDiscs(p, STATIONS[item.station].dark).filter(k => k !== 'hand' || p.money >= STATIONS[item.station].cost + 5);
            const discList = discs.length > 0 ? discs : (discsLeft(p).length === 0 && s.stations.some(x => x.discs.includes(seat)) ? ['station'] : []);
            const masters = st.master ? [null, ...WORKER_TYPES.filter(w => p.workers[w] >= 2)] : [null];
            discList.forEach(disc => masters.forEach(master => list.push({ disc, master })));
            break;
        }
        case 'back39': engineBehind(s, seat).forEach(to => list.push({ to })); break;
        case 'tradeOrEngine':
            tradeOptions(s, seat).forEach(o => list.push({ option: 'trade', teepee: o.id }));
            if (p.money >= 2 && engineForward(s, seat, 2).length > 0) list.push({ option: 'engine' });
            break;
        case 'tradeOrAux':
            tradeOptions(s, seat).forEach(o => list.push({ option: 'trade', teepee: o.id }));
            auxOptions(s, seat, true).forEach(o => list.push({ option: 'aux', ...o }));
            break;
        case 'aux': auxOptions(s, seat, item.double).forEach(o => list.push(o)); break;
        case 'auxBack': {
            const tos = engineBackward(s, seat, item.k);
            if (item.kind === 'cert') tos.forEach(to => list.push({ to }));
            else {
                const sets = removeSets(p, item.k);
                tos.forEach(to => sets.forEach(cards => list.push({ to, cards })));
            }
            break;
        }
        case 'drawDiscard': combos(uniqueHand(p.hand), p.hand, item.count).forEach(cards => list.push({ cards })); break;
        case 'buy': {
            BUY_OPTIONS.filter(o => o.cowboys <= item.cowboys && o.cost <= p.money).forEach(o => {
                const pool = uniqueByBreed(s.market.filter(id => card(id).value === o.value));
                combos(pool, s.market.filter(id => card(id).value === o.value), o.count).forEach(cards => list.push({ option: o.id, cards }));
            });
            if (item.cowboys > 0 && s.marketStack.length > 0) list.push({ option: 'refill' });
            break;
        }
        case 'hazard': hazardOptions(s, item.cost, p.money).forEach(hazard => list.push({ hazard })); break;
        case 'moveAgain': movePaths(s, seat, item.max).forEach(path => list.push({ path })); break;
        case 'specialDelivery': {
            engineBehind(s, seat).forEach(to => {
                const count = backCount(s, seat, to);
                CITIES.filter(c => c.value <= count && (c.id === 'kc' || c.id === 'sf' || p.cities[c.id] === 0)).forEach(city => {
                    discChoices(s, p, city.dark, 0).forEach(disc => list.push({ to, city: city.id, disc }));
                });
            });
            break;
        }
        case 'workerBonus':
            switch (item.bonus) {
                case 'freeHazard': hazardOptions(s, 0, 0).forEach(hazard => list.push({ hazard })); break;
                case 'trade': tradeOptions(s, seat).forEach(o => list.push({ teepee: o.id })); break;
                case 'cheapBuild': buildOptions(s, seat, 1).forEach(o => list.push({ tile: o.tile, spot: o.spot })); break;
                case 'hireMinus2': hireOptions(s, seat, -2).forEach(h => list.push({ worker: [h.row, h.col] })); break;
                default: list.push({});
            }
            break;
        case 'masterAction':
            hazardOptions(s, 0, 0).forEach(hazard => list.push({ hazard }));
            tradeOptions(s, seat).forEach(o => list.push({ teepee: o.id }));
            break;
        case 'objectivePick':
            s.objDisplay.forEach((_, i) => list.push({ pick: i }));
            if (s.objStack.length > 0) list.push({ pick: 'stack' });
            break;
        case 'objDraw': [0, 1, 2, 3].forEach(count => list.push({ count })); break;
        case 'objMove': movePaths(s, seat, 3, { noKC: true }).forEach(path => list.push({ path })); break;
        case 'foresight':
            s.foresight[item.col].forEach((tile, index) => {
                if (tile && (tile.t !== 'worker' || (s.end.by === null && s.job.row < JOB_COSTS.length))) list.push({ index });
            });
            break;
        case 'deliver': {
            const base = breedingValue(p.hand) + permCerts(p);
            CERT_STEPS.filter(v => v <= p.cert).forEach(rest => {
                const certs = p.cert - rest;
                const value = base + certs;
                const income = value;
                CITIES.filter(c => c.value <= value && (c.id === 'kc' || c.id === 'sf' || p.cities[c.id] === 0)).forEach(city => {
                    const cost = transportCost(p.engine, city.value);
                    discChoices(s, p, city.dark, income + (city.id === 'kc' ? 6 : 0) - cost).forEach(disc => list.push({ certs, city: city.id, disc }));
                });
            });
            break;
        }
        default: break;
    }
    return list;
}

function discChoices(s, p, dark, extraMoney) {
    const list = allowedDiscs(p, dark).filter(k => k !== 'hand' || p.money + extraMoney >= 5);
    if (list.length > 0) return list;
    return discsLeft(p).length === 0 && s.stations.some(st => st.discs.includes(p.seat)) ? ['station'] : [];
}

// 品種と得点が同じカードは同じものとして1枚だけ残す（候補を減らす）
function uniqueByBreed(ids) {
    const seen = new Set();
    return ids.filter(id => {
        const c = card(id);
        const key = c.kind === 'cattle' ? `${c.breed}:${c.vp}` : id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
const uniqueHand = (hand) => uniqueByBreed(hand);

// 同じ種類のカードの重なりを考えて、k 枚の組み合わせを作る
function combos(unique, all, k) {
    const keyOf = (id) => {
        const c = card(id);
        return c.kind === 'cattle' ? `${c.breed}:${c.vp}` : id;
    };
    const avail = {};
    all.forEach(id => { (avail[keyOf(id)] ??= []).push(id); });
    const keys = unique.map(keyOf);
    const result = [];
    const walk = (start, left, picked) => {
        if (left === 0) {
            result.push(picked.flatMap(([key, n]) => avail[key].slice(0, n)));
            return;
        }
        for (let i = start; i < keys.length; i++) {
            const used = picked.find(x => x[0] === keys[i]);
            const n = used ? used[1] : 0;
            if (n >= avail[keys[i]].length) continue;
            const next = used ? picked.map(x => (x[0] === keys[i] ? [x[0], x[1] + 1] : x)) : [...picked, [keys[i], 1]];
            walk(i, left - 1, next);
        }
    };
    walk(0, k, []);
    return result;
}

function removeSets(p, k) {
    const hand = p.hand;
    const sets = [[]];
    for (let n = 1; n <= Math.min(k, hand.length); n++) sets.push(...combos(uniqueHand(hand), hand, n));
    return sets;
}

// 今の手番の人が選べる操作の候補（受け付けられるかは、試して確かめる）
export function commandCandidates(s, seat) {
    if (s.phase !== 'play' || s.turn.seat !== seat) return [];
    const t = s.turn;
    const p = s.players[seat];
    const list = [];
    if (t.queue.length > 0) {
        const item = t.queue[0];
        choiceCandidates(s, seat, item).forEach(c => list.push({ type: 'choose', ...c }));
        if (item.optional) list.push({ type: 'skip' });
        return list;
    }
    const objectives = p.hand.filter(id => card(id).kind === 'objective');
    if (t.stage === 'move') {
        movePaths(s, seat, stepLimit(s, p)).forEach(path => list.push({ type: 'move', path }));
    } else if (t.stage === 'act') {
        if (t.mode !== 'aux') {
            localActions(s, seat).forEach((effect, index) => {
                if (!t.used.includes(index) && canStart(s, seat, effect)) list.push({ type: 'local', index });
            });
        }
        if (!t.mode) auxOptions(s, seat, false).forEach(o => list.push({ type: 'aux', kind: o.kind }));
        list.push({ type: 'end' });
    }
    if (['move', 'act'].includes(t.stage) && !t.autoEnd) objectives.forEach(id => list.push({ type: 'objective', card: id }));
    return list;
}

export function trial(s, seat, command) {
    const next = clone(s);
    const out = { text: '', notes: [], logs: [] };
    try {
        doCommand(next, seat, command, out);
        return { ok: true, state: next, out };
    } catch (error) {
        if (error instanceof RuleError) return { ok: false, error: error.message };
        throw error;
    }
}

export function legalCommands(s, seat) {
    return commandCandidates(s, seat).filter(c => trial(s, seat, c).ok);
}
