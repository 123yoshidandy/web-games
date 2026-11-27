/**
 * ドブル（タワー）のルールと状態（DOM に依存しない。ブラウザ・サーバー・テストで同じものを使う）
 *
 * 55 枚を切り、全員に1枚ずつ表向きで配る（自分の山の一番上）。残りは表向きの山にして真ん中に置く
 * 自分の一番上のカードと、真ん中の山の一番上のカードに共通するマークを見つけてタップすると、
 * 真ん中のカードを取って自分の山に重ねる（取ったカードが、新しい自分の一番上になる）
 * 真ん中の山がなくなったら終わり。取った枚数（点）の多い人の勝ち
 * 1人で遊ぶ「タイムアタック」は、同じ流れで真ん中の山を取り切るまでのタイムを競う
 *
 * 早い者勝ちのゲームなので、操作には時刻 t（対戦の始まりからのミリ秒）が付く。時刻は記録に入り、記録から同じ展開を再現できる
 * ロジックは時計を見ない。t は操作を送る側（ローカルの時計・サーバーの時計）が決める
 * 取る操作には、見ていた真ん中のカード（center）を付ける。もう取られていたら、まちがいにせず断る（「先に取られました」）
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, DECK_SIZE, SYMBOL_COUNT, SYMBOL_NAMES, commonSymbol, cardHas } from './deck.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const LOCK_MS = 2000;       // 違うマークをタップしたら、この間は取れない
export const HINT_COST = 1;        // 対戦でヒントを使うと1点減らす（0 より下にはしない）
export const HINT_TIME_MS = 5000;  // タイムアタックでヒントを使うと、タイムに5秒足す
export const MODES = ['solo', 'cpu', 'online'];
export const LEVELS = ['easy', 'normal', 'hard'];
export const LATE = '先に取られました';
const LOG_LIMIT = 200;

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, mode, level }
    constructor(players, { seed = 1, mode = 'solo', level = 'normal' } = {}) {
        if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
            throw new Error('人数が正しくありません');
        }
        this.seed = seed >>> 0;
        this.mode = MODES.includes(mode) ? mode : 'solo';
        this.level = LEVELS.includes(level) ? level : 'normal';
        const random = createRandom(this.seed);
        // 真ん中の山（配列の最後が一番上）
        this.pile = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i), random);
        this.players = players.map((player, seat) => ({
            seat,
            name: String(player.name ?? `P${seat + 1}`),
            isCPU: Boolean(player.isCPU),
            top: this.pile.pop(),  // 自分の山の一番上
            taken: 0,              // 真ん中から取った枚数
            score: 0,
            wrong: 0,
            hints: 0,
            lockUntil: 0
        }));
        this.version = 0;     // 真ん中のカードが変わった回数（取られるたびに1つ進む）
        this.changedAt = 0;   // 真ん中のカードが最後に変わった時刻
        this.lastT = 0;       // 最後の操作の時刻（記録の時刻は減らない）
        this.phase = 'play';
        this.endT = null;
        this.commands = [];
        this.logs = [];
        this.events = [];     // 起きたこと（画面の演出と音が拾う）。{ id, type, seat?, card?, symbol?, t }
        this.eventCount = 0;
        this.hintMarks = {};  // 席ごとのヒント { [seat]: { version, symbol } }
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

    // 真ん中の山の一番上（なければ null）
    get center() {
        return this.pile.length ? this.pile[this.pile.length - 1] : null;
    }

    // ===== 操作 =====

    // command: { type: 'claim', symbol, center, t } / { type: 'hint', t }
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
            case 'claim': return this.claim(player, command.symbol, command.center, t);
            case 'hint': return this.hint(player, t);
            default: return this.fail('今はその操作はできません');
        }
    }

    claim(player, symbol, center, t) {
        if (!Number.isInteger(symbol) || symbol < 0 || symbol >= SYMBOL_COUNT) return this.fail('マークが正しくありません');
        if (!Number.isInteger(center)) return this.fail('カードが正しくありません');
        if (center !== this.center) return this.fail(LATE);
        if (!cardHas(center, symbol) && !cardHas(player.top, symbol)) return this.fail('そのマークはカードにありません');
        if (t < player.lockUntil) return this.fail('少し待ってから取れます');

        this.record(player.seat, { type: 'claim', symbol, center, t });
        if (!cardHas(center, symbol) || !cardHas(player.top, symbol)) {
            player.wrong += 1;
            player.lockUntil = t + LOCK_MS;
            this.log(`${player.name}：${SYMBOL_NAMES[symbol]}は違います`);
            this.emit({ type: 'wrong', seat: player.seat, symbol, t });
            return true;
        }

        this.pile.pop();
        player.top = center;
        player.taken += 1;
        player.score += 1;
        this.version += 1;
        this.changedAt = t;
        this.log(`${player.name}：${SYMBOL_NAMES[symbol]}で取った`);
        this.emit({ type: 'take', seat: player.seat, card: center, symbol, t });
        if (this.pile.length === 0) this.finish(t);
        return true;
    }

    hint(player, t) {
        const given = this.hintMarks[player.seat];
        if (given && given.version === this.version) return this.fail('ヒントはもう出ています');
        const symbol = commonSymbol(player.top, this.center);
        if (symbol === null) return this.fail('今はヒントを出せません');
        this.record(player.seat, { type: 'hint', t });
        player.hints += 1;
        if (this.mode !== 'solo') player.score = Math.max(0, player.score - HINT_COST);
        this.hintMarks[player.seat] = { version: this.version, symbol };
        this.log(`${player.name}：ヒント`);
        this.emit({ type: 'hint', seat: player.seat, symbol, t });
        return true;
    }

    finish(t) {
        this.phase = 'end';
        this.endT = t;
        const order = [...this.players].sort((a, b) => b.score - a.score || b.taken - a.taken || a.seat - b.seat);
        const standings = order.map(player => ({
            seat: player.seat,
            score: player.score,
            taken: player.taken,
            wrong: player.wrong,
            hints: player.hints,
            rank: 1 + this.players.filter(other => other.score > player.score).length
        }));
        const top = standings[0].score;
        // タイムアタックのタイムは、ヒント1回につき5秒足す
        const penalty = this.mode === 'solo' ? this.players[0].hints * HINT_TIME_MS : 0;
        this.result = {
            time: t + penalty,
            elapsed: t,
            standings,
            winners: standings.filter(entry => entry.score === top).map(entry => entry.seat)
        };
        this.log('真ん中の山がなくなったので終わり');
        this.emit({ type: 'end', t });
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

    // ===== 見る =====

    hintFor(seat) {
        const given = this.hintMarks[seat];
        return given && given.version === this.version ? given.symbol : null;
    }

    // その席の答え（自分のカードと真ん中のカードに共通のマーク）
    answerFor(seat) {
        const player = this.players[seat];
        return player && !this.isOver ? commonSymbol(player.top, this.center) : null;
    }

    // 席が今取れるか（t の時刻で）
    canClaim(seat, t) {
        const player = this.players[seat];
        return Boolean(player) && this.phase === 'play' && t >= player.lockUntil;
    }
}

export { CARDS, SYMBOL_NAMES };
