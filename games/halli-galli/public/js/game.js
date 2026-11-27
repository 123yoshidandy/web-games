/**
 * ハリガリのルールと状態（DOM に依存しない。ブラウザ・サーバー・テストで同じものを使う）
 *
 * カードは 56 枚。果物（いちご・バナナ・ライム・プラム）ごとに 14 枚で、果物の数は 1 が5枚・2 が3枚・3 が3枚・4 が2枚・5 が1枚
 * 全部を裏のまま配り、手番の順に、自分の山札の一番上を表にして自分の前の表の山に重ねる
 * 表の山の一番上のカードを全部見て、どれかの果物がちょうど5つなら、ベルを先に鳴らした人が表のカードを全部もらう（山札の下へ）
 * 5つでないのに鳴らしたら、ほかの全員に1枚ずつ払う
 * 山札が要るとき（めくる番が来た・払う）に山札がなければ脱落。その人の表の山は「場の山」に移り、次にベルを当てた人がもらう
 * 残りが1人になるか、時間切れで終わる。時間切れなら、山札と表の山の枚数の多い人の勝ち
 *
 * 早さを競うゲームなので、操作には時刻 t（対戦の始まりからのミリ秒）が付く。時刻は記録に入り、記録から同じ展開を再現できる
 * ロジックは時計を見ない。t は操作を送る側（ローカルの時計・サーバーの時計）が決める
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）
 */

import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const FRUITS = ['strawberry', 'banana', 'lime', 'plum'];
export const FRUIT_NAMES = ['いちご', 'バナナ', 'ライム', 'プラム'];
export const COUNTS = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]; // 果物ごとの 14 枚の、果物の数
export const DECK_SIZE = FRUITS.length * COUNTS.length;
export const TARGET = 5;                // ちょうどこの数でベル
export const BELL_PAUSE_MS = 1500;      // ベルが当たったあと、次に自動でめくるまでの間
export const WRONG_LOCK_MS = 800;       // まちがえたあと、この間は鳴らせない（続けて押したときの空振りを防ぐ）
export const MODES = ['practice', 'cpu', 'online'];
export const LEVELS = ['easy', 'normal', 'hard'];
// めくる間隔（自動でめくる人の、手番が来てからめくるまで）
export const SPEEDS = { slow: 2000, normal: 1500, fast: 1000 };
// 時間の制限
export const TIME_LIMITS = { short: 180000, normal: 300000, long: 600000 };
const LOG_LIMIT = 200;

export const cardFruit = card => Math.floor(card / COUNTS.length);
export const cardCount = card => COUNTS[card % COUNTS.length];
export const cardLabel = card => `${FRUIT_NAMES[cardFruit(card)]} ${cardCount(card)}`;

// 見えているカード（null は表の山がない）の、果物ごとの数
export function fruitTotals(tops) {
    const totals = FRUITS.map(() => 0);
    for (const card of tops) if (card !== null && card !== undefined) totals[cardFruit(card)] += cardCount(card);
    return totals;
}

// ちょうど5つの果物（番号の一覧。なければ空）
export const fiveFruits = tops => fruitTotals(tops).flatMap((total, fruit) => (total === TARGET ? [fruit] : []));

