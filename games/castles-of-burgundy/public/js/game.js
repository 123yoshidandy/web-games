/**
 * ブルゴーニュの城（基本ゲーム、2〜4人、公国の盤は全員1番）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋の順とダイスはシードから決まる）
 *
 * ルール
 * - 5フェーズ（A〜E）×5ラウンド。フェーズの初めに、中央の盤の区域（1〜6）と黒の区域にタイルを並べ、商品5枚をラウンドの欄に出す
 * - ラウンドの初めに全員がダイス2つを振り、最初の人は白のダイスも振る。白の目の区域に、そのラウンドの商品を置く
 * - 手番：ダイス1つで行動1つを2回。区域からタイルを取る・タイルを公国に置く（色と目が合い、置いたタイルのとなり）・商品を1種類売る・労働者を2つ得る
 *   労働者1つで目を±1（1と6はつながる）。手番に1回、銀貨2枚で黒の区域からタイルを買える
 * - 置いたタイルの効果：城は追加の行動（好きな目）、鉱山はフェーズの終わりに銀貨、知識は26種の効果、建物は種類ごとの効果、家畜は点、船は商品と手番の順
 * - 地域を埋めたら、大きさの点＋フェーズの点。色をすべて埋めたら、1番目・2番目にボーナス
 * - 終わりに、商品1枚・銀貨1枚・労働者2つで1点ずつと、知識タイルの点。同点なら、空いたマスの多い人（ドイツ語の原本）、次に手番の順の後ろの人
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 手番の順は、ラウンドの初めに決める（ラウンドの途中で船を置いても、そのラウンドの順は変わらない）
 * - 船で取る商品が3種類を超えるとき、持っている種類と多い種類を先に取る
 * - 行動の途中の効果（城の追加の行動、建物の効果、船の商品）は、次の操作の前に片づける。使えなければ自動で飛ばす
 * - 手番は、ダイスを2つとも使ったあとに終える（買い物は、その前ならいつでも）
 * - 最後のフェーズ E の終わりにも、鉱山の銀貨を受け取る（ルールブックは「各フェーズの終わり」）
 */

import { createRandom, shuffle } from './random.js';
import {
    CELLS, REGIONS, TILES, GOODS_COPIES, KIND_ORDER, BUILDINGS, KNOWLEDGE, ANIMALS,
    depotSlots, BLACK_SLOTS, REGION_POINTS, PHASE_BONUS, SELL_POINTS, COLOR_BONUS, PHASES, ROUNDS, START_CELL
} from './data.js';
import { workersNeeded, placeProblem, regionFull, kindFull, goodsAfterShip, storageFull, animalPoints, hasKnowledge } from './rules.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 500;
const MAX_EVENTS = 150;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    take: ['die', 'depot', 'slot', 'discard'], place: ['die', 'tile', 'cell'], sell: ['die', 'goods'], workers: ['die'],
    buy: ['depot', 'slot', 'discard'], ship: ['depots'], skip: [], end: []
};

