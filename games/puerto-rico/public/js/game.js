/**
 * プエルトリコ（基本ゲーム、3〜5 人）のルール。DOM に依存しない
 *
 * 進み方：ラウンドごとに、総督から順に 1 人ずつ役割を選ぶ。選んだ役割は、選んだ人から順に全員が行う（選んだ人には特権）。
 *   全員が選んだら、選ばれなかった役割に 1 ドゥブロンずつ載せ、総督が左へ移る。
 *   終わりの条件（入植者で船を満たせない・勝利点チップが尽きた・都市の 12 マスが埋まった）が起きたら、そのラウンドの終わりに終わる
 * 判断は 1 度に 1 人だけ（decision）。操作の入口は applyCommand(seat, command) だけ。断る操作は状態を変えない
 *
 * 操作（command.type）
 *   role { role: 役割の番号 }
 *   hacienda {}                                アシエンダで山から 1 枚
 *   settle { take: 表の農園の番号 | 'quarry' | null }
 *   mayor { island: [入植者がいるか], city: [建物ごとの入植者の数] }   残りはサンフアン
 *   build { building: 建物 | null }
 *   privilege { good: 品 | null }              監督の特権（1 つ多く）
 *   sell { good: 品 | null }
 *   ship { good, ship: 船の番号 | 'wharf' } / ship { pass: true }（積める船がないとき）
 *   store { warehouse: [品], single: 品 | null }   船長のあと、とっておく品
 */

import {
    GOODS, GOOD_PRICE, GOOD_SUPPLY, PLANTATIONS, QUARRIES, ISLAND_SPACES, CITY_SPACES, SETUP,
    BUILDINGS, buildingOf, FACTORY_BONUS, residencePoints
} from './data.js';
import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;

export default class Game {
    // players: [{ name, isCPU }] / options: { seed }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`${MIN_PLAYERS}〜${MAX_PLAYERS}人で遊びます`);
        const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
        this.options = { ...options, seed };
        this.random = createRandom(seed);
        const setup = SETUP[n];
        this.players = players.map((p, id) => ({
            id, name: p.name, isCPU: !!p.isCPU, money: setup.money, chips: 0,
            island: [], city: [], sanJuan: 0, goods: Object.fromEntries(GOODS.map(g => [g, 0]))
        }));
        this.colonists = setup.colonists;
        this.shipColonists = setup.ship;
        this.chips = setup.chips;
        this.supply = { ...GOOD_SUPPLY };
        this.quarries = QUARRIES;
        this.buildings = Object.fromEntries(BUILDINGS.map(x => [x.key, x.count]));
        this.ships = setup.ships.map(size => ({ size, good: null, count: 0 }));
        this.tradingHouse = [];
        this.roles = setup.roles.map((key, id) => ({ id, key, money: 0, taken: null }));
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.winner = null;
        this.scores = null;
        this.endTriggered = null;

        // 総督は無作為。最初の農園は総督から順に配る
        this.governor = Math.floor(this.random() * n);
        const pool = { ...PLANTATIONS };
        setup.start.forEach((type, i) => {
            const seat = (this.governor + i) % n;
            this.players[seat].island.push({ type, occupied: false });
            pool[type]--;
        });
        this.deck = shuffle(Object.entries(pool).flatMap(([type, k]) => Array(k).fill(type)), this.random);
        this.discards = [];
        this.faceUp = [];
        this.refillPlantations();
        this.round = 1;
        this.picks = 0;
        this.decision = { seat: this.governor, kind: 'role' };
        this.phase = 'role';
        this.emit({ type: 'round', governor: this.governor });
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    get n() {
        return this.players.length;
    }

    emit(event) {
        this.eventSeq++;
        this.events.push({ seq: this.eventSeq, round: this.round, ...event });
    }

    isOver() {
        return this.phase === 'end';
    }

    // 席の並び（start から時計回り）
    order(start) {
        return Array.from({ length: this.n }, (_, i) => (start + i) % this.n);
    }

    // ---------- 調べる ----------

    occupied(seat, key) {
        return this.players[seat].city.some(c => c.key === key && c.colonists > 0);
    }

    owns(seat, key) {
        return this.players[seat].city.some(c => c.key === key);
    }

    citySpaces(seat) {
        return this.players[seat].city.reduce((s, c) => s + buildingOf(c.key).size, 0);
    }

    occupiedQuarries(seat) {
        return this.players[seat].island.filter(t => t.type === 'quarry' && t.occupied).length;
    }

