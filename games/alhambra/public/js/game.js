/**
 * アルハンブラのゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札と袋の並びはシードから決まる）
 *
 * ルール（基本ゲーム。2〜6人。公式のルールブックに従う）
 * - 準備: 各自に噴水。お金を1枚ずつ配り、合計が20以上になったら次の人へ。カードの最も少ない人（同じなら合計の少ない人）から始める
 *         お金の市場に4枚、建物の市場（1〜4番、それぞれ通貨が決まっている）に4枚。お金の山札を5つに分け、
 *         2つ目に1回目の得点のカード、4つ目に2回目の得点のカードを混ぜて重ねる
 * - 手番: 次のどれか1つ
 *   1. お金を取る：市場の1枚、または合計5以下になる何枚か
 *   2. 建物を買う：その場所の通貨で、値段以上を払う（おつりはない）。ちょうどの額なら、もう一度行動できる
 *   3. 作り直す：予備の建物をアルハンブラに足す・アルハンブラの建物を予備へ戻す・同じ場所で入れ替える（噴水は動かせない）
 *   手番の終わりに、買った建物をアルハンブラか予備に置く。そのあと、市場のお金と建物を4枚ずつに補充する
 * - 得点: 得点のカードが出たとき（1回目・2回目）と終わり（3回目）。建物の種類ごとに、枚数の多い人から
 *         1回目は1位、2回目は2位まで、3回目は3位までが点を得る。同じ枚数なら、その順位の点を足して等分（切り捨て）
 *         さらに、最も長くつながった外側の城壁1区画につき1点。予備の建物は数えない
 * - 終わり: 手番の終わりに、袋の建物で市場を4枚にできないとき。できるだけ補充し、市場に残った建物は、
 *           その通貨を最も多く持つ人が受け取る（同じなら市場に残る）。そのあと3回目の得点。点の多い人の勝ち（同じなら引き分け）
 * - 2人: お金は各1枚抜いて72枚。架空の3人目「ダーク」が、最初に6枚、1回目の得点のあとに6枚、
 *        2回目の得点のあとに袋の残りの3分の1（切り捨て）の建物を受け取り、建物の多数の得点だけを得る。
 *        買った建物を、置く代わりにダークに渡してもよい
 *
 * ルールブックに書かれていないので、次のように決めた
 * - カードの数と合計がどちらも同じなら、席の早い人から始める（ルールブックでは最も若い人）
 * - ちょうどの額で買ったあと、もう一度行動せずに手番を終えてもよい
 * - お金の山札が尽きたら、捨て札を混ぜて新しい山札にする（ルールブックどおり）。捨て札もなければ、補充できない分は空ける
 */

import { createRandom, shuffle } from './random.js';
import {
    TILES, TYPES, TYPE_NAMES, CURRENCIES, CURRENCY_NAMES, SCORING, FOUNTAIN, START_MONEY, TAKE_LIMIT, MARKET_SIZE,
    DIRK_START, DIRK_AFTER_FIRST, moneyCards
} from './cards.js';
import { newLayout, keyOf, placeError, removeError, swapError, longestWall, countTypes, placeSpots } from './layout.js';

