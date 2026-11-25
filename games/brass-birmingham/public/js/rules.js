/**
 * ブラス：バーミンガムのルール（状態を受け取って書き換える関数）
 * 状態はただの JSON。断る操作は RuleError を投げ、呼ぶ側（game.js）は写しで試してから差し替えるので、状態は変わらない
 * 画面と CPU も、ビュー（公開の状態）に同じ関数を当てて、手の可否を確かめる
 */

import {
    INDUSTRIES, INDUSTRY_ORDER, LOCATIONS, MERCHANTS, MERCHANT_TILES, LINKS, LINK_BY_ID, INDUSTRY_CARDS, WILD_COUNT,
    HAND_SIZE, START_MONEY, START_INCOME_SPACE, LOAN_AMOUNT, CANAL_COST, RAIL_COST, DOUBLE_RAIL_COST, MERCHANT_LINK_VP,
    COAL_MARKET_SIZE, IRON_MARKET_SIZE, COAL_MARKET_START, IRON_MARKET_START, tileDef, placeName
} from './data.js';

export class RuleError extends Error {}
const fail = (message) => { throw new RuleError(message); };

export const clone = (state) => structuredClone(state);

// ---- 乱数（状態の中に持つので、写しても同じ続きになる） ----

export function random(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let x = state.rng;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function shuffle(state, array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ---- 収入の段 ----

// 段のマス（0〜99）から収入（−10〜+30）へ。0〜10 は1マス、11〜30 は2マス、31〜60 は3マス、61〜 は4マスで1つ上がる
export function incomeLevel(space) {
    if (space <= 10) return space - 10;
    if (space <= 30) return Math.ceil((space - 10) / 2);
    if (space <= 60) return 10 + Math.ceil((space - 30) / 3);
    return Math.min(30, 20 + Math.ceil((space - 60) / 4));
}

// その収入のうち、一番上のマス（借金で下がるときは、ここに置く）
export function topSpaceOf(level) {
    if (level <= 0) return level + 10;
    if (level <= 10) return 10 + level * 2;
    if (level <= 20) return 30 + (level - 10) * 3;
    return Math.min(99, 60 + (level - 20) * 4);
}

const raiseIncome = (player, spaces) => { player.incomeSpace = Math.min(99, player.incomeSpace + spaces); };

// ---- 市場 ----

export const buyPrice = (count, size) => (count === 0 ? size / 2 + 1 : Math.floor((size - count) / 2) + 1);
export const sellPrice = (count, size) => Math.floor((size - count - 1) / 2) + 1;

// ---- 盤面の位置 ----

export const slotLoc = (slot) => slot.split(':')[0];
export const inPlay = (state, id) => ((LOCATIONS[id] ?? MERCHANTS[id])?.players ?? 99) <= state.numPlayers;
export const linksInPlay = (state) => LINKS.filter(l => l.ends.every(end => inPlay(state, end)));
export const townsInPlay = (state) => Object.keys(LOCATIONS).filter(id => inPlay(state, id));
export const merchantsInPlay = (state) => Object.keys(MERCHANTS).filter(id => inPlay(state, id));

// 引かれたリンク（だれのものでも）でたどった、各町までのリンクの数
export function distances(state, starts) {
    const adj = {};
    for (const id of Object.keys(state.links)) {
        const ends = LINK_BY_ID[id].ends;
        ends.forEach(a => ends.forEach(b => { if (a !== b) (adj[a] ??= []).push(b); }));
    }
    const dist = {};
    let frontier = [...new Set(starts)];
    frontier.forEach(s => { dist[s] = 0; });
    while (frontier.length > 0) {
        const next = [];
        for (const a of frontier) {
            for (const b of adj[a] ?? []) {
                if (dist[b] !== undefined) continue;
                dist[b] = dist[a] + 1;
                next.push(b);
            }
        }
        frontier = next;
    }
    return dist;
}

export const connected = (state, a, b) => distances(state, [a])[b] !== undefined;

export function connectedToMerchant(state, locs, dist = distances(state, locs)) {
    return merchantsInPlay(state).some(m => dist[m] !== undefined);
}

// 自分のネットワーク：自分のタイルがある町と、自分のリンクの端の町
export function networkOf(state, seat) {
    const net = new Set();
    for (const [slot, tile] of Object.entries(state.board)) if (tile.owner === seat) net.add(slotLoc(slot));
    for (const [id, owner] of Object.entries(state.links)) if (owner === seat) LINK_BY_ID[id].ends.forEach(e => net.add(e));
    return net;
}

// 盤面に自分のものが1つもなければ、どこでもネットワークの中として扱う
export function inNetwork(state, seat, loc, net = networkOf(state, seat)) {
    return net.size === 0 || net.has(loc);
}

export const nextLevel = (player, industry) => {
    const index = player.mat[industry].findIndex(n => n > 0);
    return index < 0 ? null : index + 1;
};

export const cubesOnBoard = (state, industry) => Object.values(state.board).some(t => t.industry === industry && t.cubes > 0);

// ---- 準備 ----

export function buildDeck(numPlayers) {
    const col = numPlayers - 2;
    const deck = [];
    let n = 0;
    for (const [loc, def] of Object.entries(LOCATIONS)) {
        for (let i = 0; i < def.cards[col]; i++) deck.push({ id: `c${n++}`, kind: 'loc', loc });
    }
    for (const card of INDUSTRY_CARDS) {
        for (let i = 0; i < card.cards[col]; i++) deck.push({ id: `c${n++}`, kind: 'ind', industries: card.industries });
    }
    return deck;
}

export const WILD_LOC = { id: 'wl', kind: 'wildLoc' };
export const WILD_IND = { id: 'wi', kind: 'wildInd' };

export function createState(players, seed) {
    const numPlayers = players.length;
    const state = {
        numPlayers,
        rng: seed >>> 0,
        era: 'canal',
        round: 1,
        phase: 'play',
        order: [],
        turnIdx: 0,
        actionsLeft: 1,
        players: players.map(p => ({
            name: p.name,
            isCPU: !!p.isCPU,
            money: START_MONEY,
            vp: 0,
            incomeSpace: START_INCOME_SPACE,
            spent: 0,
            hand: [],
            mat: Object.fromEntries(INDUSTRY_ORDER.map(ind => [ind, INDUSTRIES[ind].tiles.map(tile => tile.count)]))
        })),
        deck: [],
        discardCount: 0,
        wild: { loc: WILD_COUNT, ind: WILD_COUNT },
        board: {},
        links: {},
        coalMarket: COAL_MARKET_START,
        ironMarket: IRON_MARKET_START,
        merchants: {},
        scores: [],
        winners: []
    };
    // 商人タイルを並べる
    const tiles = [];
    for (let n = 2; n <= numPlayers; n++) tiles.push(...MERCHANT_TILES[n]);
    shuffle(state, tiles);
    for (const m of merchantsInPlay(state)) {
        for (let i = 0; i < MERCHANTS[m].slots; i++) {
            const tile = tiles.shift();
            state.merchants[`${m}:${i}`] = { tile, beer: tile === 'blank' ? 0 : 1 };
        }
    }
    state.order = shuffle(state, players.map((_, i) => i));
    state.deck = shuffle(state, buildDeck(numPlayers));
    // 運河の時代は、1人1枚ずつ伏せて捨ててから8枚配る
    for (const seat of state.order) {
        state.deck.pop();
        state.discardCount++;
    }
    for (const seat of state.order) for (let i = 0; i < HAND_SIZE; i++) state.players[seat].hand.push(state.deck.pop());
    return state;
}

export const currentSeat = (state) => (state.phase === 'play' ? state.order[state.turnIdx] : null);
export const roundsPerEra = (numPlayers) => ({ 2: 10, 3: 9, 4: 8 })[numPlayers];

// ---- 資源を取る ----

function pay(state, seat, amount) {
    const p = state.players[seat];
    p.money -= amount;
    p.spent += amount;
}

function flip(state, slot, out) {
    const tile = state.board[slot];
    tile.flipped = true;
    const def = tileDef(tile.industry, tile.level);
    raiseIncome(state.players[tile.owner], def.income);
    out?.marks.slots.push(slot);
}

function takeCube(state, slot, out) {
    const tile = state.board[slot];
    tile.cubes--;
    if (tile.cubes === 0) flip(state, slot, out);
}

// 石炭：つながった一番近い炭鉱から（同じ近さなら自分のものから）。なければ、商人につながっていれば市場から買う
function takeCoal(state, seat, locs, n, out) {
    for (let i = 0; i < n; i++) {
        const dist = distances(state, locs);
        let best = null;
        for (const [slot, tile] of Object.entries(state.board)) {
            if (tile.industry !== 'coal' || tile.cubes <= 0) continue;
            const d = dist[slotLoc(slot)];
            if (d === undefined) continue;
            const rank = d * 2 + (tile.owner === seat ? 0 : 1);
            if (!best || rank < best.rank) best = { slot, rank };
        }
        if (best) {
            takeCube(state, best.slot, out);
            out && (out.used.coal = (out.used.coal ?? 0) + 1);
            continue;
        }
        if (!connectedToMerchant(state, locs, dist)) fail('石炭が手に入りません（つながった炭鉱がなく、商人にもつながっていません）');
        const price = buyPrice(state.coalMarket, COAL_MARKET_SIZE);
        pay(state, seat, price);
        if (state.coalMarket > 0) state.coalMarket--;
        out && (out.used.coalMoney = (out.used.coalMoney ?? 0) + price);
    }
}

// 鉄：どこの製鉄所からでも（自分のものから）。なければ市場から買う
function takeIron(state, seat, n, out) {
    for (let i = 0; i < n; i++) {
        let best = null;
        for (const [slot, tile] of Object.entries(state.board)) {
            if (tile.industry !== 'iron' || tile.cubes <= 0) continue;
            const rank = tile.owner === seat ? 0 : 1;
            if (!best || rank < best.rank) best = { slot, rank };
        }
        if (best) {
            takeCube(state, best.slot, out);
            out && (out.used.iron = (out.used.iron ?? 0) + 1);
            continue;
        }
        const price = buyPrice(state.ironMarket, IRON_MARKET_SIZE);
        pay(state, seat, price);
        if (state.ironMarket > 0) state.ironMarket--;
        out && (out.used.ironMoney = (out.used.ironMoney ?? 0) + price);
    }
}

// ビール：売り先の商人のビール（おまけが付く）→ 自分の醸造所（どこでも）→ つながったほかの人の醸造所。商人のビールを使ったら true
function takeBeer(state, seat, locs, n, merchantSlot, out) {
    let usedMerchant = false;
    for (let i = 0; i < n; i++) {
        const m = merchantSlot ? state.merchants[merchantSlot] : null;
        if (m && !usedMerchant && m.beer > 0) {
            m.beer--;
            usedMerchant = true;
            continue;
        }
        const dist = distances(state, locs);
        let best = null;
        for (const [slot, tile] of Object.entries(state.board)) {
            if (tile.industry !== 'brewery' || tile.cubes <= 0) continue;
            const own = tile.owner === seat;
            const d = dist[slotLoc(slot)];
            if (!own && d === undefined) continue;
            const rank = own ? 0 : 1 + d;
            if (!best || rank < best.rank) best = { slot, rank };
        }
        if (!best) fail('ビールが足りません（自分の醸造所か、つながったほかの人の醸造所が要ります）');
        takeCube(state, best.slot, out);
    }
    if (out) out.used.beer = (out.used.beer ?? 0) + n;
    return usedMerchant;
}

// ---- アクション ----

const handCard = (player, id) => player.hand.find(c => c.id === id) ?? fail('そのカードは手札にありません');

export function canBuildWithCard(state, seat, card, loc, industry, net) {
    if (card.kind === 'loc') return card.loc === loc;
    if (card.kind === 'wildLoc') return true;
    const inNet = inNetwork(state, seat, loc, net);
    if (card.kind === 'ind') return card.industries.includes(industry) && inNet;
    return inNet; // wildInd
}

// 建てられるかの、資源とお金を除いた確認（安く済むので、候補を絞るのに使う）。だめなら理由の文を返す
export function buildBlocker(state, seat, slot, industry) {
    const [loc, idxText] = slot.split(':');
    const def = LOCATIONS[loc];
    if (!def || !inPlay(state, loc)) return 'その町は使いません';
    const idx = Number(idxText);
    const allowed = def.slots[idx];
    if (!allowed) return 'その場所はありません';
    if (!allowed.includes(industry)) return 'そこには建てられない産業です';
    const player = state.players[seat];
    const level = nextLevel(player, industry);
    if (!level) return 'その産業のタイルは残っていません';
    const td = tileDef(industry, level);
    if (state.era === 'rail' && td.canalOnly) return 'レベル1のタイルは鉄道の時代には建てられません（開発で外します）';
    if (state.era === 'canal' && td.railOnly) return 'このタイルは鉄道の時代にしか建てられません';
    const existing = state.board[slot];
    if (existing) {
        if (existing.industry !== industry) return 'ほかの産業のタイルの上には建てられません';
        if (existing.level >= level) return '上に建てるには、より高いレベルのタイルが要ります';
        if (existing.owner !== seat) {
            const res = INDUSTRIES[industry].resource;
            const market = industry === 'coal' ? state.coalMarket : state.ironMarket;
            if ((res !== 'coal' && res !== 'iron') || cubesOnBoard(state, industry) || market > 0) {
                return 'ほかの人のタイルの上に建てられるのは、盤面と市場からその資源がなくなった炭鉱・製鉄所だけです';
            }
        }
    } else if (allowed.length > 1 && def.slots.some((s, i) => i !== idx && s.length === 1 && s[0] === industry && !state.board[`${loc}:${i}`])) {
        return `${INDUSTRIES[industry].name}だけの場所が空いているので、先にそちらへ建てます`;
    }
    if (state.era === 'canal' && def.slots.some((_, i) => i !== idx && state.board[`${loc}:${i}`]?.owner === seat)) {
        return '運河の時代は、1つの町に自分のタイルは1枚までです';
    }
    return null;
}

function doBuild(state, seat, { card, slot, industry }, out) {
    if (typeof slot !== 'string' || !INDUSTRIES[industry]) fail('建てる場所と産業を選んでください');
    const blocker = buildBlocker(state, seat, slot, industry);
    if (blocker) fail(blocker);
    const loc = slotLoc(slot);
    const player = state.players[seat];
    if (!canBuildWithCard(state, seat, handCard(player, card), loc, industry)) fail('そのカードでは、そこに建てられません');
    const level = nextLevel(player, industry);
    const td = tileDef(industry, level);
    pay(state, seat, td.cost);
    takeCoal(state, seat, [loc], td.coal, out);
    takeIron(state, seat, td.iron, out);
    player.mat[industry][level - 1]--;
    const replaced = state.board[slot];
    const resource = INDUSTRIES[industry].resource;
    const cubes = resource === 'beer' ? (state.era === 'canal' ? 1 : 2) : (td.produce ?? 0);
    state.board[slot] = { owner: seat, industry, level, flipped: false, cubes };
    out?.marks.slots.push(slot);
    let sold = 0;
    if (resource === 'coal' && connectedToMerchant(state, [loc])) {
        while (state.board[slot].cubes > 0 && state.coalMarket < COAL_MARKET_SIZE) {
            player.money += sellPrice(state.coalMarket, COAL_MARKET_SIZE);
            sold += sellPrice(state.coalMarket, COAL_MARKET_SIZE);
            state.coalMarket++;
            state.board[slot].cubes--;
        }
    }
    if (resource === 'iron') {
        while (state.board[slot].cubes > 0 && state.ironMarket < IRON_MARKET_SIZE) {
            player.money += sellPrice(state.ironMarket, IRON_MARKET_SIZE);
            sold += sellPrice(state.ironMarket, IRON_MARKET_SIZE);
            state.ironMarket++;
            state.board[slot].cubes--;
        }
    }
    if (resource && state.board[slot].cubes === 0) flip(state, slot, out);
    if (out) {
        out.text = `${placeName(loc)}に${INDUSTRIES[industry].name} Lv${level}${replaced ? '（上に建てた）' : ''}を建てた`;
        if (sold > 0) out.text += `。市場に売って £${sold}`;
    }
}

function doNetwork(state, seat, { links }, out) {
    if (!Array.isArray(links) || links.length < 1 || links.length > 2 || new Set(links).size !== links.length) fail('引くつながりを選んでください');
    if (state.era === 'canal' && links.length !== 1) fail('運河は1回に1本です');
    const cost = state.era === 'canal' ? CANAL_COST : links.length === 2 ? DOUBLE_RAIL_COST : RAIL_COST;
    pay(state, seat, cost);
    const ends = [];
    for (const id of links) {
        const link = LINK_BY_ID[id];
        if (!link || !link.ends.every(e => inPlay(state, e))) fail('そのつながりは使いません');
        if (state.links[id] !== undefined) fail('そこにはもう引かれています');
        if (state.era === 'canal' ? !link.canal : !link.rail) fail(state.era === 'canal' ? 'そこには運河を引けません' : 'そこには鉄道を引けません');
        const net = networkOf(state, seat);
        if (net.size > 0 && !link.ends.some(e => net.has(e))) fail('自分のネットワーク（自分のタイルかリンクのある町）に隣り合っていません');
        state.links[id] = seat;
        ends.push(...link.ends);
        out?.marks.links.push(id);
        if (state.era === 'rail') takeCoal(state, seat, link.ends, 1, out);
    }
    if (links.length === 2) takeBeer(state, seat, ends, 1, null, out);
    if (out) {
        const kind = state.era === 'canal' ? '運河' : '鉄道';
        out.text = `${kind}を引いた（${links.map(id => LINK_BY_ID[id].ends.map(placeName).join('–')).join('、')}）`;
    }
}

// 開発で外すタイルの自動の選び方（グロスターのおまけ）：外せるうち、得点が一番低いタイル
export function autoDevelopChoice(player) {
    let best = null;
    for (const ind of INDUSTRY_ORDER) {
        const level = nextLevel(player, ind);
        if (!level) continue;
        const td = tileDef(ind, level);
        if (td.noDevelop) continue;
        if (!best || td.vp < best.vp) best = { ind, vp: td.vp };
    }
    return best?.ind ?? null;
}

function developOne(state, seat, industry, free, out) {
    const player = state.players[seat];
    if (!INDUSTRIES[industry]) fail('開発する産業を選んでください');
    const level = nextLevel(player, industry);
    if (!level) fail('その産業のタイルは残っていません');
    if (tileDef(industry, level).noDevelop) fail('このタイル（電球の印）は開発で外せません');
    player.mat[industry][level - 1]--;
    if (!free) takeIron(state, seat, 1, out);
    return `${INDUSTRIES[industry].name} Lv${level}`;
}

function doDevelop(state, seat, { industries }, out) {
    if (!Array.isArray(industries) || industries.length < 1 || industries.length > 2) fail('開発する産業を1つか2つ選んでください');
    const names = industries.map(ind => developOne(state, seat, ind, false, out));
    if (out) out.text = `開発した（${names.join('・')}を外した）`;
}

// 売れるか：その商人がその品を買い、つながっていること
export function merchantAccepts(state, merchantSlot, industry) {
    const m = state.merchants[merchantSlot];
    return !!m && (m.tile === industry || m.tile === 'any');
}

function doSell(state, seat, { sales }, out) {
    if (!Array.isArray(sales) || sales.length < 1) fail('売るタイルを選んでください');
    const texts = [];
    for (const sale of sales) {
        if (!sale || typeof sale.slot !== 'string' || typeof sale.merchant !== 'string') fail('売るタイルと商人を選んでください');
        const tile = state.board[sale.slot];
        if (!tile || tile.owner !== seat) fail('自分のタイルではありません');
        if (!INDUSTRIES[tile.industry].sell) fail('売れるのは綿工場・製造所・陶器だけです');
        if (tile.flipped) fail('もう売ったタイルです');
        if (!merchantAccepts(state, sale.merchant, tile.industry)) fail('その商人は、その品を買いません');
        const loc = slotLoc(sale.slot);
        const mLoc = slotLoc(sale.merchant);
        if (!connected(state, loc, mLoc)) fail('その商人につながっていません');
        const td = tileDef(tile.industry, tile.level);
        const usedMerchant = takeBeer(state, seat, [loc], td.beer, sale.merchant, out);
        flip(state, sale.slot, out);
        let text = `${placeName(loc)}の${INDUSTRIES[tile.industry].name}を${placeName(mLoc)}へ`;
        if (usedMerchant) text += `（${applyBonus(state, seat, mLoc, sale.develop, out)}）`;
        texts.push(text);
    }
    if (out) out.text = `売った：${texts.join('、')}`;
}

function applyBonus(state, seat, mLoc, developChoice, out) {
    const bonus = MERCHANTS[mLoc].bonus;
    const player = state.players[seat];
    if (bonus.type === 'money') {
        player.money += bonus.amount;
        return `おまけ £${bonus.amount}`;
    }
    if (bonus.type === 'vp') {
        player.vp += bonus.amount;
        return `おまけ ${bonus.amount}点`;
    }
    if (bonus.type === 'income') {
        raiseIncome(player, bonus.amount);
        return `おまけ 収入+${bonus.amount}`;
    }
    const ind = developChoice ?? autoDevelopChoice(player);
    if (!ind) return 'おまけの開発はなし';
    return `おまけで開発：${developOne(state, seat, ind, true, out)}`;
}

function doLoan(state, seat, _command, out) {
    const player = state.players[seat];
    const level = incomeLevel(player.incomeSpace);
    if (level - 3 < -10) fail('収入が −10 より下がるので、借りられません');
    player.incomeSpace = topSpaceOf(level - 3);
    player.money += LOAN_AMOUNT;
    if (out) out.text = `£${LOAN_AMOUNT} 借りた（収入 −3）`;
}

function doScout(state, seat, _command, out) {
    const player = state.players[seat];
    if (player.hand.some(c => c.kind === 'wildLoc' || c.kind === 'wildInd')) fail('ワイルドカードを持っている間は偵察できません');
    if (state.wild.loc <= 0 || state.wild.ind <= 0) fail('ワイルドカードが残っていません');
    if (out) out.text = '偵察した（ワイルドカードを2枚得た）';
}

function doPass(_state, _seat, _command, out) {
    if (out) out.text = 'パスした';
}

const ACTIONS = { build: doBuild, network: doNetwork, develop: doDevelop, sell: doSell, loan: doLoan, scout: doScout, pass: doPass };

export const ACTION_NAMES = { build: '建てる', network: 'ネットワーク', develop: '開発', sell: '売る', loan: '借りる', scout: '偵察', pass: 'パス' };

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    build: ['card', 'slot', 'industry'],
    network: ['card', 'links'],
    develop: ['card', 'industries'],
    sell: ['card', 'sales'],
    loan: ['card'],
    scout: ['cards'],
    pass: ['card']
};

const isWild = (card) => card.kind === 'wildLoc' || card.kind === 'wildInd';

function discard(state, player, ids) {
    for (const id of ids) {
        const index = player.hand.findIndex(c => c.id === id);
        const [card] = player.hand.splice(index, 1);
        if (card.kind === 'wildLoc') state.wild.loc++;
        else if (card.kind === 'wildInd') state.wild.ind++;
        else state.discardCount++;
    }
}

// アクションを1つ行う（手番を進める処理は含まない）。out に、ログの文と盤面の印を集める
export function doAction(state, seat, command, out = null) {
    if (state.phase !== 'play') fail('ゲームは終わっています');
    if (currentSeat(state) !== seat) fail('あなたの番ではありません');
    if (state.actionsLeft <= 0) fail('この番のアクションは終わっています');
    const action = ACTIONS[command?.type];
    if (!action) fail('知らない操作です');
    const player = state.players[seat];
    let cards;
    if (command.type === 'scout') {
        cards = command.cards;
        if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3) fail('偵察には、手札を3枚選びます');
    } else {
        cards = [command.card];
    }
    cards.forEach(id => handCard(player, id));
    action(state, seat, command, out);
    if (player.money < 0) fail('お金が足りません');
    discard(state, player, cards);
    if (command.type === 'scout') {
        state.wild.loc--;
        state.wild.ind--;
        player.hand.push({ ...WILD_LOC }, { ...WILD_IND });
    }
    state.actionsLeft--;
}