    totalColonists(seat) {
        const p = this.players[seat];
        return p.sanJuan + p.island.filter(t => t.occupied).length + p.city.reduce((s, c) => s + c.colonists, 0);
    }

    production(seat, good) {
        const p = this.players[seat];
        const fields = p.island.filter(t => t.type === good && t.occupied).length;
        if (good === 'corn') return fields;
        const workers = p.city.filter(c => buildingOf(c.key).good === good).reduce((s, c) => s + c.colonists, 0);
        return Math.min(fields, workers);
    }

    buildCost(seat, key) {
        const x = buildingOf(key);
        const privilege = this.roleSeat === seat && this.roleKey === 'builder' ? 1 : 0;
        return Math.max(0, x.cost - privilege - Math.min(this.occupiedQuarries(seat), x.column));
    }

    // 建てられる建物（お金・同じ建物・都市のマス）
    buildable(seat) {
        const p = this.players[seat];
        return BUILDINGS.filter(x => this.buildings[x.key] > 0 && !this.owns(seat, x.key)
            && this.citySpaces(seat) + x.size <= CITY_SPACES && this.buildCost(seat, x.key) <= p.money).map(x => x.key);
    }

    sellPrice(seat, good) {
        let price = GOOD_PRICE[good];
        if (this.roleSeat === seat) price += 1;
        if (this.occupied(seat, 'smallMarket')) price += 1;
        if (this.occupied(seat, 'largeMarket')) price += 2;
        return price;
    }

    sellable(seat) {
        const p = this.players[seat];
        if (this.tradingHouse.length >= 4) return [];
        return GOODS.filter(g => p.goods[g] > 0 && (!this.tradingHouse.includes(g) || this.occupied(seat, 'office')));
    }

    // 船に積める組み合わせ。品は、すでに積まれている船があればその船だけ。空の船には、ほかの船にない品だけ
    loads(seat) {
        const p = this.players[seat];
        const list = [];
        for (const good of GOODS) {
            if (!p.goods[good]) continue;
            const carrying = this.ships.findIndex(s => s.good === good);
            if (carrying >= 0) {
                if (this.ships[carrying].count < this.ships[carrying].size) list.push({ good, ship: carrying });
                continue;
            }
            this.ships.forEach((s, i) => { if (s.good === null) list.push({ good, ship: i }); });
        }
        return list;
    }

    wharfLoads(seat) {
        if (!this.occupied(seat, 'wharf') || this.captain?.wharfUsed.has(seat)) return [];
        return GOODS.filter(g => this.players[seat].goods[g] > 0).map(good => ({ good, ship: 'wharf' }));
    }

    // ---------- 操作 ----------