export default class Game {
    // players: [{ name, isCPU, auto? }]、options: { seed, mode, level, speed, timeLimit, stopWhenHumansOut }
    constructor(players, { seed = 1, mode = 'cpu', level = 'normal', speed = 'normal', timeLimit = 'normal', stopWhenHumansOut = false } = {}) {
        if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
            throw new Error('人数が正しくありません');
        }
        this.seed = seed >>> 0;
        this.mode = MODES.includes(mode) ? mode : 'cpu';
        this.level = LEVELS.includes(level) ? level : 'normal';
        this.speed = speed in SPEEDS ? speed : 'normal';
        this.timeLimit = timeLimit in TIME_LIMITS ? timeLimit : 'normal';
        this.stopWhenHumansOut = Boolean(stopWhenHumansOut);
        this.players = players.map((player, seat) => ({
            seat,
            name: String(player.name ?? `P${seat + 1}`),
            isCPU: Boolean(player.isCPU),
            auto: Boolean(player.auto),   // 人の自動めくり（CPU はいつも自動）
            deck: [],                     // 裏の山札（末尾が一番上。もらったカードは先頭＝一番下に入れる）
            pile: [],                     // 表の山（末尾が一番上）
            out: false,
            outAt: null,
            outOrder: 0,                  // 脱落した順（1から）
            bells: 0,
            misses: 0,
            lockUntil: 0,
            rangVersion: -1               // 最後に鳴らしたときの場の版（CPU は同じ場で2回鳴らさない）
        }));
        const random = createRandom(this.seed);
        const cards = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i), random);
        cards.forEach((card, i) => this.players[i % this.players.length].deck.push(card));
        this.outCount = 0;
        this.pot = [];                    // 脱落した人の表の山（裏のまま。次にベルを当てた人がもらう）
        this.turn = 0;
        this.turnStartedAt = 0;
        this.pauseUntil = 0;
        this.tableVersion = 0;            // 見えているカードが変わるたびに増える
        this.changedAt = 0;               // 見えているカードが最後に変わった時刻
        this.lastT = 0;                   // 最後の操作の時刻（記録の時刻は減らない）
        this.phase = 'play';
        this.endT = null;
        this.commands = [];
        this.logs = [];
        this.events = [];                 // 起きたこと（画面の演出と音が拾う）。{ id, type, seat?, t, ... }
        this.eventCount = 0;
        this.lastError = null;
        this.result = null;
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const entry of commands) {
            const { seat, ...command } = entry;
            if (!game.applyCommand(seat, command)) {
                throw new Error(`記録を再現できません（${game.commands.length + 1} 手目：${game.lastError}）`);
            }
        }
        return game;
    }

    get isOver() {
        return this.phase === 'end';
    }

    get interval() {
        return SPEEDS[this.speed];
    }

    get limitMs() {
        return TIME_LIMITS[this.timeLimit];
    }

    // 見えているカード（席の順。表の山がなければ null）
    tops() {
        return this.players.map(player => (player.pile.length ? player.pile[player.pile.length - 1] : null));
    }

    fives() {
        return fiveFruits(this.tops());
    }

    alive() {
        return this.players.filter(player => !player.out);
    }

    // 席が自動でめくるか（CPU はいつも自動）
    autoFlips(seat) {
        const player = this.players[seat];
        return Boolean(player) && (player.isCPU || player.auto);
    }

    // 手番の人が自動でめくる時刻（自動でなければ Infinity）
    flipDue() {
        if (this.isOver || !this.autoFlips(this.turn)) return Infinity;
        return Math.max(this.turnStartedAt + this.interval, this.pauseUntil, this.lastT);
    }

    // ===== 操作 =====

    // command: { type: 'flip', t } / { type: 'ring', t, version? } / { type: 'auto', on, t } / { type: 'timeup', t }
    applyCommand(seat, command) {
        this.lastError = null;
        const player = Number.isInteger(seat) ? this.players[seat] : null;
        if (!player) return this.fail('席が正しくありません');
        if (this.phase !== 'play') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object') return this.fail('今はその操作はできません');
        const rawT = command.t;
        if (typeof rawT !== 'number' || !Number.isFinite(rawT) || rawT < 0) return this.fail('時刻が正しくありません');
        const t = Math.max(Math.round(rawT), this.lastT);

        switch (command.type) {
            case 'flip': return this.flip(player, t);
            case 'ring': return this.ring(player, command.version, t);
            case 'auto': return this.setAuto(player, command.on, t);
            case 'timeup': return this.timeup(player, t);
            default: return this.fail('今はその操作はできません');
        }
    }

    flip(player, t) {
        if (player.out) return this.fail('もう脱落しています');
        if (this.turn !== player.seat) return this.fail('あなたの番ではありません');
        if (player.deck.length === 0) return this.fail('山札がありません');
        this.record(player.seat, { type: 'flip', t });
        const card = player.deck.pop();
        player.pile.push(card);
        this.tableChanged(t);
        this.emit({ type: 'flip', seat: player.seat, card, t });
        this.advanceTurn(player.seat, t);
        return true;
    }

    // version：鳴らした人が見ていた場の版。見ていた場から変わっていて、今は5つでなければ、罰なしで断る
    ring(player, version, t) {
        if (player.out) return this.fail('もう脱落しています');
        if (t < player.lockUntil) return this.fail('少し待ってから鳴らせます');
        const fives = this.fives();
        const stale = Number.isInteger(version) && version !== this.tableVersion;
        if (stale && fives.length === 0) return this.fail('間に合いませんでした');
        this.record(player.seat, Number.isInteger(version) ? { type: 'ring', version, t } : { type: 'ring', t });
        player.rangVersion = this.tableVersion;
        if (fives.length > 0) {
            const cards = [];
            for (const other of this.players) {
                cards.push(...other.pile);
                other.pile = [];
            }
            cards.push(...this.pot);
            this.pot = [];
            player.deck.unshift(...cards);
            player.bells += 1;
            this.log(`${player.name}：ベル！ ${fives.map(fruit => FRUIT_NAMES[fruit]).join('と')}が5つ。${cards.length}枚をもらう`);
            this.emit({ type: 'ring', seat: player.seat, ok: true, fruits: fives, gained: cards.length, t });
            this.tableChanged(t);
            this.turn = player.seat;
            this.turnStartedAt = t;
            this.pauseUntil = t + BELL_PAUSE_MS;
            return true;
        }

        player.misses += 1;
        player.lockUntil = t + WRONG_LOCK_MS;
        let paid = 0;
        for (let i = 1; i < this.players.length; i++) {
            const other = this.players[(player.seat + i) % this.players.length];
            if (other.out) continue;
            if (player.deck.length === 0) break;
            other.deck.unshift(player.deck.pop());
            paid += 1;
        }
        this.log(`${player.name}：まちがえてベル。${paid}枚を払う`);
        this.emit({ type: 'ring', seat: player.seat, ok: false, paid, t });
        if (player.deck.length === 0) {
            this.eliminate(player, t);
            if (this.turn === player.seat) this.advanceTurn(player.seat, t);
            else this.checkEnd(t);
        }
        return true;
    }

    // 人の自動めくりの切り替え（記録に入る。自動でめくる時刻が変わるため）
    setAuto(player, on, t) {
        if (player.isCPU) return this.fail('今はその操作はできません');
        if (typeof on !== 'boolean') return this.fail('今はその操作はできません');
        if (player.auto === on) return this.fail('もうその設定です');
        this.record(player.seat, { type: 'auto', on, t });
        player.auto = on;
        // 自動にしたら、そのときからめくる間隔を数える
        if (on && this.turn === player.seat) this.turnStartedAt = Math.max(this.turnStartedAt, t);
        return true;
    }

    // 時間切れ（時刻が制限を過ぎていなければ断る。どの席から送っても同じ）
    timeup(player, t) {
        if (t < this.limitMs) return this.fail('まだ時間があります');
        this.record(player.seat, { type: 'timeup', t });
        this.log('時間切れ');
        this.finish(t, 'time');
        return true;
    }

    // ===== 進行 =====

    // from の次の、脱落していない人へ手番を渡す。山札のない人は、手番が来たところで脱落する
    advanceTurn(from, t) {
        const count = this.players.length;
        for (let i = 1; i <= count; i++) {
            const seat = (from + i) % count;
            const player = this.players[seat];
            if (player.out) continue;
            if (player.deck.length === 0) {
                this.eliminate(player, t);
                continue;
            }
            this.turn = seat;
            this.turnStartedAt = t;
            break;
        }
        this.checkEnd(t);
    }

    eliminate(player, t) {
        player.out = true;
        player.outAt = t;
        this.outCount += 1;
        player.outOrder = this.outCount;
        const had = player.pile.length;
        this.pot.push(...player.pile);
        player.pile = [];
        if (had) this.tableChanged(t);
        this.log(`${player.name}：カードがなくなり脱落`);
        this.emit({ type: 'out', seat: player.seat, t });
    }

    checkEnd(t) {
        if (this.isOver) return;
        const alive = this.alive();
        if (alive.length <= 1) {
            this.finish(t, 'last');
            return;
        }
        // ローカルの CPU 対戦：人が全員脱落したら、残りを待たずに終わる
        if (this.stopWhenHumansOut && this.players.some(player => !player.isCPU) && alive.every(player => player.isCPU)) {
            this.finish(t, 'humansOut');
            return;
        }
        // 山札のない人しか残っていなければ、誰もめくれないので終わる
        if (alive.every(player => player.deck.length === 0)) this.finish(t, 'stuck');
    }

    tableChanged(t) {
        this.tableVersion += 1;
        this.changedAt = t;
    }

    // 順位：残っている人は枚数の多い順（同じ枚数は同じ順位）、脱落した人は後に脱落した順
    finish(t, reason) {
        this.phase = 'end';
        this.endT = t;
        const cardsOf = player => (player.out ? 0 : player.deck.length + player.pile.length);
        const order = [...this.players].sort((a, b) => {
            if (a.out !== b.out) return a.out ? 1 : -1;
            if (!a.out) return cardsOf(b) - cardsOf(a) || a.seat - b.seat;
            return b.outOrder - a.outOrder;
        });
        const standings = order.map(player => ({
            seat: player.seat,
            cards: cardsOf(player),
            bells: player.bells,
            misses: player.misses,
            out: player.out,
            rank: 0
        }));
        standings.forEach((entry, i) => {
            const previous = standings[i - 1];
            entry.rank = previous && !entry.out && !previous.out && previous.cards === entry.cards ? previous.rank : i + 1;
        });
        this.result = {
            time: t,
            reason,
            standings,
            winners: standings.filter(entry => entry.rank === 1).map(entry => entry.seat)
        };
        const why = { last: '残りが1人になった', time: '時間切れ', humansOut: 'あなたが脱落した', stuck: '誰もめくれない' }[reason] ?? '';
        this.log(`終わり（${why}）`);
        this.emit({ type: 'end', reason, t });
    }

    // ===== 記録 =====

    record(seat, command) {
        this.commands.push({ seat, ...command });
        this.lastT = command.t;
    }

    emit(event) {
        this.eventCount += 1;
        this.events.push({ id: this.eventCount, ...event });
        if (this.events.length > 30) this.events.shift();
    }

    log(text) {
        this.logs.push(text);
        if (this.logs.length > LOG_LIMIT) this.logs.shift();
    }

    fail(message) {
        this.lastError = message;
        return false;
    }
}