// 写しで試す。できれば写しの状態、できなければ理由を返す
export function trial(state, seat, command) {
    const copy = clone(state);
    try {
        doAction(copy, seat, command);
        return { ok: true, state: copy };
    } catch (error) {
        if (error instanceof RuleError) return { ok: false, error: error.message };
        throw error;
    }
}

// ---- 手番と時代の進行 ----

// アクションのあと。手番が終われば、手札を補い、次の人へ。ラウンドや時代が終われば、収入と得点を処理する
export function afterAction(state, out) {
    const seat = currentSeat(state);
    if (state.actionsLeft > 0 && state.players[seat].hand.length > 0) return;
    endTurn(state, out);
}

function endTurn(state, out) {
    for (;;) {
        const player = state.players[currentSeat(state)];
        while (player.hand.length < HAND_SIZE && state.deck.length > 0) player.hand.push(state.deck.pop());
        state.turnIdx++;
        if (state.turnIdx >= state.order.length) {
            endRound(state, out);
            if (state.phase !== 'play') return;
        }
        state.actionsLeft = state.era === 'canal' && state.round === 1 ? 1 : 2;
        // 手札がなければ、その人の番は飛ばす（偵察で早く使い切ったとき）
        if (state.players[currentSeat(state)].hand.length > 0) return;
        state.actionsLeft = 0;
    }
}