    applyCommand(seat, command) {
        this.lastError = null;
        const error = this.check(seat, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.commands.push({ seat, command: structuredClone(command) });
        this.execute(seat, command);
        return true;
    }

    check(seat, command) {
        if (this.isOver()) return 'ゲームは終わっています';
        if (!command || typeof command !== 'object') return '操作が正しくありません';
        const d = this.decision;
        if (!d || d.seat !== seat) return 'いまはあなたの番ではありません';
        const kind = command.type === 'hacienda' ? 'settle' : command.type;
        if (kind !== d.kind) return 'いまはその操作はできません';
        const p = this.players[seat];
        switch (command.type) {
            case 'role': {
                const role = this.roles[command.role];
                return role && role.taken === null ? null : 'その役割は選べません';
            }
            case 'hacienda':
                return d.canHacienda ? null : 'アシエンダは使えません';
            case 'settle':
                if (command.take === null) return null;
                if (command.take === 'quarry') return d.canQuarry ? null : '石切り場は取れません';
                return Number.isInteger(command.take) && command.take >= 0 && command.take < this.faceUp.length && p.island.length < ISLAND_SPACES ? null : 'その農園は取れません';
            case 'mayor':
                return this.checkMayor(seat, command);
            case 'build':
                return command.building === null || this.buildable(seat).includes(command.building) ? null : 'その建物は建てられません';
            case 'privilege':
                return command.good === null || d.goods.includes(command.good) ? null : 'その品は取れません';
            case 'sell':
                return command.good === null || this.sellable(seat).includes(command.good) ? null : 'その品は売れません';
            case 'ship': {
                if (command.pass) return d.mustShip ? '積める品は必ず積みます' : null;
                return d.options.some(o => o.good === command.good && o.ship === command.ship) ? null : 'その船には積めません';
            }
            case 'store':
                return this.checkStore(seat, command, d);
            default:
                return '操作が正しくありません';
        }
    }

    execute(seat, command) {
        switch (command.type) {
            case 'role': return this.pickRole(seat, command.role);
            case 'hacienda': return this.doHacienda(seat);
            case 'settle': return this.doSettle(seat, command.take);
            case 'mayor': return this.doMayor(seat, command);
            case 'build': return this.doBuild(seat, command.building);
            case 'privilege': return this.doPrivilege(seat, command.good);
            case 'sell': return this.doSell(seat, command.good);
            case 'ship': return this.doShip(seat, command);
            case 'store': return this.doStore(seat, command);
            default: return null;
        }
    }

    // ---------- 役割 ----------

    pickRole(seat, roleId) {
        const role = this.roles[roleId];
        role.taken = seat;
        const p = this.players[seat];
        p.money += role.money;
        this.emit({ type: 'role', seat, role: role.key, money: role.money });
        role.money = 0;
        this.roleKey = role.key;
        this.roleSeat = seat;
        this.phase = role.key;
        this.queue = this.order(seat);
        this.decision = null;
        ({
            settler: () => this.nextSettler(),
            mayor: () => this.beginMayor(),
            builder: () => this.nextBuilder(),
            craftsman: () => this.beginCraftsman(),
            trader: () => this.nextTrader(),
            captain: () => this.beginCaptain(),
            prospector: () => { p.money += 1; this.emit({ type: 'money', seat, n: 1, reason: 'prospector' }); this.endRole(); }
        })[role.key]();
    }

    endRole() {
        this.emit({ type: 'roleEnd', seat: this.roleSeat, role: this.roleKey });
        this.decision = null;
        this.roleKey = null;
        this.roleSeat = null;
        this.picks++;
        if (this.picks < this.n) {
            this.phase = 'role';
            this.decision = { seat: (this.governor + this.picks) % this.n, kind: 'role' };
            return;
        }
        this.endRound();
    }

    endRound() {
        for (const r of this.roles) {
            if (r.taken === null) r.money += 1;
            r.taken = null;
        }
        this.emit({ type: 'roundEnd' });
        if (this.endTriggered) return this.finish();
        this.governor = (this.governor + 1) % this.n;
        this.round++;
        this.picks = 0;
        this.phase = 'role';
        this.decision = { seat: this.governor, kind: 'role' };
        this.emit({ type: 'round', governor: this.governor });
    }

    trigger(reason) {
        if (this.endTriggered) return;
        this.endTriggered = reason;
        this.emit({ type: 'endTrigger', reason });
    }

    // ---------- 開拓者 ----------

    refillPlantations() {
        this.discards.push(...this.faceUp);
        this.faceUp = [];
        for (let i = 0; i < this.n + 1; i++) {
            if (!this.deck.length) {
                if (!this.discards.length) break;
                this.deck = shuffle(this.discards, this.random);
                this.discards = [];
            }
            this.faceUp.push(this.deck.pop());
        }
    }

    nextSettler() {
        while (this.queue.length) {
            const seat = this.queue[0];
            const p = this.players[seat];
            if (p.island.length >= ISLAND_SPACES) { this.queue.shift(); continue; }
            const canQuarry = this.quarries > 0 && (seat === this.roleSeat || this.occupied(seat, 'constructionHut'));
            const canHacienda = this.occupied(seat, 'hacienda') && !this.haciendaUsed && (this.deck.length + this.discards.length) > 0;
            if (!this.faceUp.length && !canQuarry && !canHacienda) { this.queue.shift(); continue; }
            this.decision = { seat, kind: 'settle', canQuarry, canHacienda };
            return;
        }
        this.refillPlantations();
        this.endRole();
    }

    doHacienda(seat) {
        if (!this.deck.length) {
            this.deck = shuffle(this.discards, this.random);
            this.discards = [];
        }
        const type = this.deck.pop();
        this.players[seat].island.push({ type, occupied: false });
        this.haciendaUsed = true;
        this.emit({ type: 'hacienda', seat, plantation: type });
        if (this.players[seat].island.length >= ISLAND_SPACES) return this.afterSettle();
        this.decision = { ...this.decision, canHacienda: false };
    }

    doSettle(seat, take) {
        const p = this.players[seat];
        if (take !== null) {
            const type = take === 'quarry' ? 'quarry' : this.faceUp.splice(take, 1)[0];
            if (take === 'quarry') this.quarries--;
            const tile = { type, occupied: false };
            if (this.occupied(seat, 'hospice') && this.colonists > 0) {
                tile.occupied = true;
                this.colonists--;
            }
            p.island.push(tile);
            this.emit({ type: 'settle', seat, plantation: type, hospice: tile.occupied });
        } else {
            this.emit({ type: 'pass', seat, role: 'settler' });
        }
        this.afterSettle();
    }

    afterSettle() {
        this.haciendaUsed = false;
        this.queue.shift();
        this.decision = null;
        this.nextSettler();
    }

    // ---------- 市長 ----------

    beginMayor() {
        const picker = this.players[this.roleSeat];
        if (this.colonists > 0) {
            picker.sanJuan++;
            this.colonists--;
        }
        const given = this.players.map(() => 0);
        this.order(this.roleSeat).forEach((s, i) => { given[s] = Math.floor(this.shipColonists / this.n) + (i < this.shipColonists % this.n ? 1 : 0); });
        given.forEach((k, s) => { this.players[s].sanJuan += k; });
        this.emit({ type: 'mayor', seat: this.roleSeat, given, privilege: true });
        this.shipColonists = 0;
        this.nextMayor();
    }

    slots(seat) {
        const p = this.players[seat];
        return p.island.length + p.city.reduce((s, c) => s + buildingOf(c.key).capacity, 0);
    }

    nextMayor() {
        while (this.queue.length) {
            const seat = this.queue[0];
            const total = this.totalColonists(seat);
            // 入植者がいない、または全部のマスを埋められるなら、選ぶことはない
            if (total === 0) { this.queue.shift(); continue; }
            if (total >= this.slots(seat)) {
                this.fillAll(seat);
                this.queue.shift();
                continue;
            }
            this.decision = { seat, kind: 'mayor', total };
            return;
        }
        this.refillShip();
        this.endRole();
    }

    fillAll(seat) {
        const p = this.players[seat];
        let total = this.totalColonists(seat);
        p.island.forEach(t => { t.occupied = true; });
        total -= p.island.length;
        p.city.forEach(c => { c.colonists = buildingOf(c.key).capacity; total -= c.colonists; });
        p.sanJuan = total;
    }

    checkMayor(seat, command) {
        const p = this.players[seat];
        const { island, city } = command;
        if (!Array.isArray(island) || island.length !== p.island.length || !island.every(v => typeof v === 'boolean')) return '島の並べ方が正しくありません';
        if (!Array.isArray(city) || city.length !== p.city.length || !city.every((v, i) => Number.isInteger(v) && v >= 0 && v <= buildingOf(p.city[i].key).capacity)) return '都市の並べ方が正しくありません';
        const placed = island.filter(Boolean).length + city.reduce((s, v) => s + v, 0);
        const total = this.totalColonists(seat);
        if (placed > total) return '入植者が足りません';
        const full = island.every(Boolean) && city.every((v, i) => v === buildingOf(p.city[i].key).capacity);
        if (placed < total && !full) return '空いているマスがあるうちは、サンフアンに残せません';
        return null;
    }

    doMayor(seat, command) {
        const p = this.players[seat];
        const total = this.totalColonists(seat);
        p.island.forEach((t, i) => { t.occupied = command.island[i]; });
        p.city.forEach((c, i) => { c.colonists = command.city[i]; });
        p.sanJuan = total - command.island.filter(Boolean).length - command.city.reduce((s, v) => s + v, 0);
        this.queue.shift();
        this.decision = null;
        this.nextMayor();
    }

    // 船に、全員の建物の空いた枠の数（少なくとも人数）だけ載せる。足りなければ、ゲームの終わり
    refillShip() {
        const empty = this.players.reduce((s, p) => s + p.city.reduce((t, c) => t + buildingOf(c.key).capacity - c.colonists, 0), 0);
        const need = Math.max(this.n, empty);
        const put = Math.min(need, this.colonists);
        this.shipColonists = put;
        this.colonists -= put;
        this.emit({ type: 'colonistShip', n: put });
        if (put < need) this.trigger('colonists');
    }

    // ---------- 建築家 ----------

    nextBuilder() {
        while (this.queue.length) {
            const seat = this.queue[0];
            if (!this.buildable(seat).length) { this.queue.shift(); continue; }
            this.decision = { seat, kind: 'build' };
            return;
        }
        this.endRole();
    }

    doBuild(seat, key) {
        const p = this.players[seat];
        if (key !== null) {
            const cost = this.buildCost(seat, key);
            p.money -= cost;
            this.buildings[key]--;
            const slot = { key, colonists: 0 };
            if (this.occupied(seat, 'university') && this.colonists > 0) {
                slot.colonists = 1;
                this.colonists--;
            }
            p.city.push(slot);
            this.emit({ type: 'build', seat, building: key, cost, university: slot.colonists > 0 });
            if (this.citySpaces(seat) >= CITY_SPACES) this.trigger('city');
        } else {
            this.emit({ type: 'pass', seat, role: 'builder' });
        }
        this.queue.shift();
        this.decision = null;
        this.nextBuilder();
    }

    // ---------- 監督 ----------

    beginCraftsman() {
        this.produced = this.players.map(() => []);
        for (const seat of this.order(this.roleSeat)) {
            const p = this.players[seat];
            const got = {};
            for (const good of GOODS) {
                const k = Math.min(this.production(seat, good), this.supply[good]);
                if (k <= 0) continue;
                p.goods[good] += k;
                this.supply[good] -= k;
                got[good] = k;
                this.produced[seat].push(good);
            }
            this.emit({ type: 'produce', seat, goods: got });
            const bonus = this.occupied(seat, 'factory') ? FACTORY_BONUS[this.produced[seat].length] : 0;
            if (bonus) {
                p.money += bonus;
                this.emit({ type: 'money', seat, n: bonus, reason: 'factory' });
            }
        }
        const options = this.produced[this.roleSeat].filter(g => this.supply[g] > 0);
        if (!options.length) return this.endRole();
        if (options.length === 1) return this.doPrivilege(this.roleSeat, options[0]);
        this.decision = { seat: this.roleSeat, kind: 'privilege', goods: options };
    }

    doPrivilege(seat, good) {
        if (good !== null) {
            this.players[seat].goods[good]++;
            this.supply[good]--;
            this.emit({ type: 'privilegeGood', seat, good });
        }
        this.endRole();
    }

    // ---------- 商人 ----------

    nextTrader() {
        while (this.queue.length) {
            const seat = this.queue[0];
            if (this.tradingHouse.length >= 4) break;
            if (!this.sellable(seat).length) { this.queue.shift(); continue; }
            this.decision = { seat, kind: 'sell' };
            return;
        }
        if (this.tradingHouse.length >= 4) {
            for (const g of this.tradingHouse) this.supply[g]++;
            this.tradingHouse = [];
            this.emit({ type: 'tradingHouseClear' });
        }
        this.endRole();
    }

    doSell(seat, good) {
        const p = this.players[seat];
        if (good !== null) {
            const price = this.sellPrice(seat, good);
            p.goods[good]--;
            p.money += price;
            this.tradingHouse.push(good);
            this.emit({ type: 'sell', seat, good, price });
        } else {
            this.emit({ type: 'pass', seat, role: 'trader' });
        }
        this.queue.shift();
        this.decision = null;
        this.nextTrader();
    }

    // ---------- 船長 ----------

    beginCaptain() {
        this.captain = { turn: this.roleSeat, idle: 0, bonusGiven: false, wharfUsed: new Set() };
        this.nextCaptain();
    }

    // 選んだ人から順に、積める人が積む。だれも積めなくなる（1 周だれも積まない）まで続ける
    nextCaptain() {
        const c = this.captain;
        while (c.idle < this.n) {
            const seat = c.turn;
            c.turn = (seat + 1) % this.n;
            const cargo = this.loads(seat);
            const wharf = this.wharfLoads(seat);
            if (!cargo.length && !wharf.length) { c.idle++; continue; }
            this.decision = { seat, kind: 'ship', options: [...cargo, ...wharf], mustShip: cargo.length > 0 };
            return;
        }
        this.endCaptain();
    }

    doShip(seat, command) {
        const c = this.captain;
        const p = this.players[seat];
        this.decision = null;
        if (command.pass) {
            c.idle++;
            this.emit({ type: 'pass', seat, role: 'captain' });
            return this.nextCaptain();
        }
        const { good } = command;
        let amount;
        if (command.ship === 'wharf') {
            amount = p.goods[good];
            this.supply[good] += amount;
            c.wharfUsed.add(seat);
        } else {
            const ship = this.ships[command.ship];
            amount = Math.min(p.goods[good], ship.size - ship.count);
            ship.good = good;
            ship.count += amount;
        }
        p.goods[good] -= amount;
        let vp = amount;
        if (this.occupied(seat, 'harbor')) vp += 1;
        if (seat === this.roleSeat && !c.bonusGiven) {
            vp += 1;
            c.bonusGiven = true;
        }
        this.emit({ type: 'ship', seat, good, n: amount, ship: command.ship, vp });
        this.gainVp(seat, vp);
        c.idle = 0;
        this.nextCaptain();
    }

    gainVp(seat, n) {
        this.players[seat].chips += n;
        this.chips -= n;
        if (this.chips <= 0) this.trigger('chips');
    }

    endCaptain() {
        // 満杯の船を空ける
        for (const s of this.ships) {
            if (s.count >= s.size) {
                this.supply[s.good] += s.count;
                s.good = null;
                s.count = 0;
            }
        }
        this.captain = null;
        this.queue = this.order(this.roleSeat);
        this.nextStore();
    }

    warehouseSlots(seat) {
        return (this.occupied(seat, 'smallWarehouse') ? 1 : 0) + (this.occupied(seat, 'largeWarehouse') ? 2 : 0);
    }

    // 品は、1 つ（1 樽）と倉庫の種類の分だけとっておける。選ぶことがなければ自動
    nextStore() {
        while (this.queue.length) {
            const seat = this.queue[0];
            const p = this.players[seat];
            const kinds = GOODS.filter(g => p.goods[g] > 0);
            const slots = this.warehouseSlots(seat);
            if (kinds.length <= slots) { this.queue.shift(); continue; }
            if (kinds.length === 1) {
                this.keepGoods(seat, [], kinds[0]);
                this.queue.shift();
                continue;
            }
            this.decision = { seat, kind: 'store', slots, kinds };
            return;
        }
        this.endRole();
    }

    checkStore(seat, command, d) {
        const p = this.players[seat];
        const wh = command.warehouse;
        if (!Array.isArray(wh) || wh.length > d.slots || new Set(wh).size !== wh.length || !wh.every(g => p.goods[g] > 0)) return '倉庫に入れる品が正しくありません';
        if (command.single !== null && (!(p.goods[command.single] > 0) || wh.includes(command.single))) return 'とっておく 1 つが正しくありません';
        return null;
    }

    keepGoods(seat, warehouse, single) {
        const p = this.players[seat];
        const lost = {};
        for (const g of GOODS) {
            const keep = warehouse.includes(g) ? p.goods[g] : g === single ? 1 : 0;
            const drop = p.goods[g] - keep;
            if (drop > 0) {
                lost[g] = drop;
                this.supply[g] += drop;
                p.goods[g] = keep;
            }
        }
        if (Object.keys(lost).length) this.emit({ type: 'spoil', seat, goods: lost });
    }

    doStore(seat, command) {
        this.keepGoods(seat, command.warehouse, command.single);
        this.queue.shift();
        this.decision = null;
        this.nextStore();
    }

    // ---------- 得点 ----------

    bonus(seat, key) {
        const p = this.players[seat];
        switch (key) {
            case 'guildHall': return p.city.reduce((s, c) => {
                const x = buildingOf(c.key);
                return s + (x.kind === 'production' ? (x.small ? 1 : 2) : 0);
            }, 0);
            case 'residence': return residencePoints(p.island.length);
            case 'fortress': return Math.floor(this.totalColonists(seat) / 3);
            case 'customsHouse': return Math.floor(p.chips / 4);
            case 'cityHall': return p.city.filter(c => buildingOf(c.key).kind !== 'production').length;
            default: return 0;
        }
    }

    score(seat) {
        const p = this.players[seat];
        const buildings = p.city.reduce((s, c) => s + buildingOf(c.key).vp, 0);
        // 大きい建物の点は、入植者がいるときだけ
        const bonus = p.city.filter(c => buildingOf(c.key).kind === 'large' && c.colonists > 0).reduce((s, c) => s + this.bonus(seat, c.key), 0);
        const goods = GOODS.reduce((s, g) => s + p.goods[g], 0);
        return { chips: p.chips, buildings, bonus, total: p.chips + buildings + bonus, tiebreak: p.money + goods };
    }

    finish() {
        this.phase = 'end';
        this.decision = null;
        this.scores = this.players.map((_, seat) => this.score(seat));
        const best = Math.max(...this.scores.map(s => s.total));
        const top = this.scores.map((_, i) => i).filter(i => this.scores[i].total === best);
        const tb = Math.max(...top.map(i => this.scores[i].tiebreak));
        this.winners = top.filter(i => this.scores[i].tiebreak === tb);
        this.winner = this.winners.length === 1 ? this.winners[0] : null;
        this.emit({ type: 'end', winners: this.winners, scores: this.scores, reason: this.endTriggered });
    }
}