export { TILES, TYPES, TYPE_NAMES, CURRENCIES, CURRENCY_NAMES, SCORING, FOUNTAIN, TAKE_LIMIT };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const MAX_LOGS = 200;
const MAX_EVENTS = 60;
export const SCORE_1 = 'S1';
export const SCORE_2 = 'S2';
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    take: ['slots'], buy: ['slot', 'cards'], redesign: ['op', 'tile', 'x', 'y'], place: ['tile', 'to', 'x', 'y'], end: []
};

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// 順位ごとの点を、同じ枚数の人で分ける。entries: [{ id, count }]、table: [1位, 2位, ...]
export function rankPoints(entries, table) {
    const result = new Map();
    const ranked = entries.filter(e => e.count > 0).sort((a, b) => b.count - a.count);
    let place = 0;
    while (place < ranked.length && place < table.length) {
        const group = ranked.filter(e => e.count === ranked[place].count);
        const pool = table.slice(place, place + group.length).reduce((s, v) => s + v, 0);
        group.forEach(e => result.set(e.id, Math.floor(pool / group.length)));
        place += group.length;
    }
    return result;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜6人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        this.cards = moneyCards(players.length === 2 ? 2 : 3);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [], layout: newLayout(), reserve: [], score: 0, rounds: []
        }));
        this.dirk = players.length === 2 ? { tiles: [], score: 0, rounds: [] } : null;
        this.bag = shuffle(TILES.map(t => t.id), this.random);
        this.market = this.bag.splice(0, MARKET_SIZE);
        if (this.dirk) this.dirk.tiles.push(...this.bag.splice(0, DIRK_START));

        // お金を配る
        const deck = shuffle(this.cards.map(c => c.id), this.random);
        this.players.forEach(p => {
            while (this.handTotal(p) < START_MONEY) p.hand.push(deck.shift());
        });
        const order = [...this.players].sort((a, b) => a.hand.length - b.hand.length || this.handTotal(a) - this.handTotal(b) || a.id - b.id);
        this.startPlayer = order[0].id;
        this.moneyMarket = deck.splice(0, MARKET_SIZE);
        // 残りを5つに分け、2つ目と4つ目に得点のカードを混ぜる
        const piles = Array.from({ length: 5 }, (_, i) => deck.slice(Math.floor(deck.length * i / 5), Math.floor(deck.length * (i + 1) / 5)));
        piles[1] = shuffle([...piles[1], SCORE_1], this.random);
        piles[3] = shuffle([...piles[3], SCORE_2], this.random);
        this.deck = piles.flat();
        this.discard = [];

        this.current = this.startPlayer;
        this.phase = 'action';     // action：行動を選ぶ / place：買った建物を置く / final：終わりに受け取った建物を置く / end：終わり
        this.actionsTaken = 0;     // この手番で行った行動の数（ちょうどの額で買うと続けられる）
        this.bought = [];          // この手番で買った、まだ置いていない建物
        this.finalQueue = [];      // 終わりに受け取った建物 [{ player, tile }]
        this.roundsScored = 0;
        this.turn = 1;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}から始めます`);
    }

    card(id) {
        return this.cards[id];
    }

    handTotal(player, currency = null) {
        return player.hand.reduce((sum, id) => sum + (currency && this.cards[id].currency !== currency ? 0 : this.cards[id].value), 0);
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作できる人
    actors() {
        if (this.phase === 'end') return [];
        if (this.phase === 'final') return [this.finalQueue[0].player];
        return [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            action: { take: this.take, buy: this.buy, redesign: this.redesign, end: this.endActions },
            place: { place: this.place },
            final: { place: this.place }
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

    // ---- 行動 ----

    // お金を取る。{ type: 'take', slots: [市場の場所, ...] }
    take(seat, { slots }) {
        if (!Array.isArray(slots) || slots.length === 0 || new Set(slots).size !== slots.length) return this.fail('取るお金を選んでください');
        if (slots.some(s => !isInt(s, 0, MARKET_SIZE - 1) || this.moneyMarket[s] === null || this.moneyMarket[s] === undefined)) return this.fail('そのお金はありません');
        const total = slots.reduce((sum, s) => sum + this.cards[this.moneyMarket[s]].value, 0);
        if (slots.length > 1 && total > TAKE_LIMIT) return this.fail(`何枚か取るときは、合計${TAKE_LIMIT}までです`);
        const player = this.players[seat];
        const taken = slots.map(s => this.moneyMarket[s]);
        slots.forEach(s => { this.moneyMarket[s] = null; });
        player.hand.push(...taken);
        this.emit({ type: 'take', seat, slots: [...slots], cards: [...taken] });
        this.log(`${player.name}がお金を取りました（${taken.map(id => this.cardLabel(id)).join('・')}）`);
        this.afterAction(false);
        return true;
    }

    // 建物を買う。{ type: 'buy', slot, cards: [手札のカード, ...] }
    buy(seat, { slot, cards }) {
        if (!isInt(slot, 0, MARKET_SIZE - 1) || this.market[slot] === null || this.market[slot] === undefined) return this.fail('その建物はありません');
        const player = this.players[seat];
        if (!Array.isArray(cards) || cards.length === 0 || new Set(cards).size !== cards.length) return this.fail('払うお金を選んでください');
        if (cards.some(id => !player.hand.includes(id))) return this.fail('持っていないお金では払えません');
        const currency = CURRENCIES[slot];
        if (cards.some(id => this.cards[id].currency !== currency)) return this.fail(`${CURRENCY_NAMES[currency]}のお金で払います`);
        const tile = this.market[slot];
        const paid = cards.reduce((sum, id) => sum + this.cards[id].value, 0);
        if (paid < TILES[tile].cost) return this.fail('お金が足りません');
        player.hand = player.hand.filter(id => !cards.includes(id));
        this.discard.push(...cards);
        this.market[slot] = null;
        this.bought.push(tile);
        const exact = paid === TILES[tile].cost;
        this.emit({ type: 'buy', seat, slot, tile, cards: [...cards], exact });
        this.log(`${player.name}が${TYPE_NAMES[TILES[tile].type]}（${TILES[tile].cost}）を買いました${exact ? '（ちょうど）' : `（${paid - TILES[tile].cost}多く）`}`);
        this.afterAction(exact);
        return true;
    }

    // 作り直す。{ op: 'add', tile, x, y }（予備から足す）・{ op: 'remove', x, y }（予備へ戻す）・{ op: 'swap', tile, x, y }（入れ替え）
    redesign(seat, { op, tile, x, y }) {
        const player = this.players[seat];
        if (!isInt(x, -20, 20) || !isInt(y, -20, 20)) return this.fail('場所が正しくありません');
        const key = keyOf(x, y);
        if (op === 'add' || op === 'swap') {
            if (!player.reserve.includes(tile)) return this.fail('その建物は予備にありません');
            const reason = op === 'add' ? placeError(player.layout, tile, x, y) : swapError(player.layout, tile, x, y);
            if (reason) return this.fail(reason);
            const removed = player.layout[key];
            player.reserve = player.reserve.filter(t => t !== tile);
            player.layout[key] = tile;
            if (op === 'swap') player.reserve.push(removed);
            this.emit({ type: 'redesign', seat, op, tile, removed: removed ?? null, x, y });
        } else if (op === 'remove') {
            const reason = removeError(player.layout, x, y);
            if (reason) return this.fail(reason);
            const removed = player.layout[key];
            delete player.layout[key];
            player.reserve.push(removed);
            this.emit({ type: 'redesign', seat, op, tile: removed, x, y });
        } else {
            return this.fail('作り直し方が正しくありません');
        }
        this.log(`${player.name}がアルハンブラを作り直しました`);
        this.afterAction(false);
        return true;
    }

    // ちょうどの額で買ったあと、もう行動しない（お金の市場が空で取れないときも終えられる）
    endActions() {
        if (this.actionsTaken === 0 && this.moneyMarket.some(id => id !== null)) return this.fail('行動を1つ選んでください');
        this.afterAction(false);
        return true;
    }

    // continues：ちょうどの額で買ったので、もう一度行動できる
    afterAction(continues) {
        this.actionsTaken++;
        if (continues) return;
        if (this.bought.length > 0) {
            this.phase = 'place';
            return;
        }
        this.endTurn();
    }

    // 買った建物を置く。{ type: 'place', tile, to: 'alhambra', x, y }・{ to: 'reserve' }・2人なら { to: 'dirk' }
    place(seat, { tile, to, x, y }) {
        const player = this.players[seat];
        const waiting = this.phase === 'final' ? [this.finalQueue[0].tile] : this.bought;
        if (!waiting.includes(tile)) return this.fail('その建物は置く建物ではありません');
        if (to === 'alhambra') {
            if (!isInt(x, -20, 20) || !isInt(y, -20, 20)) return this.fail('場所が正しくありません');
            const reason = placeError(player.layout, tile, x, y);
            if (reason) return this.fail(reason);
            player.layout[keyOf(x, y)] = tile;
        } else if (to === 'reserve') {
            player.reserve.push(tile);
        } else if (to === 'dirk') {
            if (!this.dirk || this.phase === 'final') return this.fail('ダークには渡せません');
            this.dirk.tiles.push(tile);
        } else {
            return this.fail('置き場所が正しくありません');
        }
        this.emit({ type: 'place', seat, tile, to, x: x ?? null, y: y ?? null });
        this.log(`${player.name}が${TYPE_NAMES[TILES[tile].type]}を${{ alhambra: 'アルハンブラ', reserve: '予備', dirk: 'ダーク' }[to]}に置きました`);
        if (this.phase === 'final') {
            this.finalQueue.shift();
            if (this.finalQueue.length === 0) this.finish();
            return true;
        }
        this.bought = this.bought.filter(t => t !== tile);
        if (this.bought.length === 0) this.endTurn();
        return true;
    }

    // ---- 手番の終わり ----

    endTurn() {
        // 建物を補充する。袋で4枚にできなければ、できるだけ補充して終わる
        const empty = this.market.filter(t => t === null).length;
        const short = this.bag.length < empty;
        this.market = this.market.map(t => (t === null && this.bag.length > 0 ? this.bag.shift() : t));
        this.refillMoney();
        if (short) return this.startFinal();
        this.current = (this.current + 1) % this.players.length;
        this.turn++;
        this.phase = 'action';
        this.actionsTaken = 0;
        this.emit({ type: 'turn', seat: this.current });
    }

    // お金を補充する。得点のカードが出たら、その場で得点する
    refillMoney() {
        for (let slot = 0; slot < MARKET_SIZE; slot++) {
            while (this.moneyMarket[slot] === null) {
                if (this.deck.length === 0) {
                    if (this.discard.length === 0) break;
                    this.deck = shuffle(this.discard, this.random);
                    this.discard = [];
                    this.log('お金の山札を作り直しました');
                }
                const next = this.deck.shift();
                if (next === SCORE_1 || next === SCORE_2) {
                    this.scoreRound(this.roundsScored);
                    continue;
                }
                this.moneyMarket[slot] = next;
            }
        }
    }

    // 終わり：市場に残った建物を、その通貨を最も多く持つ人へ
    startFinal() {
        this.finalQueue = [];
        this.market.forEach((tile, slot) => {
            if (tile === null) return;
            const totals = this.players.map(p => this.handTotal(p, CURRENCIES[slot]));
            const best = Math.max(...totals);
            const top = totals.flatMap((t, i) => (t === best ? [i] : []));
            if (best > 0 && top.length === 1) {
                this.finalQueue.push({ player: top[0], tile });
                this.market[slot] = null;
                this.log(`${this.players[top[0]].name}が市場の${TYPE_NAMES[TILES[tile].type]}を受け取りました`);
            }
        });
        if (this.finalQueue.length === 0) return this.finish();
        this.phase = 'final';
        this.bought = [];
    }

    finish() {
        this.scoreRound(2);
        this.phase = 'end';
        const best = Math.max(...this.players.map(p => p.score));
        this.winners = this.players.filter(p => p.score === best).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(this.winners.length === 1 ? `${this.players[this.winners[0]].name}の勝ちです` : '引き分けです');
    }

    // round：0〜2（1回目〜3回目）
    scoreRound(round) {
        const table = SCORING[round];
        const participants = this.players.map(p => ({ id: p.id, counts: countTypes(p.layout) }));
        if (this.dirk) participants.push({ id: 'dirk', counts: this.dirkCounts() });
        const gained = new Map(participants.map(p => [p.id, { types: {}, wall: 0, total: 0 }]));
        TYPES.forEach(type => {
            const points = rankPoints(participants.map(p => ({ id: p.id, count: p.counts[type] })), table[type]);
            points.forEach((value, id) => { gained.get(id).types[type] = value; gained.get(id).total += value; });
        });
        this.players.forEach(p => {
            const g = gained.get(p.id);
            g.wall = longestWall(p.layout);
            g.total += g.wall;
            p.score += g.total;
            p.rounds.push(g);
        });
        if (this.dirk) {
            const g = gained.get('dirk');
            this.dirk.score += g.total;
            this.dirk.rounds.push(g);
        }
        this.roundsScored = round + 1;
        this.emit({ type: 'score', round });
        this.log(`${round + 1}回目の得点：${this.players.map(p => `${p.name} +${p.rounds.at(-1).total}`).join('・')}${this.dirk ? `・ダーク +${this.dirk.rounds.at(-1).total}` : ''}`);
        // 2人のとき、ダークが建物を受け取る
        if (this.dirk && round === 0) this.dirk.tiles.push(...this.bag.splice(0, DIRK_AFTER_FIRST));
        if (this.dirk && round === 1) this.dirk.tiles.push(...this.bag.splice(0, Math.floor(this.bag.length / 3)));
    }

    dirkCounts() {
        const counts = Object.fromEntries(TYPES.map(t => [t, 0]));
        this.dirk.tiles.forEach(id => { counts[TILES[id].type]++; });
        return counts;
    }

    // ---- 道具 ----

    cardLabel(id) {
        return `${CURRENCY_NAMES[this.cards[id].currency]}${this.cards[id].value}`;
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

    // できる操作の例（テストと、CPU の手が通らないときの予備）
    sampleCommands() {
        const seat = this.actors()[0];
        if (seat === undefined) return [];
        const player = this.players[seat];
        if (this.phase === 'place' || this.phase === 'final') {
            const tile = this.phase === 'final' ? this.finalQueue[0].tile : this.bought[0];
            const spot = placeSpots(player.layout, tile)[0];
            return [
                ...(spot ? [{ type: 'place', tile, to: 'alhambra', x: spot[0], y: spot[1] }] : []),
                { type: 'place', tile, to: 'reserve' }
            ];
        }
        const commands = [];
        this.market.forEach((tile, slot) => {
            if (tile === null) return;
            const cards = player.hand.filter(id => this.cards[id].currency === CURRENCIES[slot]);
            if (cards.reduce((s, id) => s + this.cards[id].value, 0) >= TILES[tile].cost) commands.push({ type: 'buy', slot, cards });
        });
        this.moneyMarket.forEach((id, slot) => { if (id !== null) commands.push({ type: 'take', slots: [slot] }); });
        if (this.actionsTaken > 0 || this.moneyMarket.every(id => id === null)) commands.push({ type: 'end' });
        return commands;
    }

    // 保存する形（参加者・設定・操作の記録）。オンライン対戦のサーバーもこの形で保存する
    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    // 操作の記録から同じゲームを作り直す
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
