/**
 * モダンアート（基本ゲーム、3〜5人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びと最初の人はシードから決まる）
 *
 * 準備：70枚を混ぜ、人数と回に応じて配る（3人 10・6・6・0、4人 9・4・4・0、5人 8・3・3・0）。所持金は1人100
 * 手番：競りを開く人（出す人）が手札から1枚出し、カードの種類の方法で競る。ほかの人が買ったら出した人に払い、
 *       出した人が自分で買ったら銀行に払う。だれも値を付けなければ、出した人が無料でもらう（指値を除く）
 *       次は、出した人の左隣（手札のある人）が出す
 * 回の終わり：ある画家の5枚目が出たら、その回は終わり（5枚目は競らない。ダブルの2枚目が5枚目なら2枚とも競らない）。
 *       全員の手札がなくなったときも終わり（最後に出たカードは競らない）。枚数の多い3人の画家に 30・20・10 を足し、3位までに入った画家の絵を、
 *       これまでの合計の値で銀行に売る。4回で終わり、お金の多い人の勝ち（同点なら勝ちを分け合う）
 *
 * ルールブックで読み方が分かれる点は、次のように決めた（README にも書く）
 * - 公開の競りは、出した人の左から順に（出した人も含めて）「値を上げる」か「降りる」を回す。降りた人は戻れない。
 *   いちばん高い人のほかが全員降りたら終わり（声の早い者勝ちを、順番の形にした）
 * - 値は1以上・自分の所持金まで。指値の値も、出した人の所持金まで（所持金が0なら0）
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, ARTISTS, MIN_PLAYERS, MAX_PLAYERS, START_MONEY, ROUNDS, END_COUNT, DEAL, TYPES } from './cards.js';
import { ranking, paintingValues, addTokens, payout } from './market.js';

export { MIN_PLAYERS, MAX_PLAYERS };
const MAX_LOGS = 400;
const MAX_EVENTS = 40;

export const COMMAND_FIELDS = {
    play: ['card'],
    second: ['card'],
    bid: ['amount'],
    pass: [],
    price: ['amount'],
    buy: []
};

const isInt = (v) => Number.isInteger(v);
const artistOf = (card) => CARDS[card].artist;
const cardName = (card) => `${ARTISTS[artistOf(card)].name}（${TYPES[CARDS[card].type].name}）`;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('人数は3〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        this.deck = shuffle(CARDS.map(c => c.id), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            money: START_MONEY, hand: [], won: []
        }));
        this.round = 1;
        this.tokens = Array.from({ length: ROUNDS }, () => ARTISTS.map(() => 0));
        this.counts = ARTISTS.map(() => 0);   // この回に出た枚数
        this.history = [];                     // 回ごとの結果 { round, rank, values, paid: [席ごとの額] }
        this.lot = null;                       // 競りにかけているカード { cards, seller, first }
        this.auction = null;                   // 競りの途中の状態
        this.last = null;                      // いちばん新しい競りの結果
        this.phase = 'play';                   // play：出す / double：ダブルの2枚目 / auction：競り / end：終わり
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.deal();
        this.auctioneer = Math.floor(this.random() * n);
        this.log(`第1回。${this.players[this.auctioneer].name}から出します`);
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

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人（入札は、まだ握っていない全員が同時に待つ）
    actors() {
        const a = this.auction;
        switch (this.phase) {
            case 'play': return [this.auctioneer];
            case 'double': return [this.lot.offer];
            case 'auction':
                if (a.type === 'sealed') return this.players.map(p => p.id).filter(s => !(s in a.sealed));
                if (a.type === 'fixed' && a.price === null) return [this.lot.seller];
                return [a.turn];
            default: return [];
        }
    }

    // 席 seat の左隣から時計回りの席の並び（seat 自身は含めない）
    after(seat) {
        const n = this.players.length;
        return Array.from({ length: n - 1 }, (_, k) => (seat + 1 + k) % n);
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
            case 'play':
                if (this.phase !== 'play') return '今はカードを出せません';
                if (!player.hand.includes(command.card)) return 'そのカードは持っていません';
                return null;
            case 'second': {
                if (this.phase !== 'double') return '今はダブルの2枚目を出せません';
                if (command.card === null || command.card === undefined) return null;
                if (!player.hand.includes(command.card)) return 'そのカードは持っていません';
                const card = CARDS[command.card];
                if (card.artist !== artistOf(this.lot.cards[0]) || card.type === 'double') return '同じ画家の、ダブルでないカードを出してください';
                return null;
            }
            case 'bid': {
                if (this.phase !== 'auction' || !['open', 'once', 'sealed'].includes(a.type)) return '今は値を付けられません';
                const amount = command.amount;
                if (!isInt(amount)) return '値は整数で';
                if (a.type === 'sealed' && amount === 0) return null;
                if (amount < 1) return '値は1以上で';
                if (amount > player.money) return '所持金より高い値は付けられません';
                if (a.type !== 'sealed' && amount <= a.high) return `${a.high}より高い値を付けてください`;
                return null;
            }
            case 'pass':
                if (this.phase !== 'auction' || a.type === 'fixed' && a.price === null) return '今は降りられません';
                return null;
            case 'price': {
                if (this.phase !== 'auction' || a.type !== 'fixed' || a.price !== null) return '今は値を決められません';
                const amount = command.amount;
                if (!isInt(amount)) return '値は整数で';
                const min = player.money > 0 ? 1 : 0;
                if (amount < min || amount > player.money) return `値は${min}〜${player.money}で`;
                return null;
            }
            case 'buy':
                if (this.phase !== 'auction' || a.type !== 'fixed' || a.price === null) return '今は買えません';
                if (a.price > player.money) return '所持金が足りません';
                return null;
            default:
                return '知らない操作です';
        }
    }

    execute(seat, command) {
        const player = this.players[seat];
        switch (command.type) {
            case 'play': {
                player.hand.splice(player.hand.indexOf(command.card), 1);
                this.lot = { cards: [command.card], seller: seat, first: seat };
                this.emit({ type: 'play', seat, card: command.card });
                this.log(`${player.name}が${cardName(command.card)}を出した`);
                if (this.count(command.card) || this.lastCard()) return;
                if (CARDS[command.card].type === 'double') {
                    this.phase = 'double';
                    this.lot.offer = seat;
                } else this.startAuction(CARDS[command.card].type);
                return;
            }
            case 'second':
                if (command.card === null || command.card === undefined) {
                    this.log(`${player.name}は2枚目を出さない`);
                    const next = (seat + 1) % this.players.length;
                    if (next === this.lot.first) {
                        // だれも足さなければ、最初に出した人が無料でもらう
                        this.resolve(-1, 0);
                    } else this.lot.offer = next;
                    return;
                }
                player.hand.splice(player.hand.indexOf(command.card), 1);
                this.lot.cards.push(command.card);
                this.lot.seller = seat;
                this.emit({ type: 'play', seat, card: command.card });
                this.log(`${player.name}が${cardName(command.card)}を足した`);
                if (this.count(command.card) || this.lastCard()) return;
                this.startAuction(CARDS[command.card].type);
                return;
            case 'bid': this.bid(seat, command.amount); return;
            case 'pass': this.pass(seat); return;
            case 'price':
                this.auction.price = command.amount;
                this.auction.turn = this.auction.order[0];
                this.log(`${player.name}が${command.amount}の値を付けた`);
                return;
            case 'buy':
                this.log(`${player.name}が買う`);
                this.resolve(seat, this.auction.price);
                return;
        }
    }

    // 出たカードを数える。5枚目なら回を終えて true
    count(card) {
        const a = artistOf(card);
        this.counts[a]++;
        if (this.counts[a] < END_COUNT) return false;
        this.log(`${ARTISTS[a].name}の${END_COUNT}枚目が出たので、この回は終わり`);
        this.endRound(this.lot.seller);
        return true;
    }

    // 全員の手札がなくなったら、いま出たカードは競らず（だれのものにもならず）、回を終えて true（CMON 版のルール）
    lastCard() {
        if (this.players.some(p => p.hand.length > 0)) return false;
        this.log('全員の手札がなくなったので、いま出た絵は競らずに、この回は終わり');
        this.endRound(this.lot.seller);
        return true;
    }

    startAuction(type) {
        const seller = this.lot.seller;
        const order = this.after(seller);
        this.phase = 'auction';
        this.auction = { type, high: 0, highBidder: -1, turn: -1, order: [], passed: [], sealed: {}, price: null, acted: [] };
        const a = this.auction;
        if (type === 'open') {
            a.order = [...order, seller];
            a.turn = a.order[0];
        } else if (type === 'once') {
            a.order = [...order, seller];
            a.turn = a.order[0];
        } else if (type === 'fixed') {
            a.order = order;
        }
        this.log(`${TYPES[type].name}の競り`);
    }

    bid(seat, amount) {
        const a = this.auction;
        const name = this.players[seat].name;
        if (a.type === 'sealed') {
            a.sealed[seat] = amount;
            if (Object.keys(a.sealed).length < this.players.length) return;
            // 全員が握ったら開く。同額なら、出した人から時計回りで近い人
            const order = [this.lot.seller, ...this.after(this.lot.seller)];
            const best = Math.max(...order.map(s => a.sealed[s]));
            this.log(`入札：${order.map(s => `${this.players[s].name} ${a.sealed[s] || '−'}`).join('・')}`);
            this.resolve(best > 0 ? order.find(s => a.sealed[s] === best) : -1, best);
            return;
        }
        a.high = amount;
        a.highBidder = seat;
        this.log(`${name}：${amount}`);
        this.advance(seat);
    }

    pass(seat) {
        const a = this.auction;
        if (a.type === 'sealed') {
            this.bid(seat, 0);
            return;
        }
        this.log(`${this.players[seat].name}は降りた`);
        if (a.type === 'fixed') {
            const i = a.order.indexOf(seat);
            if (i + 1 < a.order.length) a.turn = a.order[i + 1];
            else {
                this.log(`だれも買わないので、${this.players[this.lot.seller].name}が買う`);
                this.resolve(this.lot.seller, a.price);
            }
            return;
        }
        a.passed.push(seat);
        this.advance(seat);
    }

    // 公開と一声：次に値を付ける人へ進む。終わっていれば決める
    advance(seat) {
        const a = this.auction;
        if (a.type === 'once') {
            a.acted.push(seat);
            const i = a.order.indexOf(seat);
            if (i + 1 < a.order.length) a.turn = a.order[i + 1];
            else this.resolve(a.highBidder, a.high);
            return;
        }
        // 公開：降りていない人のうち、いちばん高い人のほかがいなくなったら終わり
        const active = a.order.filter(s => !a.passed.includes(s) && s !== a.highBidder);
        if (active.length === 0) {
            this.resolve(a.highBidder, a.high);
            return;
        }
        const n = a.order.length;
        let i = a.order.indexOf(seat);
        for (let k = 0; k < n; k++) {
            i = (i + 1) % n;
            const s = a.order[i];
            if (!a.passed.includes(s) && s !== a.highBidder) { a.turn = s; return; }
        }
    }

    // 競りを決める。winner が -1 なら、出した人（ダブルでだれも足さなければ最初に出した人）が無料でもらう
    resolve(winner, price) {
        const lot = this.lot;
        const seller = lot.seller;
        const taker = winner >= 0 ? winner : seller;
        const paid = winner >= 0 ? price : 0;
        if (paid > 0) {
            this.players[taker].money -= paid;
            if (taker !== seller) this.players[seller].money += paid;
        }
        this.players[taker].won.push(...lot.cards);
        // 入札は、開いた額も残す（開いたあとは全員に見える）
        const bids = this.auction?.type === 'sealed' ? this.players.map(p => this.auction.sealed[p.id] ?? 0) : null;
        this.last = { cards: [...lot.cards], seller, winner: winner >= 0 ? taker : -1, taker, price: paid, type: this.auction?.type ?? 'double', toBank: taker === seller && paid > 0, bids };
        this.emit({ type: 'sold', ...this.last });
        const who = this.players[taker].name;
        if (paid === 0) this.log(`${who}が無料でもらった`);
        else if (taker === seller) this.log(`${who}が${paid}で買った（銀行に払う）`);
        else this.log(`${who}が${paid}で買った（${this.players[seller].name}に払う）`);
        this.lot = null;
        this.auction = null;
        this.nextAuctioneer(seller);
    }

    // seller の左隣から、手札のある人が次に出す。だれもいなければ回を終える
    nextAuctioneer(seller) {
        const next = this.after(seller).concat(seller).find(s => this.players[s].hand.length > 0);
        if (next === undefined) {
            this.log('全員の手札がなくなったので、この回は終わり');
            this.endRound(seller);
            return;
        }
        this.phase = 'play';
        this.auctioneer = next;
    }

    endRound(lastSeller) {
        const rank = ranking(this.counts);
        this.tokens = addTokens(this.tokens, this.round, rank);
        const values = paintingValues(this.tokens, rank);
        const paid = this.players.map(p => {
            const wonCounts = ARTISTS.map((_, a) => p.won.filter(c => artistOf(c) === a).length);
            const amount = payout(wonCounts, values);
            p.money += amount;
            return amount;
        });
        this.history.push({ round: this.round, rank, counts: [...this.counts], values, paid });
        this.emit({ type: 'round', round: this.round, rank, values, paid });
        this.log(`第${this.round}回の順位：${rank.map(a => ARTISTS[a].name).join('・') || 'なし'}`);
        this.players.forEach((p, i) => { if (paid[i]) this.log(`${p.name}が絵を売って${paid[i]}`); });
        this.players.forEach(p => { p.won = []; });
        this.lot = null;
        this.auction = null;
        this.counts = ARTISTS.map(() => 0);
        if (this.round >= ROUNDS) {
            this.finish();
            return;
        }
        this.round++;
        this.deal();
        const next = this.after(lastSeller).concat(lastSeller).find(s => this.players[s].hand.length > 0);
        if (next === undefined) {
            this.log('だれも手札がないので、ゲームは終わり');
            this.finish();
            return;
        }
        this.phase = 'play';
        this.auctioneer = next;
        this.log(`第${this.round}回。${this.players[next].name}から出します`);
    }

    deal() {
        const k = DEAL[this.players.length][this.round - 1];
        for (let i = 0; i < k; i++) this.players.forEach(p => { if (this.deck.length) p.hand.push(this.deck.shift()); });
    }

    finish() {
        this.phase = 'end';
        const best = Math.max(...this.players.map(p => p.money));
        this.winners = this.players.filter(p => p.money === best).map(p => p.id);
        this.log(`終わり。${this.winners.map(i => this.players[i].name).join('・')}の勝ち（${best}）`);
        this.emit({ type: 'end' });
    }

    emit(event) {
        this.events.push({ ...event, seq: ++this.eventSeq });
    }

    log(text) {
        this.logs.push(text);
    }
}