function endRound(state, out) {
    const eraOver = state.deck.length === 0 && state.players.every(p => p.hand.length === 0);
    const gameOver = eraOver && state.era === 'rail';
    // 使ったお金の少ない順（同じなら、今の順のまま）
    state.order = [...state.order].sort((a, b) => state.players[a].spent - state.players[b].spent);
    if (!gameOver) collectIncome(state, out);
    state.players.forEach(p => { p.spent = 0; });
    state.turnIdx = 0;
    if (eraOver) {
        endEra(state, out);
    } else {
        state.round++;
    }
}

function collectIncome(state, out) {
    state.players.forEach((player, seat) => {
        const income = incomeLevel(player.incomeSpace);
        player.money += income;
        if (player.money >= 0) return;
        // 払えなければ、タイルを半額で手放し、それでも足りなければ1ポンドにつき1点失う
        let short = -player.money;
        player.money = 0;
        const own = Object.entries(state.board).filter(([, t]) => t.owner === seat)
            .sort(([, a], [, b]) => (a.flipped - b.flipped) || (tileDef(a.industry, a.level).cost - tileDef(b.industry, b.level).cost));
        for (const [slot, tile] of own) {
            if (short <= 0) break;
            const refund = Math.floor(tileDef(tile.industry, tile.level).cost / 2);
            if (refund <= 0) continue;
            delete state.board[slot];
            short -= refund;
            out?.logs.push({ seat, text: `収入が払えず、${placeName(slotLoc(slot))}の${INDUSTRIES[tile.industry].name}を £${refund} で手放した` });
        }
        if (short < 0) player.money = -short;
        if (short > 0) {
            player.vp = Math.max(0, player.vp - short);
            out?.logs.push({ seat, text: `収入が払えず、${short}点失った` });
        }
    });
}