const isInt = (v) => Number.isInteger(v);
const between = (v, lo, hi) => isInt(v) && v >= lo && v <= hi;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, start }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        const n = players.length;
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * n);
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, start: options.start ?? drawn };
        // タイルは裏の色ごとの山（白い裏は種類ごと、黒い裏は1つ）
        this.supply = Object.fromEntries(KIND_ORDER.map(kind => [kind, shuffle(TILES.filter(t => t.kind === kind && !t.black).map(t => t.id), this.random)]));
        this.supply.black = shuffle(TILES.filter(t => t.black).map(t => t.id), this.random);
        // 商品：5枚ずつ5フェーズ分、残りから各自3枚
        const goods = shuffle(Array.from({ length: 6 * GOODS_COPIES }, (_, i) => 1 + (i % 6)), this.random);
        this.goodsPiles = Array.from({ length: 5 }, () => goods.splice(0, 5));
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            vp: 0, silver: 1, workers: 0, storage: [], goods: {}, sold: {}, bonuses: [],
            estate: CELLS.map(() => null), dice: [0, 0], used: [true, true], track: 0, stamp: 0
        }));
        this.players.forEach(p => {
            p.estate[START_CELL] = this.supply.castle.shift();
            goods.splice(0, 3).forEach(g => { p.goods[g] = (p.goods[g] ?? 0) + 1; });
        });
        // 手番の順：最初の人が塔のいちばん上。労働者は順に1〜4
        this.stampSeq = 0;
        for (let k = n - 1; k >= 0; k--) {
            const p = this.players[(this.options.start + k) % n];
            p.stamp = ++this.stampSeq;
            p.workers = k + 1;
        }
        this.depots = Array.from({ length: 6 }, () => []);   // [{ kind, tile }]
        this.depotGoods = Array.from({ length: 6 }, () => []);
        this.black = [];
        this.bonusClaims = Object.fromEntries(KIND_ORDER.map(k => [k, []]));
        this.phase = -1;
        this.round = 0;
        this.roundGoods = [];
        this.white = 0;
        this.order = [];
        this.turnIndex = 0;
        this.turn = null;           // { seat, bought }
        this.pending = [];          // 片づける効果（後ろが先）
        this.state = 'play';        // play / end
        this.finalScores = null;
        this.ranking = null;
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startPhase();
    }

    isOver() {
        return this.state === 'end';
    }

    actors() {
        return this.isOver() || !this.turn ? [] : [this.turn.seat];
    }

    // 手番の順（塔の位置が大きい順、同じ位置なら上の順）
    turnOrder() {
        return [...this.players].sort((a, b) => b.track - a.track || b.stamp - a.stamp).map(p => p.id);
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const handler = {
            take: this.take, place: this.place, sell: this.sell, workers: this.takeWorkers, buy: this.buy,
            ship: this.ship, skip: this.skip, end: this.endTurn
        }[command.type];
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- フェーズとラウンド ----

    startPhase() {
        this.phase += 1;
        this.round = 0;
        const n = this.players.length;
        // 残ったタイルは箱へ（商品は残す）
        this.depots = depotSlots(n, this.phase).map(kinds => kinds.map(kind => ({ kind, tile: this.supply[kind].shift() ?? null })));
        this.black = this.supply.black.splice(0, BLACK_SLOTS[n]);
        this.roundGoods = [...this.goodsPiles[this.phase]];
        this.emit({ type: 'phase', phase: this.phase });
        this.log(`フェーズ ${PHASES[this.phase]}`);
        this.startRound();
    }

    startRound() {
        this.order = this.turnOrder();
        this.players.forEach(p => {
            p.dice = [this.rollDie(), this.rollDie()];
            p.used = [false, false];
        });
        this.white = this.rollDie();
        const g = this.roundGoods.shift();
        this.depotGoods[this.white - 1].push(g);
        this.emit({ type: 'round', phase: this.phase, round: this.round, white: this.white, goods: g });
        this.log(`ラウンド ${this.round + 1}：白のダイスは${this.white}`);
        this.turnIndex = 0;
        this.startTurn();
    }

    rollDie() {
        return 1 + Math.floor(this.random() * 6);
    }

    startTurn() {
        const seat = this.order[this.turnIndex];
        this.turn = { seat, bought: false };
        this.pending = [];
        this.emit({ type: 'turn', seat });
    }

    endTurn(seat) {
        const p = this.players[seat];
        if (this.pending.length) return this.fail('先に効果を片づけてください');
        if (!p.used.every(Boolean)) return this.fail('ダイスを2つとも使ってください');
        this.turnIndex += 1;
        if (this.turnIndex < this.order.length) {
            this.startTurn();
            return true;
        }
        this.round += 1;
        if (this.round < ROUNDS) {
            this.startRound();
            return true;
        }
        this.endPhase();
        return true;
    }

    endPhase() {
        // 鉱山1つにつき銀貨1枚（知識2なら労働者も）
        this.players.forEach(p => {
            const mines = p.estate.filter(t => t !== null && TILES[t].kind === 'mine').length;
            if (!mines) return;
            p.silver += mines;
            const extra = hasKnowledge(p, 2) ? mines : 0;
            p.workers += extra;
            this.emit({ type: 'mines', seat: p.id, silver: mines, workers: extra });
            this.log(`${p.name}は鉱山から銀貨${mines}枚${extra ? `と労働者${extra}` : ''}`);
        });
        if (this.phase >= PHASES.length - 1) return this.finish();
        this.startPhase();
    }

    // ---- ダイス ----

    // die：0・1（自分のダイス）か 'bonus'（城の追加の行動・建物の効果）。使える目と、要る労働者の数を返す
    useDie(seat, die, target, purpose, kind) {
        const p = this.players[seat];
        if (die === 'bonus') return { ok: true, cost: 0 };
        if (die !== 0 && die !== 1) return { error: 'ダイスを選んでください' };
        if (p.used[die]) return { error: 'そのダイスはもう使いました' };
        if (purpose === 'workers') return { ok: true, cost: 0 };
        const cost = workersNeeded(p, p.dice[die], target, purpose, kind);
        if (cost > p.workers) return { error: '労働者が足りません' };
        return { ok: true, cost };
    }

    spendDie(seat, die, cost) {
        const p = this.players[seat];
        if (die === 'bonus') {
            this.pending.pop();
            return;
        }
        p.used[die] = true;
        if (cost) {
            p.workers -= cost;
            this.emit({ type: 'workers', seat, amount: -cost });
        }
    }

    // 今、片づける効果
    top() {
        return this.pending.at(-1) ?? null;
    }

    // ダイスの行動ができるか。効果が残っているときは、その効果に合う操作だけ
    checkAction(type, die) {
        const top = this.top();
        if (!top) return die === 'bonus' ? '今は使えません' : null;
        if (die !== 'bonus') return '先に効果を片づけてください';
        const allowed = { castle: ['take', 'place', 'sell', 'workers'], cityHall: ['place'], warehouse: ['sell'], pick: ['take'] }[top.kind] ?? [];
        return allowed.includes(type) ? null : '今はその操作はできません';
    }

    // ---- 行動 ----

    take(seat, { die, depot, slot, discard }) {
        const problem = this.checkAction('take', die);
        if (problem) return this.fail(problem);
        if (!between(depot, 0, 5)) return this.fail('区域を選んでください');
        const top = this.top();
        const spot = this.depots[depot][slot];
        if (!isInt(slot) || !spot || spot.tile === null) return this.fail('そのタイルはありません');
        if (top?.kind === 'pick' && !top.kinds.includes(TILES[spot.tile].kind)) return this.fail('その種類は取れません');
        const free = top?.kind === 'pick' || top?.kind === 'castle';
        const use = free ? { ok: true, cost: 0 } : this.useDie(seat, die, depot + 1, 'take');
        if (use.error) return this.fail(use.error);
        const p = this.players[seat];
        const drop = this.checkDiscard(p, discard);
        if (drop) return this.fail(drop);
        this.spendDie(seat, die, use.cost);
        this.toStorage(p, spot.tile, discard);
        this.log(`${p.name}が区域${depot + 1}から${tileName(spot.tile)}を取りました`);
        this.emit({ type: 'take', seat, depot, slot, tile: spot.tile });
        spot.tile = null;
        this.settle(seat);
        return true;
    }

    // 保管場所がいっぱいなら、捨てるタイル（保管場所の位置）が要る
    checkDiscard(p, discard) {
        if (!storageFull(p)) return discard === undefined || discard === null ? null : '捨てなくても置けます';
        if (!between(discard, 0, p.storage.length - 1)) return '保管場所がいっぱいです。捨てるタイルを選んでください';
        return null;
    }

    toStorage(p, tile, discard) {
        if (storageFull(p)) {
            const [gone] = p.storage.splice(discard, 1);
            this.log(`${p.name}は${tileName(gone)}を捨てました`);
        }
        p.storage.push(tile);
    }

    place(seat, { die, tile, cell }) {
        const problem = this.checkAction('place', die);
        if (problem) return this.fail(problem);
        const p = this.players[seat];
        if (!isInt(tile) || !p.storage.includes(tile)) return this.fail('そのタイルは保管場所にありません');
        if (!between(cell, 0, CELLS.length - 1)) return this.fail('マスを選んでください');
        const why = placeProblem(p, tile, cell);
        if (why) return this.fail(why);
        const use = this.useDie(seat, die, CELLS[cell].die, 'place', TILES[tile].kind);
        if (use.error) return this.fail(use.error);
        this.spendDie(seat, die, use.cost);
        p.storage.splice(p.storage.indexOf(tile), 1);
        p.estate[cell] = tile;
        this.emit({ type: 'place', seat, tile, cell });
        this.log(`${p.name}が${tileName(tile)}を置きました`);
        this.scorePlacement(p, tile, cell);
        this.applyTile(p, tile, cell);
        this.settle(seat);
        return true;
    }

    scorePlacement(p, tile, cell) {
        const region = REGIONS[CELLS[cell].region];
        if (regionFull(p, region.id)) {
            const points = REGION_POINTS[region.cells.length] + PHASE_BONUS[this.phase];
            this.gainVp(p, points, `地域（${region.cells.length}マス）を埋めて`);
        }
        const kind = TILES[tile].kind;
        if (kindFull(p, kind)) {
            const claims = this.bonusClaims[kind];
            if (claims.length < 2) {
                const points = COLOR_BONUS[this.players.length][claims.length];
                claims.push(p.id);
                p.bonuses.push(kind);
                this.gainVp(p, points, `${claims.length === 1 ? '最初に' : '2番目に'}色を埋めて`);
            }
        }
    }

    applyTile(p, tile, cell) {
        const t = TILES[tile];
        switch (t.kind) {
            case 'castle': this.pending.push({ kind: 'castle' }); break;
            case 'animal': this.gainVp(p, animalPoints(p, tile, cell), `${ANIMALS[t.animal]}で`); break;
            case 'ship': {
                p.track += 1;
                p.stamp = ++this.stampSeq;
                this.emit({ type: 'track', seat: p.id });
                this.pending.push({ kind: 'ship' });
                break;
            }
            case 'building': this.applyBuilding(p, t.building); break;
            default: break;
        }
    }

    applyBuilding(p, building) {
        switch (building) {
            case 'warehouse': this.pending.push({ kind: 'warehouse' }); break;
            case 'carpenter': this.pending.push({ kind: 'pick', kinds: ['building'] }); break;
            case 'church': this.pending.push({ kind: 'pick', kinds: ['mine', 'knowledge', 'castle'] }); break;
            case 'market': this.pending.push({ kind: 'pick', kinds: ['ship', 'animal'] }); break;
            case 'boardingHouse': this.gainWorkers(p, 4); break;
            case 'bank': this.gainSilver(p, 2); break;
            case 'cityHall': this.pending.push({ kind: 'cityHall' }); break;
            case 'watchtower': this.gainVp(p, 4, '見張り塔で'); break;
        }
    }

    // 使えない効果は飛ばす
    settle(seat) {
        const p = this.players[seat];
        while (this.pending.length) {
            const top = this.top();
            let possible = true;
            if (top.kind === 'ship') possible = this.depotGoods.some(list => list.length);
            if (top.kind === 'warehouse') possible = Object.values(p.goods).some(v => v > 0);
            if (top.kind === 'pick') possible = this.depots.some(d => d.some(s => s.tile !== null && top.kinds.includes(TILES[s.tile].kind)));
            if (top.kind === 'cityHall') possible = p.storage.some(t => CELLS.some(c => !placeProblem(p, t, c.id)));
            if (possible) return;
            this.pending.pop();
        }
    }

    sell(seat, { die, goods }) {
        const problem = this.checkAction('sell', die);
        if (problem) return this.fail(problem);
        const p = this.players[seat];
        if (!between(goods, 1, 6) || !(p.goods[goods] > 0)) return this.fail('その商品は持っていません');
        const free = this.top()?.kind === 'warehouse' || this.top()?.kind === 'castle';
        const use = free ? { ok: true, cost: 0 } : this.useDie(seat, die, goods, 'sell');
        if (use.error) return this.fail(use.error);
        this.spendDie(seat, die, use.cost);
        this.sellGoods(p, goods);
        this.settle(seat);
        return true;
    }

    sellGoods(p, goods) {
        const count = p.goods[goods];
        p.goods[goods] = 0;
        delete p.goods[goods];
        p.sold[goods] = (p.sold[goods] ?? 0) + count;
        this.emit({ type: 'sell', seat: p.id, goods, count });
        this.gainVp(p, count * SELL_POINTS[this.players.length], `商品を${count}枚売って`);
        this.gainSilver(p, hasKnowledge(p, 3) ? 2 : 1);
        if (hasKnowledge(p, 4)) this.gainWorkers(p, 1);
    }

    takeWorkers(seat, { die }) {
        const problem = this.checkAction('workers', die);
        if (problem) return this.fail(problem);
        const use = this.useDie(seat, die, 0, 'workers');
        if (use.error) return this.fail(use.error);
        const p = this.players[seat];
        this.spendDie(seat, die, 0);
        this.gainWorkers(p, hasKnowledge(p, 14) ? 4 : 2);
        if (hasKnowledge(p, 13)) this.gainSilver(p, 1);
        this.log(`${p.name}は労働者を得ました`);
        this.settle(seat);
        return true;
    }

    // 銀貨2枚で、黒の区域（知識6なら1〜6の区域も）から1枚買う。手番に1回
    buy(seat, { depot, slot, discard }) {
        const p = this.players[seat];
        if (this.pending.length) return this.fail('先に効果を片づけてください');
        if (this.turn.bought) return this.fail('買い物は手番に1回です');
        if (p.silver < 2) return this.fail('銀貨が足りません');
        let tile;
        if (depot === -1) {
            tile = this.black[slot];
            if (!isInt(slot) || tile === undefined || tile === null) return this.fail('そのタイルはありません');
        } else {
            if (!hasKnowledge(p, 6)) return this.fail('買えるのは黒の区域だけです');
            if (!between(depot, 0, 5) || !isInt(slot) || !this.depots[depot][slot] || this.depots[depot][slot].tile === null) return this.fail('そのタイルはありません');
            tile = this.depots[depot][slot].tile;
        }
        const drop = this.checkDiscard(p, discard);
        if (drop) return this.fail(drop);
        p.silver -= 2;
        this.turn.bought = true;
        if (depot === -1) this.black[slot] = null;
        else this.depots[depot][slot].tile = null;
        this.toStorage(p, tile, discard);
        this.emit({ type: 'buy', seat, depot, slot, tile });
        this.emit({ type: 'silver', seat, amount: -2 });
        this.log(`${p.name}が銀貨2枚で${tileName(tile)}を買いました`);
        return true;
    }

    // 船：区域の商品をすべて取る（知識5ならとなり合う2つの区域）
    ship(seat, { depots }) {
        if (this.top()?.kind !== 'ship') return this.fail('今は使えません');
        const p = this.players[seat];
        const two = hasKnowledge(p, 5);
        if (!Array.isArray(depots) || !depots.length || depots.length > (two ? 2 : 1) || !depots.every(d => between(d, 0, 5))) return this.fail('区域を選んでください');
        if (depots.length === 2 && (depots[1] - depots[0] + 6) % 6 !== 1) return this.fail('となり合う区域を選んでください');
        const incoming = depots.flatMap(d => this.depotGoods[d]);
        if (!incoming.length) return this.fail('その区域に商品はありません');
        const { goods, taken } = goodsAfterShip(p.goods, incoming);
        p.goods = goods;
        // 取った分を区域から除く（取れなかった商品は残る）
        const left = [...taken];
        depots.forEach(d => {
            this.depotGoods[d] = this.depotGoods[d].filter(g => {
                const i = left.indexOf(g);
                if (i < 0) return true;
                left.splice(i, 1);
                return false;
            });
        });
        this.pending.pop();
        this.emit({ type: 'ship', seat, depots: [...depots], goods: taken });
        this.log(`${p.name}が船で商品を${taken.length}枚取りました`);
        this.settle(seat);
        return true;
    }

    skip(seat) {
        if (!this.pending.length) return this.fail('飛ばす効果はありません');
        this.pending.pop();
        this.settle(seat);
        return true;
    }

    // ---- 点・資源 ----

    gainVp(p, points, why) {
        if (!points) return;
        p.vp += points;
        this.emit({ type: 'vp', seat: p.id, amount: points });
        this.log(`${p.name}は${why}${points}点`);
    }

    gainSilver(p, amount) {
        p.silver += amount;
        this.emit({ type: 'silver', seat: p.id, amount });
    }

    gainWorkers(p, amount) {
        p.workers += amount;
        this.emit({ type: 'workers', seat: p.id, amount });
    }

    // ---- 終わり ----

    endScore(seat) {
        const p = this.players[seat];
        const goods = Object.values(p.goods).reduce((s, v) => s + v, 0);
        const k = p.estate.filter(t => t !== null && TILES[t].kind === 'knowledge').map(t => TILES[t].knowledge);
        let knowledge = 0;
        const soldTypes = Object.values(p.sold).filter(v => v > 0).length;
        const soldCount = Object.values(p.sold).reduce((s, v) => s + v, 0);
        const placed = p.estate.filter(t => t !== null).map(t => TILES[t]);
        k.forEach(id => {
            const info = KNOWLEDGE[id];
            if (id === 15) knowledge += soldTypes * 3;
            if (info.building) knowledge += placed.filter(t => t.building === info.building).length * 4;
            if (id === 24) knowledge += new Set(placed.filter(t => t.animal).map(t => t.animal)).size * 4;
            if (id === 25) knowledge += soldCount;
            if (id === 26) knowledge += p.bonuses.length * 2;
        });
        const extra = { goods, silver: p.silver, workers: Math.floor(p.workers / 2), knowledge };
        return { seat, before: p.vp, ...extra, total: p.vp + goods + p.silver + extra.workers + knowledge, empty: p.estate.filter(t => t === null).length };
    }

    finish() {
        this.state = 'end';
        const order = this.turnOrder();
        this.finalScores = this.players.map(p => this.endScore(p.id));
        this.finalScores.forEach(s => { this.players[s.seat].vp = s.total; });
        // 同点なら、空いたマスの多い人（ドイツ語の原本と BGA。英語版の「少ない」は誤訳とされる）、次に手番の順の後ろの人
        this.ranking = [...this.finalScores].sort((a, b) => b.total - a.total || b.empty - a.empty || order.indexOf(b.seat) - order.indexOf(a.seat)).map(s => s.seat);
        this.winner = this.ranking[0];
        this.turn = null;
        this.emit({ type: 'end', winner: this.winner });
        this.log(`${this.players[this.winner].name}の勝ち（${this.finalScores[this.winner].total}点）`);
    }

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
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

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}

// タイルの名前
export function tileName(id) {
    const t = TILES[id];
    if (t.building) return BUILDINGS[t.building].name;
    if (t.animal) return `${ANIMALS[t.animal]}${t.count}`;
    if (t.knowledge) return `知識${t.knowledge}`;
    return { castle: '城', mine: '鉱山', ship: '船' }[t.kind];
}
