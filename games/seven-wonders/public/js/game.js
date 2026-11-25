/**
 * 世界の七不思議（基本ゲーム・第1版）のゲーム本体
 * DOM に依存しない。操作は applyCommand(seat, command) の 1 か所から受け付け、受け付けた操作だけを commands に記録する
 * Game.replay(players, options, commands) で、同じ状態を作り直せる（配るカードもシード付きの乱数）
 *
 * 全員が同時に 1 枚を選ぶ。選んだ中身は、全員がそろって公開するまで、本人にしか見えない
 *
 * 操作：
 *   { type: 'play', card, action, pay, free }  手札の card（id）を、action：'build' 建てる / 'wonder' 不思議の段階 / 'discard' 捨てて 3 コイン
 *        pay：{ left, right } 隣に払うコイン（払い方の候補のどれか）、free：'chain' 連鎖 / 'olympia' オリンピアの無料の建設
 *   { type: 'discardBuild', card }  ハリカルナッソス：捨て札から無料で建てる（card が null なら建てない）
 */

import { createRandom, createSeed, shuffle } from './random.js';
import { WONDERS, GUILDS, ageCards, cardOf, keyOf } from './cards.js';
import {
    leftOf, rightOf, stagesOf, hasEffect, hasBuilt, hasSameName, paymentOptions, gainOf, scoreOf, militaryResults
} from './city.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;
const EVENT_KEEP = 200;

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, sides: 'A' | 'B' | 'random', cpuLevel }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        const seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { sides: 'A', ...options, seed };
        this.random = createRandom(seed);
        const wonders = shuffle([...WONDERS], this.random).slice(0, players.length);
        this.players = players.map((p, id) => ({ id, name: p.name, isCPU: !!p.isCPU }));
        this.cities = wonders.map(w => ({
            wonder: w.key,
            side: this.options.sides === 'random' ? (this.random() < 0.5 ? 'A' : 'B') : this.options.sides,
            built: [], stages: 0, coins: 3, tokens: [], defeats: 0, freeBuildAge: null
        }));
        this.discardPile = [];
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.scores = null;
        this.startAge(1);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ seat, command }, i) => {
            if (!game.applyCommand(seat, command)) throw new Error(`記録の ${i} 番目の操作を再現できません：${game.lastError}`);
        });
        return game;
    }

    get n() {
        return this.players.length;
    }

    isOver() {
        return this.phase === 'end';
    }

    addEvent(event) {
        this.eventSeq++;
        this.events.push({ seq: this.eventSeq, age: this.age, turn: this.turn, ...event });
        if (this.events.length > EVENT_KEEP) this.events.splice(0, this.events.length - EVENT_KEEP);
    }

    // ---------- 時代と手番 ----------

    startAge(age) {
        this.age = age;
        let deck = ageCards(age, this.n);
        if (age === 3) deck = deck.concat(shuffle([...GUILDS], this.random).slice(0, this.n + 2).map(k => `${k}#g`));
        shuffle(deck, this.random);
        this.hands = this.players.map((_, i) => deck.slice(i * 7, i * 7 + 7));
        this.turn = 1;
        this.addEvent({ type: 'age', age });
        this.beginChoose(this.players.map(p => p.id));
    }

    beginChoose(seats) {
        this.phase = 'choose';
        this.waiting = [...seats];
        this.pending = {};
    }

    // 第1・第3時代は左へ、第2時代は右へ手札を渡す
    passHands() {
        const next = this.players.map(() => []);
        this.hands.forEach((hand, seat) => {
            const to = this.age === 2 ? rightOf(seat, this.n) : leftOf(seat, this.n);
            next[to] = hand;
        });
        this.hands = next;
    }

    // ---------- 判定 ----------

    // 建てられるか（建てられる方法：{ free: 'chain' | 'olympia' | null, options: [{ left, right }] }。建てられなければ null）
    buildOptions(seat, id) {
        const city = this.cities[seat];
        if (hasSameName(city, id)) return null;
        const c = cardOf(id);
        if ((c.chain ?? []).some(k => hasBuilt(city, k))) return { free: 'chain', options: [{ left: 0, right: 0 }] };
        const affordable = paymentOptions(this.cities, seat, c.cost).filter(o => c.coins + o.left + o.right <= city.coins);
        const olympia = hasEffect(city, 'freeBuild') && city.freeBuildAge !== this.age;
        if (affordable.length === 0 && !olympia) return null;
        return { free: null, options: affordable, olympia };
    }

    wonderOptions(seat) {
        const city = this.cities[seat];
        const stage = stagesOf(city)[city.stages];
        if (!stage) return null;
        const options = paymentOptions(this.cities, seat, stage.cost).filter(o => o.left + o.right <= city.coins);
        return options.length ? options : null;
    }

    validate(seat, command) {
        if (!command || typeof command !== 'object') return '操作の形が正しくありません';
        if (this.phase === 'end') return 'ゲームは終わっています';
        if (command.type === 'discardBuild') {
            if (this.phase !== 'discardBuild' || seat !== this.special) return '今は選べません';
            if (command.card === null) return null;
            if (!this.discardPile.includes(command.card)) return '捨て札にないカードです';
            if (hasSameName(this.cities[seat], command.card)) return '同じ建物は建てられません';
            return null;
        }
        if (command.type !== 'play') return '知らない操作です';
        if (this.phase !== 'choose' || !this.waiting.includes(seat)) return '今は選べません';
        if (this.pending[seat]) return 'もう選んでいます';
        if (!this.hands[seat].includes(command.card)) return '手札にないカードです';
        const pay = command.pay ?? { left: 0, right: 0 };
        const samePay = o => o.left === pay.left && o.right === pay.right;
        if (command.action === 'discard') return null;
        if (command.action === 'wonder') {
            const options = this.wonderOptions(seat);
            if (!options) return '不思議の段階を建てられません';
            return options.some(samePay) ? null : 'その払い方はできません';
        }
        if (command.action !== 'build') return '知らない操作です';
        const how = this.buildOptions(seat, command.card);
        if (!how) return 'その建物は建てられません';
        if (command.free === 'chain') return how.free === 'chain' ? null : '無料では建てられません';
        if (command.free === 'olympia') return how.olympia ? null : '無料の建設は使えません';
        if (how.free === 'chain') return pay.left === 0 && pay.right === 0 ? null : '払う必要はありません';
        return how.options.some(samePay) ? null : 'その払い方はできません';
    }

    applyCommand(seat, command) {
        this.lastError = this.validate(seat, command);
        if (this.lastError) return false;
        if (command.type === 'discardBuild') {
            const clean = { type: 'discardBuild', card: command.card };
            this.commands.push({ seat, command: clean });
            this.discardBuild(seat, clean.card);
            return true;
        }
        const pay = command.action === 'discard' ? { left: 0, right: 0 } : { left: command.pay?.left ?? 0, right: command.pay?.right ?? 0 };
        const how = command.action === 'build' ? this.buildOptions(seat, command.card) : null;
        const free = command.action === 'build' ? (command.free === 'olympia' ? 'olympia' : how.free) : null;
        const clean = { type: 'play', card: command.card, action: command.action, pay, free };
        this.commands.push({ seat, command: clean });
        this.pending[seat] = clean;
        this.addEvent({ type: 'chosen', seat });
        if (this.waiting.every(s => this.pending[s])) this.resolveTurn();
        return true;
    }

    // ---------- 公開と建設 ----------

    resolveTurn() {
        const income = this.players.map(() => 0);
        const reveal = [];
        const built = [];
        const discardBuilders = [];
        this.waiting.forEach(seat => {
            const choice = this.pending[seat];
            const city = this.cities[seat];
            this.hands[seat].splice(this.hands[seat].indexOf(choice.card), 1);
            if (choice.action === 'discard') {
                city.coins += 3;
                this.discardPile.push(choice.card);
            } else {
                const coinCost = choice.action === 'build' && !choice.free ? cardOf(choice.card).coins : 0;
                city.coins -= coinCost + choice.pay.left + choice.pay.right;
                income[leftOf(seat, this.n)] += choice.pay.left;
                income[rightOf(seat, this.n)] += choice.pay.right;
                if (choice.action === 'build') {
                    city.built.push(choice.card);
                    built.push({ seat, card: choice.card });
                    if (choice.free === 'olympia') city.freeBuildAge = this.age;
                } else {
                    const stage = stagesOf(city)[city.stages];
                    city.stages++;
                    city.coins += stage.coins ?? 0;
                    if (stage.effect === 'buildDiscard') discardBuilders.push(seat);
                }
            }
            reveal.push({ seat, ...choice, card: choice.card });
        });
        // 建てたカードのコイン（全員が置いたあとで数える）と、交易で受け取ったコイン
        built.forEach(({ seat, card }) => { this.cities[seat].coins += gainOf(this.cities, seat, card); });
        income.forEach((coins, seat) => { this.cities[seat].coins += coins; });
        this.addEvent({ type: 'reveal', choices: reveal, income });
        this.pending = {};
        // 6 手番目：残りの 1 枚を隣に渡してから捨てる（バビロン B の人は 7 枚目を使える）
        // ハリカルナッソスは、この手番に捨てられたカード（7 枚目を含む）からも選べる（ルールブックの説明）
        if (!this.lastCardTurn && this.turn === 6) this.discardLastCards();
        this.specialQueue = discardBuilders;
        this.nextSpecial();
    }

    discardLastCards() {
        this.passHands();
        this.players.forEach(p => {
            if (!hasEffect(this.cities[p.id], 'playLast')) this.discardPile.push(...this.hands[p.id].splice(0));
        });
    }

    // ハリカルナッソス：捨て札に建てられるカードがあれば、その人が選ぶ
    nextSpecial() {
        while (this.specialQueue.length > 0) {
            const seat = this.specialQueue.shift();
            if (this.discardPile.some(id => !hasSameName(this.cities[seat], id))) {
                this.phase = 'discardBuild';
                this.special = seat;
                this.waiting = [seat];
                return;
            }
        }
        this.special = null;
        this.afterTurn();
    }

    discardBuild(seat, card) {
        if (card !== null) {
            this.discardPile.splice(this.discardPile.indexOf(card), 1);
            this.cities[seat].built.push(card);
            this.cities[seat].coins += gainOf(this.cities, seat, card);
        }
        this.addEvent({ type: 'discardBuild', seat, card });
        this.nextSpecial();
    }

    afterTurn() {
        // 7 枚目を使う手番（バビロン B）が終わったら、時代の終わり
        if (this.lastCardTurn) {
            this.lastCardTurn = false;
            this.endAge();
            return;
        }
        if (this.turn < 6) {
            this.turn++;
            this.passHands();
            this.beginChoose(this.players.map(p => p.id));
            return;
        }
        // 6 手番が終わった（残りの 1 枚は resolveTurn で捨ててある）。バビロン B の人は、7 枚目を使える
        const babylon = this.players.map(p => p.id).filter(s => this.hands[s].length > 0);
        if (babylon.length > 0) {
            this.turn = 7;
            this.lastCardTurn = true;
            this.beginChoose(babylon);
            return;
        }
        this.endAge();
    }

    endAge() {
        this.players.forEach(p => this.discardPile.push(...this.hands[p.id].splice(0)));
        const results = militaryResults(this.cities, this.age);
        results.forEach((pair, seat) => pair.forEach(r => {
            if (r.result === 'win') this.cities[seat].tokens.push(r.points);
            if (r.result === 'lose') this.cities[seat].defeats++;
        }));
        this.addEvent({ type: 'military', results });
        if (this.age < 3) this.startAge(this.age + 1);
        else this.finish();
    }

    finish() {
        this.phase = 'end';
        this.waiting = [];
        this.scores = this.players.map(p => scoreOf(this.cities, p.id));
        this.addEvent({ type: 'end', scores: this.scores, ranking: this.ranking() });
    }

    // 順位：点の合計、同じならコインの多い人。それも同じなら同じ順位
    ranking() {
        const key = s => [this.scores[s].total, this.cities[s].coins];
        const seats = this.players.map(p => p.id).sort((a, b) => key(b)[0] - key(a)[0] || key(b)[1] - key(a)[1] || a - b);
        return seats.map(seat => ({
            seat, total: this.scores[seat].total, coins: this.cities[seat].coins,
            rank: 1 + seats.filter(s => key(s)[0] > key(seat)[0] || (key(s)[0] === key(seat)[0] && key(s)[1] > key(seat)[1])).length
        }));
    }

    winners() {
        return this.isOver() ? this.ranking().filter(r => r.rank === 1).map(r => r.seat) : [];
    }
}

export { keyOf };
