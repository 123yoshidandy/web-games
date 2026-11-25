/**
 * 電力会社（基本ゲーム、2〜6人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（地域・山の並び・最初の手番はシードから決まる）
 *
 * 1巡の流れ：1. 手番の順（都市の多い順、同数は大きい発電所の順）→ 2. 発電所の競り → 3. 資源を買う（逆順）
 *           → 4. 都市を建てる（逆順）→ 5. 官僚（送電して収入、資源の補充、発電所の市場の更新）
 * 終わり：建設のあとで、だれかの都市が終わりの数に届いたら。送電できる都市の多い人の勝ち（同数はお金、さらに同数は都市の数）
 *
 * ルールブックで読み方が分かれる点や、画面のために形を決めた点（README にも書く）
 * - 官僚では、だれもが「送れるだけ送る」（使う資源の少ない組み合わせを自動で選ぶ）
 * - 発電所を手放して持ちきれなくなった資源は、石炭と石油の多い方から箱に戻す
 * - 競りで値を上げる順は、手番の順で競りを始めた人の次から回る
 */

import { createRandom, shuffle } from './random.js';
import { PLANT, PLANTS, STEP3, RESOURCES, RESOURCE_NAMES, START_MARKET, RESUPPLY, TOKENS, SETUP, START_MONEY, HOUSES, MIN_PLAYERS, MAX_PLAYERS, payment } from './data.js';
import { MAPS } from './maps.js';
import { regionNeighbors, citiesOf, buildCost, buyPrice, canStore, trimResources, bestPower, actualMarket, supplyLeft } from './rules.js';

export { MIN_PLAYERS, MAX_PLAYERS };
const MAX_LOGS = 500;
const MAX_EVENTS = 60;

export const COMMAND_FIELDS = {
    choose: ['plant', 'bid'],
    skip: [],
    bid: ['amount'],
    pass: [],
    discard: ['plant'],
    buy: ['coal', 'oil', 'garbage', 'uranium'],
    build: ['city'],
    done: []
};