// 町のリンクの得点：裏返ったタイルのリンクの得点の合計。商人の町は決まった値
export function locationLinkValue(state, loc) {
    if (MERCHANTS[loc]) return MERCHANT_LINK_VP;
    let v = 0;
    for (const [slot, tile] of Object.entries(state.board)) {
        if (tile.flipped && slotLoc(slot) === loc) v += tileDef(tile.industry, tile.level).link;
    }
    return v;
}

// 時代の終わりの得点（リンクと裏返ったタイル）
export function eraPoints(state, seat) {
    let links = 0;
    for (const [id, owner] of Object.entries(state.links)) {
        if (owner === seat) links += LINK_BY_ID[id].ends.reduce((sum, loc) => sum + locationLinkValue(state, loc), 0);
    }
    let tiles = 0;
    for (const tile of Object.values(state.board)) {
        if (tile.owner === seat && tile.flipped) tiles += tileDef(tile.industry, tile.level).vp;
    }
    return { links, tiles };
}

function endEra(state, out) {
    const era = state.era;
    const points = state.players.map((_, seat) => eraPoints(state, seat));
    points.forEach((p, seat) => { state.players[seat].vp += p.links + p.tiles; });
    state.scores.push({ era, points });
    out?.logs.push({ seat: null, text: `${era === 'canal' ? '運河' : '鉄道'}の時代の得点：${points.map((p, s) => `${state.players[s].name} +${p.links + p.tiles}`).join('、')}` });
    if (era === 'rail') {
        state.phase = 'over';
        state.winners = ranking(state).filter(r => r.rank === 1).map(r => r.seat);
        return;
    }
    // 鉄道の時代へ：運河とレベル1のタイルを外し、商人のビールを戻し、山札を作り直す
    state.links = {};
    for (const [slot, tile] of Object.entries(state.board)) if (tile.level === 1) delete state.board[slot];
    for (const m of Object.values(state.merchants)) m.beer = m.tile === 'blank' ? 0 : 1;
    state.era = 'rail';
    state.round = 1;
    state.deck = shuffle(state, buildDeck(state.numPlayers));
    state.discardCount = 0;
    state.wild = { loc: WILD_COUNT, ind: WILD_COUNT };
    for (const seat of state.order) for (let i = 0; i < HAND_SIZE; i++) state.players[seat].hand.push(state.deck.pop());
    out?.logs.push({ seat: null, text: '鉄道の時代が始まった（運河とレベル1のタイルを外した）' });
}

