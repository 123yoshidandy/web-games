/**
 * ブラフ（Bluff、Richard Borg、1993）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（ダイスの目はシードから決まる）
 *
 * 流れ
 * - 各人が5個のダイス（1〜5 と星。星は何の目にもなる）をカップで振って隠す
 * - スタートの人から時計回りに、宣言を上げるか「ブラフ！」と疑う（最初の人は必ず宣言する。パスはない）
 * - 宣言したあと、宣言に合うダイスを見せて（カップの外に出して）、残りを振り直せる（1個はカップに残す）。見せたダイスはラウンドの終わりまでそのまま
 * - 疑ったら全員のダイスを見せて数える
 *   - 宣言より少ない：宣言した人が差の数だけ失う
 *   - 宣言より多い：疑った人が差の数だけ失う
 *   - ぴったり：宣言した人以外の全員が1個ずつ失う
 * - 正しかった側（疑いが当たれば疑った人、外れかぴったりなら宣言した人）が、次のラウンドを始める
 * - ダイスがなくなった人は抜ける。最後の1人が勝ち
 *
 * 設定：reroll（振り直し。既定はあり）、lossOne（Perudo 風に、負けた側が1個だけ失う。ぴったりなら疑った人が1個）
 */

import { createRandom, shuffle } from './random.js';
import { DICE_PER_PLAYER, isRaise, isValidBid, matches, bidText } from './bids.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    bid: ['qty', 'face', 'reveal'],
    challenge: [],
    next: []
};

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, reroll, lossOne }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜6人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, reroll: options.reroll !== false, lossOne: options.lossOne === true };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            dice: Array.from({ length: DICE_PER_PLAYER }, () => ({ value: 1, shown: false }))
        }));
        this.round = 0;
        this.starter = shuffle([...this.players.keys()], this.random)[0];
        this.turn = null;
        this.bid = null;            // 今の宣言 { qty, face, seat }
        this.history = [];          // このラウンドの宣言の流れ（公開）
        this.reveal = null;         // 疑ったあとの結果（公開）
        this.phase = 'bid';         // bid：宣言 / reveal：結果を見せる / end：終わり
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    isOver() {
        return this.phase === 'end';
    }

    alive() {
        return this.players.filter(p => p.dice.length > 0).map(p => p.id);
    }

    actors() {
        if (this.phase === 'bid') return [this.turn];
        if (this.phase === 'reveal') return [this.starter];
        return [];
    }

    // seat の次の、ダイスの残っている人
    nextSeat(seat) {
        const n = this.players.length;
        for (let k = 1; k <= n; k++) {
            const s = (seat + k) % n;
            if (this.players[s].dice.length) return s;
        }
        return seat;
    }

    roll() {
        return 1 + Math.floor(this.random() * 6);
    }

    startRound() {
        this.round += 1;
        this.players.forEach(p => {
            p.dice = p.dice.map(() => ({ value: this.roll(), shown: false }));
        });
        this.bid = null;
        this.history = [];
        this.reveal = null;
        this.turn = this.starter;
        this.phase = 'bid';
        this.emit({ type: 'round', round: this.round });
        this.log(`ラウンド${this.round}（${this.players[this.starter].name}から）`);
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(playerId)) return this.fail('今は操作できません');
        const recorded = { type: command.type };
        try {
            COMMAND_FIELDS[command.type].forEach(key => {
                if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
            });
        } catch {
            return this.fail('今はその操作はできません');
        }
        const ok = { bid: () => this.placeBid(playerId, command), challenge: () => this.challenge(playerId), next: () => this.next() }[command.type]();
        if (!ok) return false;
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    placeBid(seat, { qty, face, reveal }) {
        if (this.phase !== 'bid') return this.fail('今は宣言できません');
        const bid = { qty, face };
        if (!isValidBid(bid)) return this.fail('その宣言はできません');
        if (!isRaise(this.bid, bid)) return this.fail('今の宣言より上にします');
        const p = this.players[seat];
        // 振り直し：宣言に合うカップの中のダイスを見せ、残りを振り直す（1個はカップに残す）
        let shownNow = [];
        if (reveal !== undefined && reveal !== null) {
            if (!this.options.reroll) return this.fail('振り直しはできません');
            if (!Array.isArray(reveal) || !reveal.length || new Set(reveal).size !== reveal.length) return this.fail('見せるダイスを選びます');
            if (!reveal.every(i => Number.isInteger(i) && p.dice[i] && !p.dice[i].shown && matches(p.dice[i].value, face))) return this.fail('宣言に合う、カップの中のダイスだけを見せられます');
            const inCup = p.dice.filter(d => !d.shown).length;
            if (inCup - reveal.length < 1) return this.fail('1個はカップに残します');
            shownNow = reveal;
        }
        this.bid = { qty, face, seat };
        this.history.push({ seat, qty, face, reroll: shownNow.length > 0 });
        this.emit({ type: 'bid', seat, qty, face });
        this.log(`${p.name}：${bidText(bid)}`);
        if (shownNow.length) {
            shownNow.forEach(i => { p.dice[i].shown = true; });
            p.dice.forEach(d => { if (!d.shown) d.value = this.roll(); });
            this.emit({ type: 'reroll', seat, shown: shownNow.length });
            this.log(`${p.name}が${shownNow.length}個を見せて、残りを振り直した`);
        }
        this.turn = this.nextSeat(seat);
        return true;
    }

    challenge(seat) {
        if (this.phase !== 'bid') return this.fail('今は疑えません');
        if (!this.bid) return this.fail('最初は宣言します');
        const bid = this.bid;
        const bidder = bid.seat;
        const count = this.players.reduce((s, p) => s + p.dice.filter(d => matches(d.value, bid.face)).length, 0);
        const losses = {};
        const lose = (s, n) => { losses[s] = (losses[s] ?? 0) + n; };
        let winner;
        if (count < bid.qty) {
            lose(bidder, this.options.lossOne ? 1 : bid.qty - count);
            winner = seat;
        } else if (count > bid.qty) {
            lose(seat, this.options.lossOne ? 1 : count - bid.qty);
            winner = bidder;
        } else {
            if (this.options.lossOne) lose(seat, 1);
            else this.alive().filter(s => s !== bidder).forEach(s => lose(s, 1));
            winner = bidder;
        }
        this.reveal = {
            bid: { ...bid },
            challenger: seat,
            count,
            dice: this.players.map(p => p.dice.map(d => ({ ...d }))),
            losses: { ...losses }
        };
        this.log(`${this.players[seat].name}：ブラフ！　${bidText(bid)} に対して ${count}個`);
        Object.entries(losses).forEach(([s, n]) => {
            const p = this.players[s];
            const lost = Math.min(n, p.dice.length);
            p.dice.splice(p.dice.length - lost, lost);
            this.log(`${p.name}が${lost}個を失った${p.dice.length ? '' : '（脱落）'}`);
        });
        this.emit({ type: 'challenge', seat, bidder, count, losses: { ...losses } });
        this.starter = winner;
        const alive = this.alive();
        if (alive.length <= 1) {
            this.phase = 'end';
            this.winners = alive;
            this.emit({ type: 'end', winners: [...alive] });
            this.log(`${alive.map(s => this.players[s].name).join('')}の勝ち`);
        } else {
            this.phase = 'reveal';
        }
        return true;
    }

    next() {
        if (this.phase !== 'reveal') return this.fail('今は次へ進めません');
        this.startRound();
        return true;
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

