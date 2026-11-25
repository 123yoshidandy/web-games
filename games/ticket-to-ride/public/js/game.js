/**
 * チケット・トゥ・ライド（基本ゲーム・北米の地図）の進行（2〜5人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びはシードから決まる）
 *
 * ルール（公式のルールブックどおり）
 * - 列車カード110枚（8色×12枚と、機関車14枚）。はじめに4枚ずつ配り、5枚を表にする。表に機関車が3枚以上並んだら、5枚とも捨てて並べ直す
 * - 目的地カード30枚。はじめに3枚ずつ配り、2枚以上を残す（全員が同時に選ぶ）
 * - 手番では、次の3つから1つ
 *   1. 列車カードを2枚引く（表からでも山からでも）。表の機関車を取るなら、それ1枚で終わり。2枚目に表の機関車は取れない
 *   2. 路線を1本引く。長さの数だけ、路線と同じ色のカードを払う（灰色はどの色でも1色にそろえる。機関車はどの色にもなる）
 *   3. 目的地カードを3枚引き、1枚以上を残す
 * - 複線の2本を1人で両方は引けない。2〜3人のときは、片方が引かれたら、もう片方は使えない
 * - 誰かの列車が手番の終わりに2両以下になったら、その人を含めて全員が1回ずつ手番をして終わる
 * - 得点：路線（長さ 1〜6 で 1・2・4・7・10・15点）、目的地（つながれば足し、つながらなければ引く）、一番長い線路に10点
 * - 同点なら、達成した目的地の多い人。それも同じなら、一番長い線路の人
 *
 * 自分で決めた点
 * - 何もできない手番（引くカードも、引ける路線も、目的地の山もない）は、見送れる
 * - 表に機関車が3枚以上並び続けるとき（山と捨て札の残りでは直せないとき）は、そのまま並べる
 */

import { createRandom, shuffle } from './random.js';
import {
    CITIES, ROUTES, TICKETS, COLORS, LOCO, COLOR_NAMES, ROUTE_POINTS, CARDS_PER_COLOR, LOCO_COUNT, TRAINS, LONGEST_BONUS
} from './map.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const HAND_START = 4;
export const FACE_UP = 5;
export const DECK_SLOT = FACE_UP;      // draw の slot：0〜4 は表のカード、5 は山
export const END_TRAINS = 2;
// 操作の種類ごとに、記録する項目
// keep：tickets（残す目的地の id）、draw：slot、claim：route・color（払う色。機関車だけなら 'loco'）・locos（機関車の枚数）
export const COMMAND_FIELDS = {
    keep: ['tickets'],
    draw: ['slot'],
    claim: ['route', 'color', 'locos'],
    tickets: [],
    pass: []
};
const MAX_LOGS = 300;
const isInt = (v) => Number.isInteger(v);
const emptyHand = () => Object.fromEntries([...COLORS, LOCO].map(c => [c, 0]));

// その人の路線で、2つの都市がつながっているか
export function connected(routeIds, a, b) {
    const adj = new Map();
    routeIds.forEach(id => {
        const r = ROUTES[id];
        if (!adj.has(r.a)) adj.set(r.a, []);
        if (!adj.has(r.b)) adj.set(r.b, []);
        adj.get(r.a).push(r.b);
        adj.get(r.b).push(r.a);
    });
    if (!adj.has(a)) return false;
    const seen = new Set([a]);
    const stack = [a];
    while (stack.length) {
        const c = stack.pop();
        if (c === b) return true;
        adj.get(c).forEach(n => {
            if (!seen.has(n)) {
                seen.add(n);
                stack.push(n);
            }
        });
    }
    return false;
}

// 一番長い線路（同じ路線を2度通らない、続いた線路の長さ。都市は何度通ってもよい）
export function longestPath(routeIds) {
    const adj = new Map();
    routeIds.forEach(id => {
        const r = ROUTES[id];
        [[r.a, r.b], [r.b, r.a]].forEach(([x, y]) => {
            if (!adj.has(x)) adj.set(x, []);
            adj.get(x).push({ id, to: y, len: r.len });
        });
    });
    let best = 0;
    const used = new Set();
    const dfs = (city, length) => {
        if (length > best) best = length;
        for (const e of adj.get(city) ?? []) {
            if (used.has(e.id)) continue;
            used.add(e.id);
            dfs(e.to, length + e.len);
            used.delete(e.id);
        }
    };
    adj.forEach((_, city) => dfs(city, 0));
    return best;
}