// 順位：得点 → 収入 → お金
export function ranking(state) {
    const key = (seat) => {
        const p = state.players[seat];
        return [p.vp, incomeLevel(p.incomeSpace), p.money];
    };
    const seats = state.players.map((_, i) => i).sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        return kb[0] - ka[0] || kb[1] - ka[1] || kb[2] - ka[2];
    });
    return seats.map(seat => {
        const k = key(seat);
        const rank = 1 + seats.filter(o => {
            const ko = key(o);
            return ko[0] > k[0] || (ko[0] === k[0] && (ko[1] > k[1] || (ko[1] === k[1] && ko[2] > k[2])));
        }).length;
        return { seat, rank, vp: k[0], income: k[1], money: k[2] };
    });
}

// ---- 候補の列挙（画面と CPU が使う） ----

// 建てられる場所と産業。cards はそれを建てられる手札
export function buildOptions(state, seat) {
    const player = state.players[seat];
    const net = networkOf(state, seat);
    const result = [];
    for (const loc of townsInPlay(state)) {
        LOCATIONS[loc].slots.forEach((allowed, idx) => {
            const slot = `${loc}:${idx}`;
            for (const industry of allowed) {
                if (buildBlocker(state, seat, slot, industry)) continue;
                const cards = player.hand.filter(c => canBuildWithCard(state, seat, c, loc, industry, net)).map(c => c.id);
                if (cards.length === 0) continue;
                const t = trial(state, seat, { type: 'build', card: cards[0], slot, industry });
                if (t.ok) result.push({ slot, industry, cards, after: t.state });
            }
        });
    }
    return result;
}

