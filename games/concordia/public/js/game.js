/**
 * コンコルディアのゲームの進行（基本ゲーム、自作の地中海の地図）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（乱数は準備（山札・都市の品）でだけ使う）
 *
 * 手番：手札から1枚を使い、効果を行って自分の捨て札に置く
 * - 護民官：捨て札を全部手札に戻し、戻した枚数（護民官を含む）が3枚を超えた分、1枚につき1。食料1・道具1で植民者を1人ローマに置ける
 * - 建築家：盤上の自分の植民者の数だけ歩数を割り振って動かし（陸は陸路、海は海路）、植民者のいる道の両端の都市に家を建てる
 * - 属州総督：品の面の州を選んで生産させる（ボーナスの品を受け取り、州の家すべてが持ち主に品を出す）か、お金の面の分を受け取って全部を品の面に戻す
 * - 商人：お金を受け取り、2種類までの品を売り買いする
 * - 元老院議員：市場から2枚まで買う（カードの費用＋置き場所の費用）／執政官：市場から1枚、カードの費用だけで買う
 * - 植民者：食料1・道具1で、ローマか自分の家がある都市に植民者を置く。またはお金（5＋盤上の自分の植民者の数）
 * - 外交官：ほかの人の捨て札のいちばん上のカードの効果を行う
 * - 職人（石工・農夫・鍛冶・ぶどう酒造り・織工）：その品の都市の自分の家が、それぞれ1つ生産する
 * 終わり：市場の最後のカードを買うか、15軒目の家を建てた人がコンコルディアのカード（7点）を受け取り、ほかの人が最後の手番を1回ずつ行う
 *
 * ルールの細部と、資料で分からなかった点の決め方は README の「資料で分からない点の決め方」に書く
 */

import { createRandom, shuffle } from './random.js';
import {
    GOODS, GOOD_NAMES, BUILD_VALUE, PRICE, BONUS_COINS, CARD_TYPES, STARTING_HAND, buildMarketDeck, DISPLAY_SURCHARGE,
    STORE_SIZE, HOUSES, COLONISTS, START_GOODS, START_MONEY, CONCORDIA_POINTS, MERCATOR_MONEY, COLONIST_MONEY_BASE
} from './cards.js';
import { CITIES, CITY, PROVINCES, ROADS, ROAD, ROME, TOKENS, roadsAt } from './map.js';
import { scorePlayer } from './scoring.js';

export { GOODS, GOOD_NAMES, CARD_TYPES, CITIES, PROVINCES, ROADS };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const COLORS = ['red', 'blue', 'green', 'yellow', 'black'];
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    play: ['card', 'copy', 'colonist', 'province', 'cash', 'trades', 'buys', 'place'],
    move: ['colonist', 'road'],
    build: ['city'],
    finish: []
};

