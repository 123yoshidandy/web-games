/**
 * ラー（基本ゲーム、2〜5人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋の順はシードから決まる）
 *
 * ルール（Rio Grande 2008 年の英語版。2〜5人）
 * - タイル180枚を袋に入れる。各自10点と太陽駒の組（人数ごと）を持ち、中央に太陽駒1を置く。一番大きい太陽駒の人から始める
 * - 手番：タイルを1枚引く（ラーならラーのトラックへ置いて競り、ほかは競りのトラックへ）／ラー宣言する（競り）／神を使う（1枚につき競りのトラックから1枚取る。神は取れない）
 *   競りのトラックが8枚なら、引けない。表の太陽駒がない人は手番を飛ばす
 * - 競り：ラーの人の左から1回ずつ、表の太陽駒を1枚出すか見送る（前より大きく）。ラーの人は最後
 *   自分でラー宣言した競りで、ほかの全員が見送ったら、ラーの人は出さなければならない（競りのトラックが8枚のときを除く）
 *   勝った人は競りのトラックのタイルをすべて取り、出した太陽駒を中央へ置き、中央の太陽駒を裏向きで受け取る
 *   ラーを引いた競りで全員見送りなら、タイルは残る。8枚のときにラー宣言して全員見送りなら、タイルは捨てる
 * - 災害：取った人は、種類ごとに2枚捨てる（葬式はファラオ、干ばつは洪水を先に・足りなければナイル河、内乱は文明、地震はモニュメント）
 * - 時代の終わり：ラーのトラックが埋まった（そのラーでは競りをしない。両方のトラックを捨てる）か、全員の太陽駒が裏になった
 * - 点（時代ごと）：神2・金3・ファラオの最多+5／最少-2・洪水が1枚以上あればナイル河と洪水1ずつ・文明（0種-5、3/4/5種で5/10/15）
 *   神・金・洪水・文明は捨て、ファラオ・ナイル河・モニュメントは残す。第3時代のあとにモニュメントと太陽駒の合計（最多+5・最少-5）
 *   点は0より下がらない。同点なら、一番大きい太陽駒を持つ人が上
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 災害で捨てるタイルの選び方が結果に関わらないとき（同じ種類しかない、2枚以下）は、自動で捨てる
 * - 時代の点は、増減をまとめてから足す（0より下がるときは0にする）
 */

import { createRandom, shuffle } from './random.js';
import { TILES, TILE_ORDER, CIVS, MONUMENTS, DISASTERS, DISASTER_TARGETS, SUN_SETS, RA_TRACK, AUCTION_MAX, EPOCHS, START_SCORE, POINTS } from './data.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const MAX_LOGS = 500;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = { draw: [], ra: [], god: ['slots'], bid: ['sun'], pass: [], discard: ['tiles'] };