// 1本目に引けるリンク（first を渡すと、それを引いたあとの2本目）
export function networkOptions(state, seat, first = null) {
    const card = state.players[seat].hand[0]?.id;
    if (!card) return [];
    return linksInPlay(state).filter(l => state.links[l.id] === undefined && l.id !== first)
        .map(l => ({ id: l.id, t: trial(state, seat, { type: 'network', card, links: first ? [first, l.id] : [l.id] }) }))
        .filter(o => o.t.ok).map(o => ({ id: o.id, after: o.t.state }));
}

// 売れるタイルと商人の組（sold は、同じアクションで先に売るもの）
export function sellOptions(state, seat, sold = []) {
    const card = state.players[seat].hand[0]?.id;
    if (!card) return [];
    const result = [];
    const done = new Set(sold.map(s => s.slot));
    for (const [slot, tile] of Object.entries(state.board)) {
        if (tile.owner !== seat || tile.flipped || !INDUSTRIES[tile.industry].sell || done.has(slot)) continue;
        for (const merchant of Object.keys(state.merchants)) {
            if (!merchantAccepts(state, merchant, tile.industry)) continue;
            const t = trial(state, seat, { type: 'sell', card, sales: [...sold, { slot, merchant }] });
            if (t.ok) result.push({ slot, merchant, after: t.state });
        }
    }
    return result;
}

export function developOptions(state, seat, first = null) {
    const card = state.players[seat].hand[0]?.id;
    if (!card) return [];
    return INDUSTRY_ORDER.map(ind => ({ ind, t: trial(state, seat, { type: 'develop', card, industries: first ? [first, ind] : [ind] }) }))
        .filter(o => o.t.ok).map(o => ({ industry: o.ind, after: o.t.state }));
}

export const canLoan = (state, seat) => incomeLevel(state.players[seat].incomeSpace) - 3 >= -10;
export const canScout = (state, seat) => {
    const hand = state.players[seat].hand;
    return hand.length >= 3 && !hand.some(isWild) && state.wild.loc > 0 && state.wild.ind > 0;
};