// 路線を引けるか（カードは見ない）。引けなければ理由。claimed は路線ごとの持ち主（なければ null）
export function routeBlockReason(claimed, playerCount, seat, trains, id) {
    const r = ROUTES[id];
    if (!r) return '路線が正しくありません';
    if (claimed[id] !== null) return 'その路線は、もう引かれています';
    if (r.pair !== null) {
        const other = claimed[r.pair];
        if (other === seat) return '複線の2本を、1人で両方は引けません';
        if (other !== null && playerCount <= 3) return '2〜3人のときは、複線の片方しか使えません';
    }
    if (trains < r.len) return '列車が足りません';
    return null;
}

// 手札で払える払い方の一覧：{ color（機関車だけなら 'loco'）, locos }。色ごとに、機関車の一番少ない払い方
export function paymentOptions(hand, route) {
    const list = [];
    const colors = route.color === 'gray' ? COLORS : [route.color];
    colors.forEach(color => {
        if (hand[color] === 0) return;
        const locos = Math.max(0, route.len - hand[color]);
        if (hand[LOCO] >= locos) list.push({ color, locos });
    });
    if (hand[LOCO] >= route.len) list.push({ color: LOCO, locos: route.len });
    return list;
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, level }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed, level: options.level === 'easy' ? 'easy' : 'normal' };
        this.random = createRandom(seed);
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        const cards = [];
        COLORS.forEach(c => { for (let i = 0; i < CARDS_PER_COLOR; i++) cards.push(c); });
        for (let i = 0; i < LOCO_COUNT; i++) cards.push(LOCO);
        this.deck = shuffle(cards, this.random);
        this.discard = [];
        this.ticketDeck = shuffle(TICKETS.map(t => t.id), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: emptyHand(),
            tickets: [],
            offered: null,       // 選んでいる目的地（はじめの3枚・途中で引いた3枚）
            trains: TRAINS,
            points: 0,           // 路線の点
            routes: []
        }));
        this.players.forEach(p => {
            for (let i = 0; i < HAND_START; i++) p.hand[this.drawFromDeck()]++;
            p.offered = this.ticketDeck.splice(0, 3);
        });
        this.faceUp = [];
        this.refillFaceUp();
        this.claimed = new Array(ROUTES.length).fill(null);
        this.phase = 'choose';     // choose（はじめの目的地）→ play → end
        this.current = 0;
        this.drewOne = false;      // この手番に、もう1枚引いたか
        this.pendingDrawName = null;
        this.lastPlayer = null;    // 最後の1周の、最後に手番をする人
        this.turnCount = 0;
        this.results = null;
        this.winners = [];
        this.log('目的地を選んでください（3枚から2枚以上）', { head: true });
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人
    actors() {
        if (this.phase === 'end') return [];
        if (this.phase === 'choose') return this.players.filter(p => p.offered).map(p => p.id);
        return [this.current];
    }

    // ---- カード ----

    // 山から1枚。山がなければ捨て札を切り直す。どちらもなければ null
    drawFromDeck() {
        if (this.deck.length === 0 && this.discard.length > 0) {
            this.deck = shuffle(this.discard, this.random);
            this.discard = [];
            this.log('捨て札を切り直して、山にしました');
        }
        return this.deck.length > 0 ? this.deck.pop() : null;
    }

    // 表のカードを5枚にそろえる。機関車が3枚以上なら、5枚とも捨てて並べ直す（直せる見込みがある間）
    refillFaceUp() {
        for (let guard = 0; guard < 20; guard++) {
            for (let i = 0; i < FACE_UP; i++) {
                if (this.faceUp[i] === undefined || this.faceUp[i] === null) this.faceUp[i] = this.drawFromDeck();
            }
            const locos = this.faceUp.filter(c => c === LOCO).length;
            if (locos < 3) return;
            const others = [...this.deck, ...this.discard].filter(c => c !== LOCO).length;
            if (others < 3) return;
            this.discard.push(...this.faceUp.filter(c => c !== null));
            this.faceUp = [];
            this.log('表に機関車が3枚並んだので、5枚を並べ直しました');
        }
    }

    // ---- 判定（状態を変えない） ----

    routeBlock(player, id) {
        return routeBlockReason(this.claimed, this.players.length, player.id, player.trains, id);
    }

    // 払い方 { color, locos } が正しいか。正しくなければ理由
    paymentError(player, id, color, locos) {
        const r = ROUTES[id];
        if (!isInt(locos) || locos < 0 || locos > r.len) return '払い方が正しくありません';
        const colored = r.len - locos;
        if (color === LOCO) {
            if (colored !== 0) return '払い方が正しくありません';
        } else {
            if (!COLORS.includes(color)) return '払い方が正しくありません';
            if (colored === 0) return '払い方が正しくありません';
            if (r.color !== 'gray' && r.color !== color) return `この路線は${COLOR_NAMES[r.color]}のカードで払います`;
            if (player.hand[color] < colored) return 'カードが足りません';
        }
        if (player.hand[LOCO] < locos) return '機関車が足りません';
        return null;
    }

    payments(player, id) {
        return paymentOptions(player.hand, ROUTES[id]);
    }

    canClaim(player, id) {
        return !this.routeBlock(player, id) && this.payments(player, id).length > 0;
    }

    // 表のカード slot を取れるか（slot 5 は山）
    drawError(slot) {
        if (!isInt(slot) || slot < 0 || slot > DECK_SLOT) return '引くカードが正しくありません';
        if (slot === DECK_SLOT) return this.deck.length + this.discard.length > 0 ? null : '山にカードがありません';
        const card = this.faceUp[slot];
        if (card === null || card === undefined) return 'そこにカードはありません';
        if (card === LOCO && this.drewOne) return '2枚目に、表の機関車は取れません';
        return null;
    }

    // 手番の人ができることがあるか（見送りを許すかの判定）
    canAct(player) {
        if (this.drewOne) return [0, 1, 2, 3, 4, DECK_SLOT].some(s => !this.drawError(s));
        if ([0, 1, 2, 3, 4, DECK_SLOT].some(s => !this.drawError(s))) return true;
        if (this.ticketDeck.length > 0) return true;
        return ROUTES.some(r => this.canClaim(player, r.id));
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        const player = this.players[playerId];
        const error = this.commandError(player, command);
        if (error) return this.fail(error);
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { recorded[k] = Array.isArray(command[k]) ? [...command[k]] : command[k]; });
        this.commands.push({ playerId, command: recorded });
        this.execute(player, recorded);
        return true;
    }

    commandError(player, command) {
        if (command.type === 'keep') {
            if (!player.offered) return '選んでいる目的地はありません';
            const ids = command.tickets;
            if (!Array.isArray(ids) || !ids.every(isInt) || new Set(ids).size !== ids.length) return '目的地の選び方が正しくありません';
            if (!ids.every(id => player.offered.includes(id))) return '目的地の選び方が正しくありません';
            const min = this.phase === 'choose' ? 2 : 1;
            if (ids.length < Math.min(min, player.offered.length)) return `目的地は${min}枚以上残します`;
            return null;
        }
        if (this.phase !== 'play') return 'まず目的地を選びます';
        if (player.offered) return '先に、残す目的地を選びます';
        switch (command.type) {
            case 'draw':
                return this.drawError(command.slot);
            case 'claim': {
                if (this.drewOne) return 'カードを引いている途中です';
                if (!isInt(command.route)) return '路線が正しくありません';
                return this.routeBlock(player, command.route) ?? this.paymentError(player, command.route, command.color, command.locos);
            }
            case 'tickets':
                if (this.drewOne) return 'カードを引いている途中です';
                return this.ticketDeck.length > 0 ? null : '目的地の山がありません';
            case 'pass':
                return this.canAct(player) ? 'まだできることがあります' : null;
            default:
                return '操作が正しくありません';
        }
    }

    // ---- 実行 ----

    execute(player, command) {
        switch (command.type) {
            case 'keep': {
                const kept = command.tickets;
                const back = player.offered.filter(id => !kept.includes(id));
                player.tickets.push(...kept);
                this.ticketDeck.push(...back);   // 戻した目的地は、山の下へ
                player.offered = null;
                this.emit({ type: 'keep', seat: player.id, count: kept.length });
                if (this.phase === 'choose') {
                    this.log(`${player.name}が目的地を${kept.length}枚残しました`);
                    if (this.players.every(p => !p.offered)) {
                        this.phase = 'play';
                        this.log(`${this.players[0].name}の番から始めます`, { head: true });
                    }
                    return;
                }
                this.log(`${player.name}が目的地を引き、${kept.length}枚残しました`);
                return this.endTurn();
            }
            case 'draw': {
                const slot = command.slot;
                let card;
                if (slot === DECK_SLOT) {
                    card = this.drawFromDeck();
                } else {
                    card = this.faceUp[slot];
                    this.faceUp[slot] = null;
                    this.refillFaceUp();
                }
                player.hand[card]++;
                this.emit({ type: 'draw', seat: player.id, slot, card: slot === DECK_SLOT ? null : card });
                const name = slot === DECK_SLOT ? '山' : `表の${COLOR_NAMES[card]}`;
                // 表の機関車は1枚で終わり。2枚目を引いたら終わり。2枚目に引けるものがなければ終わり
                if ((slot !== DECK_SLOT && card === LOCO) || this.drewOne) {
                    this.log(this.drewOne
                        ? `${player.name}がカードを2枚引きました（${this.pendingDrawName}・${name}）`
                        : `${player.name}がカードを引きました（${name}）`);
                    return this.endTurn();
                }
                this.drewOne = true;
                this.pendingDrawName = name;
                if (![0, 1, 2, 3, 4, DECK_SLOT].some(s => !this.drawError(s))) {
                    this.log(`${player.name}がカードを1枚引きました（${name}）`);
                    return this.endTurn();
                }
                return;
            }
            case 'claim': {
                const r = ROUTES[command.route];
                const colored = r.len - command.locos;
                if (command.color !== LOCO) {
                    player.hand[command.color] -= colored;
                    for (let i = 0; i < colored; i++) this.discard.push(command.color);
                }
                player.hand[LOCO] -= command.locos;
                for (let i = 0; i < command.locos; i++) this.discard.push(LOCO);
                this.claimed[r.id] = player.id;
                player.routes.push(r.id);
                player.trains -= r.len;
                player.points += ROUTE_POINTS[r.len];
                this.emit({ type: 'claim', seat: player.id, route: r.id });
                this.log(`${player.name}が ${CITIES[r.a].name}–${CITIES[r.b].name}（${r.len}両）を引きました`);
                // 表が空いていて、山に戻ったカードで埋められるなら埋める
                if (this.faceUp.some(c => c === null)) this.refillFaceUp();
                return this.endTurn();
            }
            case 'tickets': {
                player.offered = this.ticketDeck.splice(0, 3);
                this.emit({ type: 'tickets', seat: player.id, count: player.offered.length });
                return;
            }
            case 'pass': {
                this.log(`${player.name}は、できることがなく見送りました`);
                return this.endTurn();
            }
        }
    }

    endTurn() {
        const player = this.players[this.current];
        this.drewOne = false;
        this.pendingDrawName = null;
        this.turnCount++;
        if (this.lastPlayer === this.current) return this.finish();
        if (this.lastPlayer === null && player.trains <= END_TRAINS) {
            this.lastPlayer = this.current;
            this.log(`${player.name}の列車が${player.trains}両になりました。全員があと1回ずつ手番をして終わります`, { head: true });
            this.emit({ type: 'last-round', seat: player.id });
        }
        this.current = (this.current + 1) % this.players.length;
    }

    // ---- 得点 ----

    // 今のまま終わったときの点（目的地の点は、終わるまで本人にしか見えない）
    scores() {
        const longest = this.players.map(p => longestPath(p.routes));
        const best = Math.max(...longest);
        return this.players.map((p, i) => {
            let ticketPlus = 0;
            let ticketMinus = 0;
            let done = 0;
            p.tickets.forEach(id => {
                const t = TICKETS[id];
                if (connected(p.routes, t.a, t.b)) {
                    ticketPlus += t.points;
                    done++;
                } else ticketMinus += t.points;
            });
            const bonus = best > 0 && longest[i] === best ? LONGEST_BONUS : 0;
            return {
                routes: p.points, ticketPlus, ticketMinus, ticketsDone: done, longest: longest[i], bonus,
                total: p.points + ticketPlus - ticketMinus + bonus
            };
        });
    }

    finish() {
        this.phase = 'end';
        this.results = this.scores();
        const r = this.results;
        let tied = this.players.map(p => p.id);
        [(i) => r[i].total, (i) => r[i].ticketsDone, (i) => r[i].bonus].forEach(key => {
            const top = Math.max(...tied.map(key));
            tied = tied.filter(i => key(i) === top);
        });
        this.winners = tied;
        this.emit({ type: 'end', winners: [...tied] });
        this.log(`ゲーム終了。${tied.map(i => this.players[i].name).join('と')}の勝ち（${r[tied[0]].total}点）`, { head: true });
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    }

    log(text, { head = false } = {}) {
        this.logs.push({ n: ++this.logTotal, text, head });
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${i} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}