const isGood = (g) => GOODS.includes(g);
const emptyGoods = () => Object.fromEntries(GOODS.map(g => [g, 0]));

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const random = createRandom(seed);
        this.options = { seed };
        this.cards = [];     // カードの実体 { id, type }。id は配列の位置
        // type：カードの種類（文字列）か、市場のカード { type, phase }
        const newCard = (spec) => {
            const card = typeof spec === 'string' ? { id: this.cards.length, type: spec } : { id: this.cards.length, ...spec };
            this.cards.push(card);
            return card.id;
        };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            color: COLORS[id],
            money: START_MONEY[id],
            goods: { ...emptyGoods(), ...START_GOODS },
            store: { land: COLONISTS.land - 1, sea: COLONISTS.sea - 1 },   // 倉庫の植民者
            hand: STARTING_HAND.map(newCard),
            discard: [],
            concordia: false
        }));
        // 植民者：各人、陸と海を1人ずつローマに置く
        this.colonists = [];
        this.players.forEach(p => {
            ['land', 'sea'].forEach(kind => this.colonists.push({ id: this.colonists.length, owner: p.id, kind, city: ROME, road: null }));
        });
        this.houses = Object.fromEntries(CITIES.map(c => [c.id, []]));  // 都市ごとの家の持ち主
        // 都市の品：文字ごとに品のトークンを切り、その文字の都市に置く
        this.cityGoods = {};
        Object.entries(TOKENS).forEach(([letter, tokens]) => {
            const cities = CITIES.filter(c => c.letter === letter).map(c => c.id);
            const pile = shuffle([...tokens], random);
            cities.forEach((id, i) => { this.cityGoods[id] = pile[i]; });
        });
        // 州のボーナス：州の都市の品のうち、いちばん値の高い品。最初は品の面
        this.bonus = Object.fromEntries(PROVINCES.map(pr => {
            const goods = CITIES.filter(c => c.province === pr.id).map(c => this.cityGoods[c.id]);
            const good = goods.reduce((best, g) => (BUILD_VALUE[g] > BUILD_VALUE[best] ? g : best), goods[0]);
            return [pr.id, { good, active: true }];
        }));
        // 市場：7枚を並べ、残りを山札にする
        const deck = buildMarketDeck(players.length, random).map(newCard);
        this.display = deck.splice(0, DISPLAY_SURCHARGE.length);
        this.deck = deck;
        this.magnus = players.length - 1;   // プラエフェクトゥス・マグヌスは最後の手番の人
        this.current = 0;
        this.phase = 'turn';         // turn：カードを使う / architect：建築家の移動と建築 / end：終わり
        this.architect = null;       // 建築家の途中 { steps, built }
        this.boughtThisTurn = false;
        this.finalTurns = null;      // 終わりが決まったあと、まだ最後の手番をしていない人
        this.concordiaBy = null;
        this.turn = 1;
        this.results = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    get currentPlayer() {
        return this.players[this.current];
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    cardType(id) {
        return CARD_TYPES[this.cards[id]?.type];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            turn: { play: this.play },
            architect: { move: this.move, build: this.build, finish: this.finishArchitect }
        }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        const done = handler.call(this, playerId, command);
        if (!done) return false;
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- カードを使う ----

    // { type: 'play', card, copy?, ...効果の中身 }
    play(seat, command) {
        const player = this.players[seat];
        if (!player.hand.includes(command.card)) return this.fail('そのカードは手札にありません');
        let type = this.cards[command.card].type;
        let copied = null;
        if (CARD_TYPES[type].kind === 'diplomat') {
            const target = this.players[command.copy];
            if (!target || target.id === seat) return this.fail('まねる相手を選んでください');
            const top = target.discard.at(-1);
            if (top === undefined) return this.fail('その人の捨て札はありません');
            copied = this.cards[top].type;
            if (CARD_TYPES[copied].kind === 'diplomat') return this.fail('外交官はまねられません');
            type = copied;
        } else if (command.copy !== undefined) {
            return this.fail('操作が正しくありません');
        }
        const action = this.actionFor(type);
        if (!action) return this.fail('操作が正しくありません');
        // 判定（状態を変えない）
        const problem = action.check.call(this, seat, command, type);
        if (problem) return this.fail(problem);
        // 受け付け：カードを捨て札へ
        player.hand = player.hand.filter(id => id !== command.card);
        player.discard.push(command.card);
        const name = CARD_TYPES[this.cards[command.card].type].name;
        this.emit({ type: 'play', seat, card: command.card, cardType: this.cards[command.card].type, copied });
        this.log(copied
            ? `${player.name}が外交官で${this.players[command.copy].name}の${CARD_TYPES[copied].name}をまねました`
            : `${player.name}が${name}を使いました`);
        const keepTurn = action.run.call(this, seat, command, type);
        if (!keepTurn) this.endTurn();
        return true;
    }

    actionFor(type) {
        const kind = CARD_TYPES[type]?.kind;
        return {
            tribune: { check: this.checkTribune, run: this.runTribune },
            architect: { check: () => null, run: this.runArchitect },
            prefect: { check: this.checkPrefect, run: this.runPrefect },
            mercator: { check: this.checkMercator, run: this.runMercator },
            senator: { check: this.checkBuy, run: this.runBuy },
            consul: { check: this.checkBuy, run: this.runBuy },
            colonist: { check: this.checkColonist, run: this.runColonist },
            craftsman: { check: () => null, run: this.runCraftsman }
        }[kind];
    }

    // ---- 護民官 ----

    checkTribune(seat, { colonist }) {
        if (colonist === undefined || colonist === null) return null;
        if (colonist !== 'land' && colonist !== 'sea') return '植民者の種類が正しくありません';
        const p = this.players[seat];
        if (p.store[colonist] <= 0) return 'その植民者は倉庫にいません';
        if (p.goods.food < 1 || p.goods.tool < 1) return '植民者には食料1と道具1が要ります';
        return null;
    }

    runTribune(seat, { colonist }) {
        const p = this.players[seat];
        const back = p.discard.length;   // 護民官を含む
        p.hand.push(...p.discard);
        p.discard = [];
        const money = Math.max(0, back - 3);
        p.money += money;
        this.log(`${p.name}が捨て札${back}枚を手札に戻しました${money ? `（${money}セステルティウス）` : ''}`);
        if (colonist === 'land' || colonist === 'sea') this.placeColonist(seat, ROME, colonist, true);
        return false;
    }

    // ---- 建築家 ----

    runArchitect(seat) {
        const steps = this.colonists.filter(c => c.owner === seat && this.onBoard(c)).length;
        this.architect = { steps, built: false };
        this.phase = 'architect';
        return true;
    }

    onBoard(colonist) {
        return colonist.city !== null || colonist.road !== null;
    }

    // その植民者が、道 road まで動く歩数（ほかの植民者のいる道も通り抜けられる）。行けなければ Infinity
    distance(colonist, road) {
        const target = ROAD[road];
        if (!target || target.kind !== colonist.kind) return Infinity;
        if (colonist.road === road) return 0;
        const starts = colonist.road !== null ? [colonist.road] : roadsAt(colonist.city, colonist.kind);
        const base = colonist.road !== null ? 0 : 1;
        const seen = new Map(starts.map(r => [r, base]));
        const queue = [...starts];
        while (queue.length) {
            const r = queue.shift();
            const d = seen.get(r);
            if (r === road) return d;
            const { a, b } = ROAD[r];
            [...roadsAt(a, colonist.kind), ...roadsAt(b, colonist.kind)].forEach(next => {
                if (!seen.has(next)) {
                    seen.set(next, d + 1);
                    queue.push(next);
                }
            });
        }
        return Infinity;
    }

    roadOccupied(road) {
        return this.colonists.some(c => c.road === road);
    }

    // { type: 'move', colonist, road }
    move(seat, { colonist, road }) {
        const c = this.colonists[colonist];
        if (!c || c.owner !== seat || !this.onBoard(c)) return this.fail('その植民者は動かせません');
        if (this.architect.built) return this.fail('家を建てたあとは動かせません');
        if (!ROAD[road]) return this.fail('道を選んでください');
        if (c.road === road) return this.fail('その道にいます');
        if (this.roadOccupied(road)) return this.fail('ほかの植民者のいる道には止まれません');
        const d = this.distance(c, road);
        if (d === Infinity) return this.fail(c.kind === 'land' ? '陸の植民者は陸路だけを動きます' : '海の植民者は海路だけを動きます');
        if (d > this.architect.steps) return this.fail('歩数が足りません');
        this.architect.steps -= d;
        const from = c.road !== null ? { road: c.road } : { city: c.city };
        c.road = road;
        c.city = null;
        this.emit({ type: 'move', seat, colonist, from, to: { road }, steps: d });
        return true;
    }

    // その人が今、家を建てられる都市（植民者のいる道の端。まだ自分の家がない。ローマを除く）
    buildableCities(seat) {
        const set = new Set();
        this.colonists.forEach(c => {
            if (c.owner !== seat || c.road === null) return;
            const { a, b } = ROAD[c.road];
            [a, b].forEach(city => {
                if (city !== ROME && !this.houses[city].includes(seat)) set.add(city);
            });
        });
        return [...set];
    }

    // 家を建てる費用 { goods, money }
    buildCost(city) {
        const good = this.cityGoods[city];
        const goods = good === 'brick' ? { food: 1 } : { brick: 1, [good]: 1 };
        const money = BUILD_VALUE[good] * (this.houses[city].length + 1);
        return { goods, money };
    }

    housesLeft(seat) {
        return HOUSES - Object.values(this.houses).filter(list => list.includes(seat)).length;
    }

    canPay(player, { goods, money }) {
        return player.money >= money && Object.entries(goods).every(([g, n]) => player.goods[g] >= n);
    }

    // { type: 'build', city }
    build(seat, { city }) {
        const p = this.players[seat];
        if (!CITY[city] || city === ROME) return this.fail('都市を選んでください');
        if (!this.buildableCities(seat).includes(city)) {
            return this.fail(this.houses[city]?.includes(seat) ? 'その都市には家があります' : '植民者のいる道の端の都市にだけ建てられます');
        }
        if (this.housesLeft(seat) <= 0) return this.fail('家が残っていません');
        const cost = this.buildCost(city);
        if (!this.canPay(p, cost)) return this.fail('品かお金が足りません');
        Object.entries(cost.goods).forEach(([g, n]) => { p.goods[g] -= n; });
        p.money -= cost.money;
        this.houses[city].push(seat);
        this.architect.built = true;
        this.emit({ type: 'build', seat, city });
        this.log(`${p.name}が${CITY[city].ja}に家を建てました（${cost.money}セステルティウス）`);
        if (this.housesLeft(seat) === 0) this.triggerEnd(seat, '15軒目の家を建てました');
        return true;
    }

    // { type: 'finish' }：建築家を終える
    finishArchitect() {
        this.architect = null;
        this.phase = 'turn';
        this.endTurn();
        return true;
    }

    // ---- 属州総督 ----

    checkPrefect(seat, { province, cash }) {
        if (cash === true) {
            if (province !== undefined) return '操作が正しくありません';
            return null;
        }
        const bonus = this.bonus[province];
        if (!bonus) return '州を選んでください';
        if (!bonus.active) return 'その州はもう生産しています（お金の面）';
        return null;
    }

    runPrefect(seat, { province, cash }) {
        const p = this.players[seat];
        if (cash === true) {
            const flipped = PROVINCES.filter(pr => !this.bonus[pr.id].active);
            const money = flipped.reduce((sum, pr) => sum + BONUS_COINS[this.bonus[pr.id].good], 0);
            flipped.forEach(pr => { this.bonus[pr.id].active = true; });
            p.money += money;
            this.emit({ type: 'cash', seat, money });
            this.log(`${p.name}が州のボーナスのお金${money}セステルティウスを受け取りました`);
            return false;
        }
        const bonus = this.bonus[province];
        const magnus = this.magnus === seat;
        const count = magnus ? 2 : 1;
        const got = [];
        for (let i = 0; i < count; i++) if (this.gainGood(seat, bonus.good)) got.push(bonus.good);
        bonus.active = false;
        // 州の家すべてが、持ち主に品を出す
        const produced = {};
        CITIES.filter(c => c.province === province).forEach(c => {
            this.houses[c.id].forEach(owner => {
                if (this.gainGood(owner, this.cityGoods[c.id])) {
                    produced[owner] = produced[owner] ?? [];
                    produced[owner].push(this.cityGoods[c.id]);
                }
            });
        });
        const prName = PROVINCES.find(pr => pr.id === province).ja;
        this.emit({ type: 'produce', seat, province, bonus: got, produced });
        this.log(`${p.name}が${prName}で生産しました${magnus ? '（プラエフェクトゥス・マグヌスでボーナス2倍）' : ''}`);
        if (magnus) {
            // 使ったら右の人（手番の逆回り）へ渡す
            this.magnus = (seat - 1 + this.players.length) % this.players.length;
            this.log(`プラエフェクトゥス・マグヌスが${this.players[this.magnus].name}に移りました`);
        }
        return false;
    }

    // ---- 商人 ----

    checkMercator(seat, { trades = [] }, type) {
        if (!Array.isArray(trades) || trades.length > 2) return '売り買いできるのは2種類までです';
        const goods = trades.map(t => t?.good);
        if (!goods.every(isGood) || new Set(goods).size !== goods.length) return '品を選んでください';
        if (!trades.every(t => Number.isInteger(t.amount) && t.amount !== 0)) return '数が正しくありません';
        const p = this.players[seat];
        let money = p.money + (CARD_TYPES[type].money ?? MERCATOR_MONEY);
        let used = this.storeUsed(p);
        // 売るのを先に、買うのをあとに（売ったお金で買える）
        const sells = trades.filter(t => t.amount < 0);
        const buys = trades.filter(t => t.amount > 0);
        for (const t of sells) {
            if (p.goods[t.good] < -t.amount) return 'その品は足りません';
            money += PRICE[t.good] * -t.amount;
            used += t.amount;
        }
        for (const t of buys) {
            money -= PRICE[t.good] * t.amount;
            used += t.amount;
        }
        if (money < 0) return 'お金が足りません';
        if (used > STORE_SIZE) return '倉庫に入りきりません';
        return null;
    }

    runMercator(seat, { trades = [] }, type) {
        const p = this.players[seat];
        const income = CARD_TYPES[type].money ?? MERCATOR_MONEY;
        p.money += income;
        const parts = [];
        [...trades].sort((x, y) => x.amount - y.amount).forEach(t => {
            p.goods[t.good] += t.amount;
            p.money -= PRICE[t.good] * t.amount;
            parts.push(`${t.amount > 0 ? '買い' : '売り'}：${GOOD_NAMES[t.good]}${Math.abs(t.amount)}`);
        });
        this.emit({ type: 'trade', seat, income, trades: structuredClone(trades) });
        this.log(`${p.name}が${income}セステルティウスを受け取りました${parts.length ? `（${parts.join('・')}）` : ''}`);
        return false;
    }

    // ---- 元老院議員・執政官 ----

    // 市場の slot のカードを買う費用 { goods, wild }（goods は決まった品、wild は好きな品の数）
    // 元老院議員は置き場所の追加の費用も払う。執政官はカードの費用だけ
    marketCost(slot, withSurcharge) {
        const type = CARD_TYPES[this.cards[this.display[slot]].type];
        const goods = { ...type.cost };
        let wild = 0;
        if (withSurcharge) {
            DISPLAY_SURCHARGE[slot].forEach(g => {
                if (g === 'any') wild++;
                else goods[g] = (goods[g] ?? 0) + 1;
            });
        }
        return { goods, wild };
    }

    checkBuy(seat, { buys = [] }, type) {
        const max = CARD_TYPES[type].kind === 'senator' ? 2 : 1;
        if (!Array.isArray(buys) || buys.length > max) return `買えるのは${max}枚までです`;
        const slots = buys.map(b => b?.slot);
        if (!slots.every(s => Number.isInteger(s) && this.display[s] !== null && this.display[s] !== undefined)) return 'カードを選んでください';
        if (new Set(slots).size !== slots.length) return '同じカードは2回買えません';
        const p = this.players[seat];
        const left = { ...p.goods };
        for (const b of buys) {
            const { goods, wild } = this.marketCost(b.slot, CARD_TYPES[type].kind === 'senator');
            const paid = Array.isArray(b.wild) ? b.wild : [];
            if (paid.length !== wild || !paid.every(isGood)) return '好きな品の払い方を選んでください';
            const need = { ...goods };
            paid.forEach(g => { need[g] = (need[g] ?? 0) + 1; });
            for (const [g, n] of Object.entries(need)) {
                left[g] -= n;
                if (left[g] < 0) return '品が足りません';
            }
        }
        return null;
    }

    runBuy(seat, { buys = [] }, type) {
        const p = this.players[seat];
        const surcharge = CARD_TYPES[type].kind === 'senator';
        buys.forEach(b => {
            const { goods } = this.marketCost(b.slot, surcharge);
            Object.entries(goods).forEach(([g, n]) => { p.goods[g] -= n; });
            b.wild.forEach(g => { p.goods[g] -= 1; });
            const card = this.display[b.slot];
            this.display[b.slot] = null;
            p.hand.push(card);
            this.boughtThisTurn = true;
            this.emit({ type: 'buy', seat, slot: b.slot, card });
            this.log(`${p.name}が${CARD_TYPES[this.cards[card].type].name}を買いました`);
        });
        return false;
    }

    // ---- 植民者 ----

    // 植民者を置ける都市：ローマと、自分の家がある都市
    colonistCities(seat) {
        return [ROME, ...CITIES.filter(c => this.houses[c.id].includes(seat)).map(c => c.id)];
    }

    checkColonist(seat, { place, cash }) {
        if (cash === true) return place === undefined ? null : '操作が正しくありません';
        if (!Array.isArray(place) || place.length === 0) return '植民者を置く都市を選んでください';
        const p = this.players[seat];
        const cities = this.colonistCities(seat);
        const need = { land: 0, sea: 0 };
        for (const item of place) {
            if (!item || !cities.includes(item.city)) return 'ローマか、自分の家がある都市に置けます';
            if (item.kind !== 'land' && item.kind !== 'sea') return '植民者の種類が正しくありません';
            need[item.kind]++;
        }
        if (need.land > p.store.land || need.sea > p.store.sea) return '倉庫の植民者が足りません';
        if (p.goods.food < place.length || p.goods.tool < place.length) return '植民者1人に、食料1と道具1が要ります';
        return null;
    }

    runColonist(seat, { place, cash }) {
        const p = this.players[seat];
        if (cash === true) {
            const money = COLONIST_MONEY_BASE + this.colonists.filter(c => c.owner === seat && this.onBoard(c)).length;
            p.money += money;
            this.emit({ type: 'colonistCash', seat, money });
            this.log(`${p.name}が${money}セステルティウスを受け取りました`);
            return false;
        }
        place.forEach(({ city, kind }) => this.placeColonist(seat, city, kind, true));
        return false;
    }

    // 倉庫の植民者を都市に置く（pay：食料1と道具1を払う）
    placeColonist(seat, city, kind, pay) {
        const p = this.players[seat];
        if (pay) {
            p.goods.food -= 1;
            p.goods.tool -= 1;
        }
        p.store[kind] -= 1;
        const colonist = this.colonists.find(c => c.owner === seat && c.kind === kind && !this.onBoard(c));
        if (colonist) {
            colonist.city = city;
            colonist.road = null;
        } else {
            this.colonists.push({ id: this.colonists.length, owner: seat, kind, city, road: null });
        }
        this.emit({ type: 'colonist', seat, city, kind });
        this.log(`${p.name}が${CITY[city].ja}に${kind === 'land' ? '陸' : '海'}の植民者を置きました`);
    }

    // ---- 職人 ----

    runCraftsman(seat, command, type) {
        const good = CARD_TYPES[type].good;
        const got = [];
        CITIES.forEach(c => {
            if (this.cityGoods[c.id] === good && this.houses[c.id].includes(seat) && this.gainGood(seat, good)) got.push(good);
        });
        this.emit({ type: 'craft', seat, good, count: got.length });
        this.log(`${this.players[seat].name}が${GOOD_NAMES[good]}を${got.length}つ生産しました`);
        return false;
    }

    // ---- 倉庫 ----

    storeUsed(player) {
        return GOODS.reduce((sum, g) => sum + player.goods[g], 0) + player.store.land + player.store.sea;
    }

    // 倉庫に空きがあれば品を1つ入れる（空きがなければ入らない）
    gainGood(seat, good) {
        const p = this.players[seat];
        if (this.storeUsed(p) >= STORE_SIZE) return false;
        p.goods[good] += 1;
        return true;
    }

    // ---- 手番の終わり ----

    triggerEnd(seat, reason) {
        if (this.concordiaBy !== null) return;
        this.concordiaBy = seat;
        this.players[seat].concordia = true;
        this.finalTurns = this.players.map(p => p.id).filter(id => id !== seat);
        this.emit({ type: 'concordia', seat });
        this.log(`${this.players[seat].name}が${reason}。コンコルディアのカード（${CONCORDIA_POINTS}点）を受け取り、ほかの人が最後の手番を行います`);
    }

    endTurn() {
        const seat = this.current;
        // 市場を左に詰めて、山札から補充する
        if (this.boughtThisTurn) {
            const rest = this.display.filter(id => id !== null);
            while (rest.length < DISPLAY_SURCHARGE.length && this.deck.length) rest.push(this.deck.shift());
            this.display = [...rest, ...Array(DISPLAY_SURCHARGE.length - rest.length).fill(null)];
            this.boughtThisTurn = false;
            if (this.display.every(id => id === null) && this.concordiaBy === null) this.triggerEnd(seat, '市場の最後のカードを買いました');
        }
        if (this.finalTurns !== null && seat !== this.concordiaBy) {
            this.finalTurns = this.finalTurns.filter(id => id !== seat);
        }
        if (this.finalTurns !== null && this.finalTurns.length === 0) {
            this.finish();
            return;
        }
        this.current = (seat + 1) % this.players.length;
        if (this.current === 0) this.turn++;
    }

    finish() {
        this.phase = 'end';
        this.results = this.players.map(p => ({ id: p.id, ...scorePlayer(this, p.id) }));
        // 同点なら、プラエフェクトゥス・マグヌスの持ち主か、そのあと最初に受け取る人（右回り）が勝ち
        const order = this.players.map((_, i) => (this.magnus - i + this.players.length) % this.players.length);
        const best = Math.max(...this.results.map(r => r.total));
        const tied = this.results.filter(r => r.total === best).map(r => r.id);
        this.winners = [order.find(id => tied.includes(id))];
        this.emit({ type: 'end' });
        this.log(`ゲーム終了。${this.players[this.winners[0]].name}の勝ち`);
    }

    // ---- 記録 ----

    emit(event, visibleTo = null) {
        this.events.push({ seq: ++this.eventSeq, ...event, ...(visibleTo ? { visibleTo } : {}) });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text) {
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    // 手を試すための写し（記録・ログ・出来事は持たない。準備のあとは乱数を使わないので、写しても同じように進む）
    clone() {
        const { commands, logs, events, ...rest } = this;
        const copy = Object.assign(Object.create(Game.prototype), structuredClone(rest));
        copy.commands = [];
        copy.logs = [];
        copy.events = [];
        return copy;
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}