const isInt = (v) => Number.isInteger(v);
const name = (p) => p.name;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed };
        const n = players.length;
        this.bag = shuffle(TILE_ORDER.flatMap(t => Array(TILES[t].count).fill(t)), this.random);
        const sets = shuffle(SUN_SETS[n].map(s => [...s]), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            score: START_SCORE, suns: sets[id].map(value => ({ value, up: true })), tiles: {}
        }));
        this.center = 1;
        this.epoch = 1;
        this.raTrack = 0;
        this.auctionTrack = [];
        this.current = this.highestSunSeat();
        this.phase = 'play';        // play：手番 / auction：競り / disaster：災害で捨てるタイルを選ぶ / end
        this.auction = null;        // { raPlayer, voluntary, full, order, index, high: { seat, sun } | null, bids }
        this.disasters = [];        // これから片づける災害 { seat, kind }
        this.after = null;          // 災害のあとに手番を渡す人
        this.epochScores = [];      // 時代ごとの点の内訳
        this.finalScores = null;
        this.ranking = null;
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`第1時代。${name(this.players[this.current])}から始めます`);
    }

    get raLimit() {
        return RA_TRACK[this.players.length];
    }

    isOver() {
        return this.phase === 'end';
    }

    hasSun(seat) {
        return this.players[seat].suns.some(s => s.up);
    }

    highestSunSeat() {
        let best = 0;
        this.players.forEach(p => {
            const top = Math.max(...p.suns.filter(s => s.up).map(s => s.value), 0);
            const bestTop = Math.max(...this.players[best].suns.filter(s => s.up).map(s => s.value), 0);
            if (top > bestTop) best = p.id;
        });
        return best;
    }

    actors() {
        switch (this.phase) {
            case 'play': return [this.current];
            case 'auction': return [this.auction.order[this.auction.index]];
            case 'disaster': return [this.disasters[0].seat];
            default: return [];
        }
    }

    count(seat, type) {
        return this.players[seat].tiles[type] ?? 0;
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const handler = {
            play: { draw: this.draw, ra: this.invokeRa, god: this.useGods },
            auction: { bid: this.bid, pass: this.pass },
            disaster: { discard: this.discard }
        }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 手番 ----

    draw(seat) {
        if (this.auctionTrack.length >= AUCTION_MAX) return this.fail('競りのトラックがいっぱいです。神を使うか、ラー宣言をしてください');
        if (!this.bag.length) return this.fail('袋が空です');
        const tile = this.bag.shift();
        const p = this.players[seat];
        this.emit({ type: 'draw', seat, tile });
        if (tile === 'ra') {
            this.raTrack += 1;
            this.log(`${name(p)}がラーを引きました（${this.raTrack}/${this.raLimit}）`);
            if (this.raTrack >= this.raLimit) {
                // ラーのトラックが埋まった：競りはなく、両方のトラックを捨てて時代の終わり
                this.log('ラーのトラックが埋まりました');
                this.auctionTrack = [];
                this.endEpoch();
                return true;
            }
            this.startAuction(seat, false);
            return true;
        }
        this.auctionTrack.push(tile);
        this.log(`${name(p)}が${TILES[tile].name}を引きました`);
        this.nextTurn(seat);
        return true;
    }

    invokeRa(seat) {
        this.log(`${name(this.players[seat])}がラー宣言しました`);
        this.emit({ type: 'invoke', seat });
        this.startAuction(seat, true);
        return true;
    }

    // 神1枚につき、競りのトラックから1枚（神は取れない）
    useGods(seat, { slots }) {
        const gods = this.count(seat, 'god');
        if (!Array.isArray(slots) || !slots.length || new Set(slots).size !== slots.length) return this.fail('取るタイルを選んでください');
        if (slots.length > gods) return this.fail('神が足りません');
        if (!slots.every(i => isInt(i) && i >= 0 && i < this.auctionTrack.length)) return this.fail('そのタイルはありません');
        if (slots.some(i => this.auctionTrack[i] === 'god')) return this.fail('神は神で取れません');
        const p = this.players[seat];
        const taken = slots.map(i => this.auctionTrack[i]);
        this.auctionTrack = this.auctionTrack.filter((_, i) => !slots.includes(i));
        p.tiles.god -= slots.length;
        this.emit({ type: 'god', seat, tiles: [...taken] });
        this.log(`${name(p)}が神${slots.length}枚で${taken.map(t => TILES[t].name).join('・')}を取りました`);
        this.receive(seat, taken);
        this.queueDisasters(seat, taken);
        this.after = { type: 'turn', from: seat };
        this.resolveDisasters();
        return true;
    }

    nextTurn(from) {
        const n = this.players.length;
        for (let k = 1; k <= n; k++) {
            const seat = (from + k) % n;
            if (this.hasSun(seat)) {
                this.current = seat;
                this.phase = 'play';
                this.emit({ type: 'turn', seat });
                return;
            }
        }
        // 全員の太陽駒が裏になった
        this.endEpoch();
    }

    // ---- 競り ----

    startAuction(raPlayer, voluntary) {
        const n = this.players.length;
        const order = [];
        for (let k = 1; k <= n; k++) {
            const seat = (raPlayer + k) % n;
            if (this.hasSun(seat)) order.push(seat);
        }
        this.auction = { raPlayer, voluntary, full: this.auctionTrack.length >= AUCTION_MAX, order, index: 0, high: null, bids: {} };
        this.phase = 'auction';
        this.emit({ type: 'auction', raPlayer, voluntary });
        if (!order.length) this.finishAuction();
    }

    // ラーの人が出さなければならないか
    mustBid(seat) {
        const a = this.auction;
        return a.voluntary && !a.full && seat === a.raPlayer && a.high === null && a.index === a.order.length - 1;
    }

    bid(seat, { sun }) {
        const a = this.auction;
        const p = this.players[seat];
        const own = p.suns.find(s => s.up && s.value === sun);
        if (!own) return this.fail('その太陽駒は持っていません');
        if (a.high && sun <= a.high.sun) return this.fail('前より大きい太陽駒を出してください');
        a.high = { seat, sun };
        a.bids[seat] = sun;
        this.emit({ type: 'bid', seat, sun });
        this.log(`${name(p)}が太陽駒${sun}を出しました`);
        this.advanceAuction();
        return true;
    }

    pass(seat) {
        if (this.mustBid(seat)) return this.fail('自分でラー宣言した競りなので、太陽駒を出してください');
        this.auction.bids[seat] = null;
        this.emit({ type: 'pass', seat });
        this.log(`${name(this.players[seat])}は見送りました`);
        this.advanceAuction();
        return true;
    }

    advanceAuction() {
        const a = this.auction;
        a.index += 1;
        if (a.index >= a.order.length) this.finishAuction();
    }

    finishAuction() {
        const a = this.auction;
        if (!a.high) {
            if (a.full) {
                this.log('全員が見送ったので、競りのトラックのタイルを捨てます');
                this.auctionTrack = [];
            } else {
                this.log('全員が見送りました');
            }
            this.auction = null;
            this.nextTurn(a.raPlayer);
            return;
        }
        const { seat, sun } = a.high;
        const p = this.players[seat];
        const tiles = this.auctionTrack;
        this.auctionTrack = [];
        // 出した太陽駒を中央へ、中央の太陽駒を裏向きで受け取る
        const own = p.suns.find(s => s.up && s.value === sun);
        p.suns.splice(p.suns.indexOf(own), 1);
        p.suns.push({ value: this.center, up: false });
        this.emit({ type: 'win', seat, sun, center: this.center, tiles: [...tiles] });
        this.log(`${name(p)}が太陽駒${sun}で${tiles.length ? tiles.map(t => TILES[t].name).join('・') : '中央の太陽駒だけ'}を取りました（太陽駒${this.center}を受け取る）`);
        this.center = sun;
        this.receive(seat, tiles);
        this.queueDisasters(seat, tiles);
        this.auction = null;
        this.after = { type: 'turn', from: a.raPlayer };
        this.resolveDisasters();
    }

    receive(seat, tiles) {
        const p = this.players[seat];
        tiles.filter(t => TILES[t].group !== 'disaster').forEach(t => { p.tiles[t] = (p.tiles[t] ?? 0) + 1; });
    }

    queueDisasters(seat, tiles) {
        tiles.filter(t => TILES[t].group === 'disaster').forEach(kind => this.disasters.push({ seat, kind }));
    }

    // 災害を順に片づける。選ぶ意味があるときだけ止まって聞く
    resolveDisasters() {
        while (this.disasters.length) {
            const { seat, kind } = this.disasters[0];
            const choices = this.disasterChoices(seat, kind);
            if (choices.needed === 0) {
                this.disasters.shift();
                this.log(`${TILES[kind].name}：失うタイルはありません`);
                continue;
            }
            if (choices.auto) {
                this.disasters.shift();
                this.loseTiles(seat, kind, choices.auto);
                continue;
            }
            this.phase = 'disaster';
            return;
        }
        const after = this.after;
        this.after = null;
        this.nextTurn(after.from);
    }

    // 災害で捨てる枚数と、自動で決まる場合の捨てるタイル
    disasterChoices(seat, kind) {
        const targets = DISASTER_TARGETS[kind];
        const held = targets.flatMap(t => Array(this.count(seat, t)).fill(t));
        const needed = Math.min(2, held.length);
        if (kind === 'funeral' || kind === 'drought') return { needed, auto: held.slice(0, needed) }; // 干ばつは洪水を先に
        const kinds = new Set(held);
        if (held.length <= 2 || kinds.size === 1) return { needed, auto: held.slice(0, needed) };
        return { needed, auto: null, held };
    }

    discard(seat, { tiles }) {
        const { kind } = this.disasters[0];
        const choices = this.disasterChoices(seat, kind);
        if (!Array.isArray(tiles) || tiles.length !== choices.needed) return this.fail(`${choices.needed}枚を選んでください`);
        const rest = [...choices.held];
        for (const t of tiles) {
            const i = rest.indexOf(t);
            if (i < 0) return this.fail('そのタイルは持っていません');
            rest.splice(i, 1);
        }
        this.disasters.shift();
        this.loseTiles(seat, kind, tiles);
        this.resolveDisasters();
        return true;
    }

    loseTiles(seat, kind, tiles) {
        const p = this.players[seat];
        tiles.forEach(t => { p.tiles[t] -= 1; });
        this.emit({ type: 'disaster', seat, kind, tiles: [...tiles] });
        this.log(`${TILES[kind].name}：${name(p)}は${tiles.map(t => TILES[t].name).join('・')}を失いました`);
    }

    // ---- 時代の終わり ----

    endEpoch() {
        this.auction = null;
        const final = this.epoch === EPOCHS;
        const rows = this.players.map(p => this.scoreEpoch(p.id, final));
        // ファラオの最多・最少、（最後のみ）太陽駒の合計の最多・最少
        const versus = (key, most, fewest, value) => {
            const values = this.players.map(p => value(p));
            const max = Math.max(...values);
            const min = Math.min(...values);
            if (max === min) return;
            values.forEach((v, i) => {
                if (v === max) rows[i][key] = most;
                if (v === min) rows[i][key] = fewest;
            });
        };
        versus('pharaoh', POINTS.pharaohMost, POINTS.pharaohFewest, p => this.count(p.id, 'pharaoh'));
        if (final) versus('sun', POINTS.sunMost, POINTS.sunFewest, p => p.suns.reduce((s, x) => s + x.value, 0));
        rows.forEach((row, seat) => {
            const p = this.players[seat];
            row.total = Object.entries(row).filter(([k]) => k !== 'seat').reduce((s, [, v]) => s + v, 0);
            row.before = p.score;
            p.score = Math.max(0, p.score + row.total);
            row.after = p.score;
            // 神・金・洪水・文明は捨てる
            ['god', 'gold', 'flood', ...CIVS].forEach(t => { delete p.tiles[t]; });
        });
        this.epochScores.push(rows);
        this.emit({ type: 'epoch', epoch: this.epoch, rows: structuredClone(rows) });
        this.log(`第${this.epoch}時代の得点：${this.players.map(p => `${name(p)} ${p.score}`).join('・')}`);
        this.raTrack = 0;
        if (final) return this.finish();
        this.epoch += 1;
        this.players.forEach(p => p.suns.forEach(s => { s.up = true; }));
        this.current = this.highestSunSeat();
        this.phase = 'play';
        this.log(`第${this.epoch}時代。${name(this.players[this.current])}から始めます`);
        this.emit({ type: 'turn', seat: this.current });
    }

    // その時代の点の内訳（最多・最少は endEpoch で足す）
    scoreEpoch(seat, final) {
        const c = (t) => this.count(seat, t);
        const civKinds = CIVS.filter(t => c(t) > 0).length;
        const row = {
            seat,
            god: c('god') * POINTS.god,
            gold: c('gold') * POINTS.gold,
            pharaoh: 0,
            river: c('flood') > 0 ? c('flood') + c('nile') : 0,
            civ: civKinds === 0 ? POINTS.noCiv : (POINTS.civ[civKinds] ?? 0),
            monument: 0,
            sun: 0
        };
        if (final) {
            const kinds = MONUMENTS.filter(t => c(t) > 0);
            row.monument = POINTS.monumentKinds[kinds.length] + kinds.reduce((s, t) => s + (POINTS.monumentSame[c(t)] ?? 0), 0);
        }
        return row;
    }

    finish() {
        this.phase = 'end';
        const topSun = (p) => Math.max(...p.suns.map(s => s.value));
        this.ranking = [...this.players].sort((a, b) => b.score - a.score || topSun(b) - topSun(a)).map(p => p.id);
        this.winner = this.ranking[0];
        this.finalScores = this.players.map(p => ({ seat: p.id, score: p.score, topSun: topSun(p) }));
        this.emit({ type: 'end', winner: this.winner });
        this.log(`${name(this.players[this.winner])}の勝ち（${this.players[this.winner].score}点）`);
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

export { TILES, TILE_ORDER, CIVS, MONUMENTS, DISASTERS };