const isInt = (v) => Number.isInteger(v);
const cityName = (mapId, id) => MAPS[mapId].cities.find(c => c.id === id)?.name ?? id;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, map: 'germany' | 'usa', regions? }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('人数は2〜6人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const mapId = MAPS[options.map] ? options.map : 'germany';
        this.random = createRandom(seed);
        this.setup = SETUP[n];
        // 乱数の使い方を毎回そろえるため、指定があっても先に地域を引いてから差し替える
        const regions = this.pickRegions(mapId, this.setup.regions);
        this.options = { seed, map: mapId, regions: options.regions ?? regions };
        this.mapId = mapId;
        this.regions = [...this.options.regions];
        // 山：3〜10 が最初の市場。13 を上に、段階3のカードを底に。人数によって何枚か抜く
        const rest = shuffle(PLANTS.map(p => p.num).filter(num => num > 10 && num !== 13), this.random);
        this.removed = rest.splice(0, this.setup.remove);
        this.deck = [13, ...rest, STEP3];
        this.market = [3, 4, 5, 6, 7, 8, 9, 10];
        this.resources = { ...START_MARKET };
        this.houses = {};
        this.step = 1;
        this.step3Pending = null;     // 段階3のカードを引いたフェーズ（auction・build）
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            money: START_MONEY, plants: [], res: { coal: 0, oil: 0, garbage: 0, uranium: 0 }, lastPowered: null, lastIncome: null
        }));
        this.order = shuffle(this.players.map(p => p.id), this.random);
        this.round = 0;
        this.phase = 'auction';
        this.auction = null;
        this.turn = 0;                // 資源と建設で、逆順の何人目か
        this.final = null;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`地図：${MAPS[mapId].name}。手番の順はくじで決めた`);
        this.startRound();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`記録の${i + 1}手目を再現できません：${game.lastError}`);
        });
        return game;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: structuredClone(this.options),
            commands: structuredClone(this.commands)
        };
    }

    // つながった地域を k 個選ぶ（最初の地域を選び、隣の地域を足していく）
    pickRegions(mapId, k) {
        const neighbors = regionNeighbors(mapId);
        const all = MAPS[mapId].regions;
        const chosen = [all[Math.floor(this.random() * all.length)]];
        while (chosen.length < k) {
            const options = all.filter(r => !chosen.includes(r) && chosen.some(c => neighbors[c].has(r)));
            chosen.push(options[Math.floor(this.random() * options.length)]);
        }
        return chosen;
    }

    isOver() {
        return this.phase === 'end';
    }

    cities(seat) {
        return citiesOf(this, seat).length;
    }

    // 操作を待っている人
    actors() {
        const a = this.auction;
        switch (this.phase) {
            case 'auction':
                if (a.discard !== null) return [a.discard];
                if (a.current) return [a.current.turn];
                return a.chooser === null ? [] : [a.chooser];
            case 'resources':
            case 'build': return [this.reverse()[this.turn]];
            default: return [];
        }
    }

    reverse() {
        return [...this.order].reverse();
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        const error = this.check(playerId, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.events = [];
        const clean = Object.fromEntries(COMMAND_FIELDS[command.type].filter(k => command[k] !== undefined).map(k => [k, command[k]]));
        this.commands.push({ playerId, command: { type: command.type, ...clean } });
        this.execute(playerId, command);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
        return true;
    }

    // 状態を変えずに、操作が通るかを確かめる。通らなければ理由を返す
    check(seat, command) {
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return '知らない操作です';
        if (this.phase === 'end') return 'ゲームは終わっています';
        if (!this.actors().includes(seat)) return '今はあなたの番ではありません';
        const player = this.players[seat];
        const a = this.auction;
        switch (command.type) {
            case 'choose':
                if (this.phase !== 'auction' || a.current || a.discard !== null) return '今は発電所を選べません';
                if (!actualMarket(this).includes(command.plant)) return 'その発電所は今は競りにかけられません';
                if (!isInt(command.bid) || command.bid < command.plant) return `値は${command.plant}以上で`;
                if (command.bid > player.money) return 'お金が足りません';
                return null;
            case 'skip':
                if (this.phase !== 'auction' || a.current || a.discard !== null) return '今は見送れません';
                if (this.round === 1) return '最初の巡は、全員が発電所を買います';
                return null;
            case 'bid':
                if (this.phase !== 'auction' || !a.current) return '今は値を付けられません';
                if (!isInt(command.amount) || command.amount <= a.current.high) return `${a.current.high}より高い値を付けてください`;
                if (command.amount > player.money) return 'お金が足りません';
                return null;
            case 'pass':
                if (this.phase !== 'auction' || !a.current) return '今は降りられません';
                return null;
            case 'discard':
                if (this.phase !== 'auction' || a.discard !== seat) return '今は手放せません';
                if (!player.plants.includes(command.plant) || command.plant === a.justBought) return 'その発電所は手放せません';
                return null;
            case 'buy': {
                if (this.phase !== 'resources') return '今は資源を買えません';
                const want = {};
                for (const t of RESOURCES) {
                    const k = command[t] ?? 0;
                    if (!isInt(k) || k < 0) return '数は0以上の整数で';
                    if (k > this.resources[t]) return `${RESOURCE_NAMES[t]}が足りません`;
                    want[t] = player.res[t] + k;
                }
                if (!canStore(player.plants, want)) return '発電所に入りきりません';
                const cost = RESOURCES.reduce((s, t) => s + buyPrice(t, this.resources[t], command[t] ?? 0), 0);
                if (cost > player.money) return 'お金が足りません';
                return null;
            }
            case 'build': {
                if (this.phase !== 'build') return '今は建てられません';
                if (this.cities(seat) >= HOUSES) return '家がもうありません';
                const cost = typeof command.city === 'string' ? buildCost(this, seat, command.city) : null;
                if (cost === null) return 'そこには建てられません';
                if (cost > player.money) return 'お金が足りません';
                return null;
            }
            case 'done':
                if (this.phase !== 'resources' && this.phase !== 'build') return '今は終えられません';
                return null;
            default:
                return '知らない操作です';
        }
    }

    execute(seat, command) {
        const player = this.players[seat];
        switch (command.type) {
            case 'choose': this.openAuction(seat, command.plant, command.bid); return;
            case 'skip':
                this.auction.skipped.push(seat);
                this.log(`${player.name}は発電所を見送った`);
                this.nextChooser();
                return;
            case 'bid':
                this.auction.current.high = command.amount;
                this.auction.current.highBidder = seat;
                this.log(`${player.name}：${command.amount}`);
                this.advanceBid(seat);
                return;
            case 'pass':
                this.auction.current.passed.push(seat);
                this.log(`${player.name}は降りた`);
                this.advanceBid(seat);
                return;
            case 'discard':
                player.plants = player.plants.filter(n => n !== command.plant);
                player.res = trimResources(player.plants, player.res);
                this.log(`${player.name}が発電所${command.plant}を手放した`);
                this.auction.discard = null;
                this.afterPurchase();
                return;
            case 'buy': {
                const parts = [];
                let cost = 0;
                RESOURCES.forEach(t => {
                    const k = command[t] ?? 0;
                    if (!k) return;
                    cost += buyPrice(t, this.resources[t], k);
                    this.resources[t] -= k;
                    player.res[t] += k;
                    parts.push(`${RESOURCE_NAMES[t]}${k}`);
                });
                player.money -= cost;
                this.log(parts.length ? `${player.name}が${parts.join('・')}を${cost}で買った` : `${player.name}は資源を買わない`);
                this.emit({ type: 'buy', seat, cost });
                this.nextTurn();
                return;
            }
            case 'build': {
                const cost = buildCost(this, seat, command.city);
                (this.houses[command.city] ??= []).push(seat);
                player.money -= cost;
                this.log(`${player.name}が${cityName(this.mapId, command.city)}に建てた（${cost}）`);
                this.emit({ type: 'build', seat, city: command.city, cost });
                this.removeSmallPlants();
                return;
            }
            case 'done':
                if (this.phase === 'build') this.log(`${player.name}は建て終えた`);
                this.nextTurn();
                return;
        }
    }

    // ---- 1巡の流れ ----

    startRound() {
        this.round++;
        if (this.round > 1) this.sortOrder();
        this.log(`第${this.round}巡（段階${this.step}）。手番の順：${this.order.map(s => this.players[s].name).join('→')}`);
        this.phase = 'auction';
        this.auction = { bought: [], skipped: [], current: null, discard: null, chooser: null, justBought: null };
        this.nextChooser();
    }

    // 都市の多い順、同数なら大きい発電所の順
    sortOrder() {
        const top = (p) => Math.max(0, ...p.plants);
        this.order = [...this.order].sort((a, b) => this.cities(b) - this.cities(a) || top(this.players[b]) - top(this.players[a]));
    }

    // 手番の順で、まだ買っても見送ってもいない最初の人が発電所を選ぶ
    nextChooser() {
        const a = this.auction;
        a.chooser = this.order.find(s => !a.bought.includes(s) && !a.skipped.includes(s)) ?? null;
        if (a.chooser === null) this.endAuctionPhase();
    }

    openAuction(seat, plant, bid) {
        const a = this.auction;
        const eligible = (s) => !a.bought.includes(s) && !a.skipped.includes(s);
        const i = this.order.indexOf(seat);
        const ring = [...this.order.slice(i), ...this.order.slice(0, i)].filter(eligible);
        a.current = { plant, high: bid, highBidder: seat, ring, passed: [], turn: seat };
        this.log(`${this.players[seat].name}が発電所${plant}を${bid}で競りにかけた`);
        this.advanceBid(seat);
    }

    // 次に値を付ける人へ。いちばん高い人のほかが全員降りたら落札
    advanceBid(seat) {
        const c = this.auction.current;
        const active = c.ring.filter(s => !c.passed.includes(s));
        if (active.length === 1 && active[0] === c.highBidder) {
            this.win(c.highBidder, c.plant, c.high);
            return;
        }
        const n = c.ring.length;
        let i = c.ring.indexOf(seat);
        for (let k = 0; k < n; k++) {
            i = (i + 1) % n;
            const s = c.ring[i];
            if (!c.passed.includes(s) && s !== c.highBidder) {
                c.turn = s;
                return;
            }
        }
    }

    win(seat, plant, price) {
        const a = this.auction;
        const player = this.players[seat];
        player.money -= price;
        player.plants.push(plant);
        player.plants.sort((x, y) => x - y);
        this.market = this.market.filter(n => n !== plant);
        a.bought.push(seat);
        a.justBought = plant;
        a.lastChooser = a.current.ring[0];
        a.current = null;
        this.log(`${player.name}が発電所${plant}を${price}で買った`);
        this.emit({ type: 'won', seat, plant, price });
        this.draw();
        if (player.plants.length > this.setup.maxPlants) {
            a.discard = seat;
            return;
        }
        this.afterPurchase();
    }

    // 買った人が選んだ人なら次の人へ。ほかの人が買ったら、選んだ人がもう一度選ぶ
    afterPurchase() {
        const a = this.auction;
        a.justBought = null;
        if (a.bought.includes(a.lastChooser) || a.skipped.includes(a.lastChooser)) this.nextChooser();
        else a.chooser = a.lastChooser;
    }

    endAuctionPhase() {
        if (this.round > 1 && this.auction.bought.length === 0) {
            const low = actualMarket(this)[0];
            if (low !== undefined) {
                this.market = this.market.filter(n => n !== low);
                this.log(`だれも買わなかったので、発電所${low}を除いた`);
                this.draw();
            }
        }
        if (this.step3Pending === 'auction') {
            // 段階3のカードと、いちばん小さい発電所を除く（補充しない）。段階3は資源のフェーズから
            this.market = this.market.filter(n => n !== STEP3);
            this.market.shift();
            this.step3Pending = null;
            this.enterStep3();
        }
        if (this.round === 1) this.sortOrder();
        this.auction = null;
        this.phase = 'resources';
        this.turn = 0;
        this.log('資源を買う（手番の逆順）');
    }

    nextTurn() {
        this.turn++;
        if (this.turn < this.order.length) return;
        if (this.phase === 'resources') {
            this.phase = 'build';
            this.turn = 0;
            this.log('都市を建てる（手番の逆順）');
            return;
        }
        this.endBuildPhase();
    }

    endBuildPhase() {
        const most = Math.max(...this.players.map(p => this.cities(p.id)));
        if (most >= this.setup.end) {
            this.finish();
            return;
        }
        if (this.step === 1 && most >= this.setup.step2) {
            this.step = 2;
            this.log('段階2になった。都市に2人まで建てられる');
            this.emit({ type: 'step', step: 2 });
            const low = actualMarket(this)[0];
            if (low !== undefined) {
                this.market = this.market.filter(n => n !== low);
                this.draw();
            }
        }
        if (this.step3Pending === 'build') {
            this.step3Pending = null;
            this.enterStep3();
        }
        this.bureaucracy();
    }

    // 官僚：送電して収入、資源の補充、発電所の市場の更新
    bureaucracy() {
        this.phase = 'bureaucracy';
        this.order.forEach(seat => {
            const p = this.players[seat];
            const result = bestPower(p.plants, p.res, this.cities(seat));
            RESOURCES.forEach(t => { p.res[t] -= result.use[t]; });
            const income = payment(result.powered);
            p.money += income;
            p.lastPowered = result.powered;
            p.lastIncome = income;
            this.log(`${p.name}が${result.powered}都市に送電して${income}`);
        });
        this.emit({ type: 'income', incomes: this.players.map(p => p.lastIncome), powered: this.players.map(p => p.lastPowered) });
        const stepIndex = Math.min(this.step, 3) - 1;
        RESOURCES.forEach(t => {
            const want = RESUPPLY[t][this.players.length][stepIndex];
            const add = Math.min(want, supplyLeft(this, t), TOKENS[t] - this.resources[t]);
            this.resources[t] += add;
        });
        if (this.step >= 3) {
            const low = this.market.shift();
            if (low !== undefined) this.log(`発電所${low}を除いた`);
            this.draw();
        } else {
            const high = this.market.pop();
            if (high !== undefined) {
                // 大きい発電所は山の底（段階3のカードの下）に戻す
                this.deck.push(high);
                this.draw();
            }
        }
        if (this.step3Pending === 'bureaucracy') {
            this.step3Pending = null;
            this.enterStep3();
        }
        this.startRound();
    }

    enterStep3() {
        this.step = 3;
        this.log('段階3になった。都市に3人まで建てられ、発電所はすべて競りにかけられる');
        this.emit({ type: 'step', step: 3 });
    }

    // 山から1枚引いて市場に入れる。段階3のカードなら、引いたフェーズに応じて扱う
    draw() {
        const card = this.deck.shift();
        if (card === undefined) return;
        if (card === STEP3) {
            this.deck = shuffle(this.deck, this.random);
            if (this.phase === 'auction') {
                // いちばん大きい発電所として市場の端に置き、競りが終わったら除く
                this.market.push(STEP3);
                this.step3Pending = 'auction';
            } else {
                // 建設か官僚で出たら、段階3のカードといちばん小さい発電所を除く（補充しない）
                this.market.shift();
                this.step3Pending = this.phase === 'build' ? 'build' : 'bureaucracy';
            }
            this.log('段階3のカードが出た');
            return;
        }
        this.market.push(card);
        this.market.sort((x, y) => x - y);
        this.removeSmallPlants();
    }

    // 競りにかけられる発電所に、だれかの都市の数以下の番号があれば除いて引き直す
    removeSmallPlants() {
        const most = Math.max(0, ...this.players.map(p => this.cities(p.id)));
        const small = actualMarket(this).find(n => n <= most);
        if (small === undefined) return;
        this.market = this.market.filter(n => n !== small);
        this.log(`発電所${small}は都市の数より小さいので除いた`);
        this.draw();
    }

    finish() {
        this.phase = 'end';
        this.final = this.players.map(p => {
            const cities = this.cities(p.id);
            return { powered: bestPower(p.plants, p.res, cities).powered, money: p.money, cities };
        });
        const key = (f) => [f.powered, f.money, f.cities];
        const better = (x, y) => { for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
        let best = key(this.final[0]);
        this.final.forEach(f => { if (better(key(f), best)) best = key(f); });
        this.winners = this.players.filter((_, i) => key(this.final[i]).every((v, k) => v === best[k])).map(p => p.id);
        this.log(`終わり。${this.winners.map(i => this.players[i].name).join('・')}の勝ち（${best[0]}都市に送電）`);
        this.emit({ type: 'end' });
    }

    emit(event) {
        this.events.push({ ...event, seq: ++this.eventSeq });
    }

    log(text) {
        this.logs.push(text);
    }
}
